/**
 * Cliente HTTP do COMERCIAL (Agenda :3010) — compartilhado entre a rota
 * /api/comercial (avaliação do PCP) e os avanços AUTOMÁTICOS de estado do
 * ciclo do pedido (bipagem/expedição, Fase C).
 *
 * Auth serviço-a-serviço por X-Service-Key (ADR-0008): COMERCIAL_SERVICE_KEY
 * deve ser IDÊNTICA ao SERVICE_API_KEY do .env do Comercial.
 */
import { Readable } from 'node:stream';
import { HttpError } from './util.js';
import { q } from './db.js';

const base = () => (process.env.COMERCIAL_API_BASE || 'http://127.0.0.1:3010').replace(/\/+$/, '');
const chave = () => process.env.COMERCIAL_SERVICE_KEY || '';
export const configurado = () => Boolean(base() && chave());

export async function chamar(metodo, caminho, body) {
  if (!configurado()) {
    throw new HttpError(503, 'Integração com o Comercial não configurada (COMERCIAL_API_BASE/COMERCIAL_SERVICE_KEY)');
  }
  let resp;
  try {
    resp = await fetch(`${base()}${caminho}`, {
      method: metodo,
      headers: {
        'X-Service-Key': chave(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new HttpError(502, `Comercial inacessível: ${err.message}`);
  }
  const texto = await resp.text();
  let payload;
  try { payload = texto ? JSON.parse(texto) : {}; } catch { payload = { raw: texto }; }
  if (!resp.ok) {
    // NUNCA repassar 401/403 do Comercial ao navegador: o frontend trata 401
    // como "sessão caiu" e desloga o usuário (bug real, 07/07/2026). Chave de
    // serviço errada é problema de INTEGRAÇÃO (502), não de autenticação.
    if (resp.status === 401 || resp.status === 403) {
      throw new HttpError(502,
        'O Comercial recusou a chave de serviço (X-Service-Key). Confira se COMERCIAL_SERVICE_KEY no .env da fábrica é IDÊNTICA ao SERVICE_API_KEY do .env do Comercial e reinicie o fabrica-server.');
    }
    throw new HttpError(resp.status, payload.message || `Comercial respondeu HTTP ${resp.status}`);
  }
  return payload;
}

/**
 * Requisição BINÁRIA (GET) ao Comercial — usada pelo proxy dos desenhos de
 * fabricação/instalação (a CSP do frontend só permite imgSrc 'self', então a
 * imagem/PDF passa por aqui em vez de o navegador falar direto com a Agenda).
 * Devolve { status, headers, stream } SEM consumir o corpo (streaming);
 * timeout maior que o do chamar() por serem arquivos, não JSON.
 */
export async function baixarBinario(caminho) {
  if (!configurado()) {
    throw new HttpError(503, 'Integração com o Comercial não configurada (COMERCIAL_API_BASE/COMERCIAL_SERVICE_KEY)');
  }
  let resp;
  try {
    resp = await fetch(`${base()}${caminho}`, {
      method: 'GET',
      headers: { 'X-Service-Key': chave() },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new HttpError(502, `Comercial inacessível: ${err.message}`);
  }
  return {
    status: resp.status,
    headers: resp.headers,
    stream: resp.body ? Readable.fromWeb(resp.body) : null,
  };
}

/** É um pedido do ciclo federado (importado do Comercial)? */
export const ehPedidoComercial = (codigo) => /^PED-/i.test(String(codigo || '').trim());

// Cadeia fabril do ciclo (docs/CICLO-DO-PEDIDO.md). LIBERADO_PRODUCAO e o
// legado PENDENTE_PRODUCAO são os pontos de partida válidos.
const CADEIA = ['EM_PRODUCAO', 'EMBALADO', 'NA_EXPEDICAO'];
const PARTIDAS = ['LIBERADO_PRODUCAO', 'PENDENTE_PRODUCAO'];

/**
 * Avança o pedido federado até `alvo`, passando pelos status intermediários
 * (ex.: LIBERADO_PRODUCAO → EM_PRODUCAO → EMBALADO). No-op se o pedido já
 * está no alvo ou além; aborta em silêncio se o status atual está fora da
 * cadeia fabril (ex.: EM_ANALISE_PCP — nunca força transição indevida).
 * @returns { ok, de, para, motivo? }
 */
export async function avancarPedidoPorCodigo(codigo, alvo, quem = 'PCP (automático)') {
  if (!ehPedidoComercial(codigo)) return { ok: false, motivo: 'nao_e_pedido_comercial' };
  if (!CADEIA.includes(alvo)) return { ok: false, motivo: 'alvo_invalido' };
  if (!configurado()) return { ok: false, motivo: 'integracao_nao_configurada' };

  const lista = await chamar('GET', `/pedidos?codigo=${encodeURIComponent(String(codigo).trim())}`);
  const pedidos = Array.isArray(lista) ? lista : (lista.data ?? []);
  const pedido = pedidos[0];
  if (!pedido) return { ok: false, motivo: 'pedido_nao_encontrado' };

  const atual = pedido.pedidoStatus;
  const posAtual = PARTIDAS.includes(atual) ? -1 : CADEIA.indexOf(atual);
  const posAlvo = CADEIA.indexOf(alvo);
  if (posAtual === posAlvo) return { ok: true, de: atual, para: atual };
  if (posAtual > posAlvo) return { ok: true, de: atual, para: atual, motivo: 'ja_avancado' };
  if (posAtual === -1 && !PARTIDAS.includes(atual)) {
    return { ok: false, de: atual, motivo: 'fora_da_cadeia_fabril' };
  }

  for (let i = posAtual + 1; i <= posAlvo; i++) {
    await chamar('PATCH', `/pedidos/${encodeURIComponent(pedido.id)}/status`, {
      status: CADEIA[i],
      analisadoPor: quem,
    });
  }
  return { ok: true, de: atual, para: alvo };
}

// ─── Outbox do ciclo (norma de revisão, lente 2 — saga/pendência) ────────────
// Falha TRANSITÓRIA (Comercial fora, timeout, chave) não pode perder o avanço:
// registra em pcp_ciclo_pendencias e o agendador re-tenta. Motivos
// determinísticos (fora da cadeia, pedido inexistente) não entram — nunca
// teriam sucesso.

/** Registra/atualiza a pendência (1 por pedido; mantém o alvo mais adiante). */
export async function registrarPendenciaCiclo(pedido, alvo, quem, erro) {
  await q(
    `INSERT INTO pcp_ciclo_pendencias (pedido, alvo, quem, ultimo_erro)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (pedido) DO UPDATE SET
       alvo = CASE
                WHEN pcp_ciclo_pendencias.alvo = 'NA_EXPEDICAO' THEN pcp_ciclo_pendencias.alvo
                WHEN EXCLUDED.alvo = 'NA_EXPEDICAO' THEN EXCLUDED.alvo
                WHEN pcp_ciclo_pendencias.alvo = 'EMBALADO' THEN pcp_ciclo_pendencias.alvo
                ELSE EXCLUDED.alvo
              END,
       quem = EXCLUDED.quem,
       ultimo_erro = EXCLUDED.ultimo_erro,
       updated_at = now()`,
    [String(pedido), alvo, quem || null, String(erro || '').slice(0, 500)]
  );
}

/** Re-tenta as pendências acumuladas. Chamado no boot e pelo agendador. */
export async function drenarPendenciasCiclo() {
  if (!configurado()) return { processadas: 0 };
  const { rows } = await q(
    `SELECT pedido, alvo, quem, tentativas FROM pcp_ciclo_pendencias ORDER BY updated_at LIMIT 20`
  );
  let ok = 0;
  for (const p of rows) {
    try {
      const r = await avancarPedidoPorCodigo(p.pedido, p.alvo, p.quem || 'PCP (reenvio automático)');
      if (r.ok || ['fora_da_cadeia_fabril', 'pedido_nao_encontrado', 'nao_e_pedido_comercial', 'alvo_invalido'].includes(r.motivo)) {
        // sucesso, já estava adiante, ou nunca vai ter sucesso → sai da fila
        await q(`DELETE FROM pcp_ciclo_pendencias WHERE pedido = $1`, [p.pedido]);
        if (r.ok && r.de !== r.para) { ok++; console.log(`[ciclo] Reenvio OK: ${p.pedido} → ${p.alvo}`); }
      } else {
        await q(`UPDATE pcp_ciclo_pendencias SET tentativas = tentativas + 1, ultimo_erro = $2, updated_at = now() WHERE pedido = $1`,
          [p.pedido, r.motivo || 'motivo desconhecido']);
      }
    } catch (e) {
      await q(`UPDATE pcp_ciclo_pendencias SET tentativas = tentativas + 1, ultimo_erro = $2, updated_at = now() WHERE pedido = $1`,
        [p.pedido, String(e.message || e).slice(0, 500)]);
      if (p.tentativas + 1 >= 5) {
        console.error(`[ciclo] ATENÇÃO: pedido ${p.pedido} não avança para ${p.alvo} há ${p.tentativas + 1} tentativas — verifique o Comercial.`);
      }
    }
  }
  return { processadas: rows.length, reenviadas: ok };
}

let retryTimer = null;
/** Agendador do reenvio (boot + a cada CICLO_RETRY_MS, padrão 5 min). */
export function iniciarRetryCiclo() {
  if (retryTimer) return;
  const intervalo = Math.max(60_000, Number(process.env.CICLO_RETRY_MS) || 300_000);
  const rodar = () => drenarPendenciasCiclo().catch((e) => console.warn(`[ciclo] Reenvio falhou: ${e.message}`));
  setTimeout(rodar, 15_000);                     // primeiro reenvio pós-boot
  retryTimer = setInterval(rodar, intervalo);
  retryTimer.unref?.();
}

/**
 * Variante "fire-and-forget" para caminhos quentes (bipagem): nunca lança e
 * não atrasa a resposta — falha TRANSITÓRIA vira pendência re-tentável
 * (outbox), não só um warn perdido no log.
 */
export function avancarPedidoSilencioso(codigo, alvo, quem) {
  avancarPedidoPorCodigo(codigo, alvo, quem).then((r) => {
    if (r.ok && r.para === alvo && r.de !== alvo && r.motivo !== 'ja_avancado') {
      console.log(`[ciclo] Pedido ${codigo}: ${r.de} → ${r.para} (automático)`);
    }
    if (r.ok) q(`DELETE FROM pcp_ciclo_pendencias WHERE pedido = $1`, [String(codigo)]).catch(() => {});
  }).catch((e) => {
    console.warn(`[ciclo] Falha ao avançar ${codigo} para ${alvo}: ${e.message} — registrado para reenvio`);
    registrarPendenciaCiclo(codigo, alvo, quem, e.message).catch((e2) =>
      console.error(`[ciclo] Não consegui registrar a pendência de ${codigo}: ${e2.message}`));
  });
}
