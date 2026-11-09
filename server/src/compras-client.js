/**
 * Cliente HTTP do COMPRAS (:3050) — P3 do planejamento de produção (06/11/2026;
 * espec docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.3). Auth por X-Service-Key
 * (`SERVICE_KEY_PCP` do Compras → ator `service:pcp`).
 *
 *  LEITURA (best-effort, nunca lança):
 *   · saldos(skus)              GET /integracao/estoque/saldos?skus=   → { sku: {saldo, reservado, em_oc, disponivel} | null } ou null
 *   · consultarSolicitacao(n)   GET /integracao/solicitacoes-compra/:numero
 *  ESCRITA (lança em falha — o chamador registra na OUTBOX `pcp_compras_pendencias`
 *  e o agendador reenvia; os dois endpoints do Compras são IDEMPOTENTES):
 *   · criarSolicitacao(payload) POST /integracao/solicitacoes-compra   (origem_ref único)
 *   · saidaProducao(payload)    POST /integracao/estoque/saida-producao (pedido+sku+plano único)
 */
import { q } from './db.js';

const base = () => (process.env.COMPRAS_API_BASE || 'http://127.0.0.1:3050/api/v1').replace(/\/+$/, '');
const chave = () => process.env.COMPRAS_SERVICE_KEY || '';
export const comprasHabilitado = () => Boolean(chave()) && process.env.COMPRAS_INTEGRACAO_ENABLED !== '0';

async function chamar(metodo, caminho, body, timeout = 15000) {
  const resp = await fetch(`${base()}${caminho}`, {
    method: metodo,
    headers: { 'X-Service-Key': chave(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeout),
  });
  let j = null;
  try { j = await resp.json(); } catch { /* sem corpo */ }
  if (!resp.ok) {
    const e = new Error(`Compras HTTP ${resp.status}${j && (j.message || j.error) ? ` — ${j.message || j.error}` : ''}`);
    e.status = resp.status; e.corpo = j;
    throw e;
  }
  return j;
}

/** saldo por sku do Núcleo (≤ 500 por chamada; devolve null se o Compras estiver fora/desligado) */
export async function saldos(skus) {
  if (!comprasHabilitado()) return null;
  const lista = [...new Set((skus || []).map((s) => String(s || '').trim()).filter(Boolean))];
  if (!lista.length) return {};
  const out = {};
  try {
    for (let i = 0; i < lista.length; i += 200) {
      const fatia = lista.slice(i, i + 200);
      const j = await chamar('GET', `/integracao/estoque/saldos?skus=${encodeURIComponent(fatia.join(','))}`, null, 10000);
      Object.assign(out, (j && j.data) || {});
    }
    return out;
  } catch (e) {
    console.warn(`[compras] saldos indisponíveis: ${e.message}`);
    return null;
  }
}

export async function consultarSolicitacao(numero) {
  if (!comprasHabilitado() || !numero) return null;
  try { const j = await chamar('GET', `/integracao/solicitacoes-compra/${encodeURIComponent(numero)}`, null, 8000); return j && j.data ? j.data : null; }
  catch { return null; }
}

export async function criarSolicitacao(payload) {
  if (!comprasHabilitado()) throw new Error('Integração com o Compras não configurada (COMPRAS_SERVICE_KEY)');
  const j = await chamar('POST', '/integracao/solicitacoes-compra', payload, 20000);
  return { criada: !!(j && j.criada), solicitacao: j && j.data };
}

export async function saidaProducao(payload) {
  if (!comprasHabilitado()) throw new Error('Integração com o Compras não configurada (COMPRAS_SERVICE_KEY)');
  const j = await chamar('POST', '/integracao/estoque/saida-producao', payload, 20000);
  return j && j.data;
}

// ─── OUTBOX `pcp_compras_pendencias` ─────────────────────────────────────────
// Toda escrita no Compras que falha (fora do ar, timeout, 5xx) vira pendência
// re-tentável; erro DETERMINÍSTICO (4xx que não seja 401/403/408/429) marca
// `bloqueada` e para de tentar — alguém precisa olhar.
const determinístico = (e) => e && e.status && e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status);

export async function registrarPendenciaCompras(tipo, chaveUnica, payload, erro) {
  await q(
    `INSERT INTO pcp_compras_pendencias (tipo, chave, payload, ultimo_erro)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (chave) DO UPDATE SET payload = EXCLUDED.payload, ultimo_erro = EXCLUDED.ultimo_erro, bloqueada = FALSE, tentativas = 0, updated_at = now()`,
    [tipo, String(chaveUnica), JSON.stringify(payload), String(erro || '').slice(0, 500)]
  );
}

