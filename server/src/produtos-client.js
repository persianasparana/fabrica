/**
 * Cliente HTTP do NÚCLEO DE PRODUTOS (:3070) — F3 + Plano de Corte.
 *
 * Puxa o BOM (materiais com custo) por SKU+medida para ENRIQUECER a Saída de
 * Materiais da Ordem de Corte, e o PLANEJAMENTO DE CORTE em lote (impressão
 * por pedido). É LEITURA e OPCIONAL: se o Núcleo estiver fora, a env não
 * estiver configurada, ou der qualquer erro, devolve null/[] e o chamador
 * decide (best-effort, NUNCA lança, NUNCA tem outbox — não há efeito
 * colateral a garantir). Auth por X-Service-Key (ADR-0008).
 */

const base = () => (process.env.PRODUTOS_API_BASE || 'http://127.0.0.1:3070/api/v1').replace(/\/+$/, '');
const chave = () => process.env.PRODUTOS_SERVICE_KEY || '';
export const habilitado = () => process.env.PRODUTOS_BOM_ENABLED === '1' && Boolean(chave());

// cache curto por sku|L|H (anti-N+1 numa OC de lote); vive só no processo
const cache = new Map();
const TTL = 60 * 1000;

// ─── Planejamento de Corte (v8.8 do Núcleo) ─────────────────────────────────
// Habilitado quando a chave de serviço existe; PRODUTOS_PLANO_CORTE_ENABLED=0
// desliga sem tirar a chave (kill switch).
export const planoCorteHabilitado = () =>
  Boolean(chave()) && process.env.PRODUTOS_PLANO_CORTE_ENABLED !== '0';

/**
 * Plano de corte EM LOTE (1 chamada por pedido/impressão — sem cache).
 * `pecas` = [{ ref, produto_sku?, tipo?, colecao?, largura, altura (METROS),
 * modo?, box?, bando?, variante? }]. Retorna o array `data` do Núcleo ou
 * null em qualquer erro (o chamador decide o que fazer — aqui vira 502).
 */
export async function buscarPlanoCorte(pecas) {
  if (!planoCorteHabilitado() || !Array.isArray(pecas) || !pecas.length) return null;
  try {
    const resp = await fetch(`${base()}/plano-corte`, {
      method: 'POST',
      headers: { 'X-Service-Key': chave(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ pecas }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    if (!Array.isArray(j && j.data)) return null;
    // v09/08 — o Núcleo passou a mandar também o resumo de tecido/bobinas
    return { pecas: j.data, resumoTecido: Array.isArray(j.resumo_tecido) ? j.resumo_tecido : [] };
  } catch {
    return null;
  }
}

/** Variantes de corte (pro dropdown de override). Cache 60s; [] em erro. */
export async function buscarVariantesCorte() {
  if (!planoCorteHabilitado()) return [];
  const k = '__variantes_corte__';
  const hit = cache.get(k);
  if (hit && Date.now() - hit.em < TTL) return hit.val;
  try {
    const resp = await fetch(`${base()}/plano-corte/variantes`, {
      headers: { 'X-Service-Key': chave() },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return [];
    const j = await resp.json();
    const val = Array.isArray(j && j.data) ? j.data : [];
    cache.set(k, { em: Date.now(), val });
    return val;
  } catch {
    return [];
  }
}

/**
 * BOM de um produto para uma medida (METROS). Retorna
 * { custo_total, itens: [{ sku, descricao, unidade, quantidade, custo_unitario, custo_total }] }
 * ou null (não configurado / fora / sem sku / erro).
 */
export async function buscarBom(sku, larguraM, alturaM) {
  if (!habilitado() || !sku || !(larguraM > 0) || !(alturaM > 0)) return null;
  const k = `${sku}|${larguraM.toFixed(3)}|${alturaM.toFixed(3)}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.em < TTL) return hit.val;
  try {
    const url = `${base()}/catalogo/produtos/${encodeURIComponent(sku)}/bom?largura=${larguraM}&altura=${alturaM}`;
    const resp = await fetch(url, { headers: { 'X-Service-Key': chave() }, signal: AbortSignal.timeout(5000) });
    if (!resp.ok) { cache.set(k, { em: Date.now(), val: null }); return null; }
    const j = await resp.json();
    const val = j && j.data ? j.data : null;
    cache.set(k, { em: Date.now(), val });
    return val;
  } catch {
    cache.set(k, { em: Date.now(), val: null });
    return null;
  }
}
