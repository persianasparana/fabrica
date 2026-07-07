/**
 * Cliente HTTP do COMERCIAL (Agenda :3010) — compartilhado entre a rota
 * /api/comercial (avaliação do PCP) e os avanços AUTOMÁTICOS de estado do
 * ciclo do pedido (bipagem/expedição, Fase C).
 *
 * Auth serviço-a-serviço por X-Service-Key (ADR-0008): COMERCIAL_SERVICE_KEY
 * deve ser IDÊNTICA ao SERVICE_API_KEY do .env do Comercial.
 */
import { HttpError } from './util.js';

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
  if (!resp.ok) throw new HttpError(resp.status, payload.message || `Comercial respondeu HTTP ${resp.status}`);
  return payload;
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

/**
 * Variante "fire-and-forget" para caminhos quentes (bipagem): nunca lança e
 * não atrasa a resposta — falha vira um warn no log.
 */
export function avancarPedidoSilencioso(codigo, alvo, quem) {
  avancarPedidoPorCodigo(codigo, alvo, quem).then((r) => {
    if (r.ok && r.para === alvo && r.de !== alvo && r.motivo !== 'ja_avancado') {
      console.log(`[ciclo] Pedido ${codigo}: ${r.de} → ${r.para} (automático)`);
    }
  }).catch((e) => {
    console.warn(`[ciclo] Falha ao avançar ${codigo} para ${alvo}: ${e.message}`);
  });
}