/** envia 1 pendência; devolve { ok, resultado?, bloqueada? } */
async function enviarPendencia(p) {
  const payload = typeof p.payload === 'string' ? JSON.parse(p.payload) : p.payload;
  if (p.tipo === 'solicitacao') {
    const r = await criarSolicitacao(payload);
    if (r.solicitacao) {
      await q(`UPDATE pcp_requisicoes SET numero_sc = $2, status_sc = $3, enviada_em = now(), erro = NULL, updated_at = now() WHERE origem_ref = $1`,
        [payload.origem_ref, r.solicitacao.numero, r.solicitacao.status]).catch(() => {});
    }
    return r;
  }
  if (p.tipo === 'saida') {
    const r = await saidaProducao(payload);
    // só marca a peça como baixada quando o Compras baixou (ou já tinha baixado) ao
    // menos um sku — se NENHUM item tem de-para, a peça fica aberta para quando o
    // de-para for cadastrado (a baixa manual do pedido volta a tentar)
    const efetiva = r && ((r.baixadas || []).length || (r.repetidas || []).length);
    // marca a peça SÓ quando tudo baixou: com sku sem de-para, a peça fica aberta e a baixa manual reenvia a lista
    // inteira depois do cadastro (o Compras é idempotente por sku — reenviar é seguro)
    const completa = efetiva && !((r && r.sem_produto) || []).length;
    if (completa && payload.plano && /^peca:\d+$/.test(payload.plano)) {
      await q(`UPDATE pcp_pecas SET materiais_baixados_em = now(), updated_at = now() WHERE id = $1 AND materiais_baixados_em IS NULL`, [Number(payload.plano.slice(5))]).catch(() => {});
    }
    return { ...r, efetiva: !!efetiva, completa: !!completa };
  }
  throw new Error(`tipo de pendência desconhecido: ${p.tipo}`);
}

export async function drenarPendenciasCompras() {
  if (!comprasHabilitado()) return { processadas: 0 };
  const { rows } = await q(`SELECT id, tipo, chave, payload, tentativas FROM pcp_compras_pendencias WHERE NOT bloqueada ORDER BY updated_at LIMIT 50`);
  let ok = 0;
  for (const p of rows) {
    try {
      await enviarPendencia(p);
      await q(`DELETE FROM pcp_compras_pendencias WHERE id = $1`, [p.id]);
      ok++;
    } catch (e) {
      const bloq = determinístico(e);
      await q(`UPDATE pcp_compras_pendencias SET tentativas = tentativas + 1, ultimo_erro = $2, bloqueada = $3, updated_at = now() WHERE id = $1`,
        [p.id, String(e.message || e).slice(0, 500), bloq]);
      if (bloq) console.error(`[compras] pendência ${p.tipo} ${p.chave} BLOQUEADA (erro definitivo): ${e.message}`);
      else if (p.tentativas + 1 >= 5) console.error(`[compras] ATENÇÃO: ${p.tipo} ${p.chave} não chega ao Compras há ${p.tentativas + 1} tentativas — verifique o Compras.`);
    }
  }
  return { processadas: rows.length, reenviadas: ok };
}

let retryTimer = null;
/** Agendador do reenvio (boot + a cada COMPRAS_RETRY_MS, padrão 5 min). */
export function iniciarRetryCompras() {
  if (retryTimer || !comprasHabilitado()) return;
  const intervalo = Math.max(60_000, Number(process.env.COMPRAS_RETRY_MS) || 300_000);
  const rodar = () => drenarPendenciasCompras().catch((e) => console.warn(`[compras] Reenvio falhou: ${e.message}`));
  setTimeout(rodar, 20_000);
  retryTimer = setInterval(rodar, intervalo);
  retryTimer.unref?.();
}

/**
 * "Fire-and-forget" com outbox: tenta agora; falha TRANSITÓRIA vira pendência
 * (reenvio automático), falha DEFINITIVA vira pendência bloqueada (visível).
 * Devolve { ok, resultado?, pendente?, erro? } — nunca lança.
 */
export async function enviarComOutbox(tipo, chaveUnica, payload) {
  try {
    const resultado = await enviarPendencia({ tipo, payload });
    await q(`DELETE FROM pcp_compras_pendencias WHERE chave = $1`, [String(chaveUnica)]).catch(() => {});
    return { ok: true, resultado };
  } catch (e) {
    await registrarPendenciaCompras(tipo, chaveUnica, payload, e.message).catch((e2) => console.error(`[compras] falhou gravar pendência: ${e2.message}`));
    if (determinístico(e)) {
      await q(`UPDATE pcp_compras_pendencias SET bloqueada = TRUE WHERE chave = $1`, [String(chaveUnica)]).catch(() => {});
      return { ok: false, erro: e.message, bloqueada: true };
    }
    return { ok: false, erro: e.message, pendente: true };
  }
}
