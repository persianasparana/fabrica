/**
 * Cliente HTTP do NÚCLEO DE PRODUTOS (:3070) — F3.
 *
 * Puxa o BOM (materiais com custo) por SKU+medida para ENRIQUECER a Saída de
 * Materiais da Ordem de Corte. É LEITURA e OPCIONAL: se o Núcleo estiver fora,
 * a env não estiver configurada, ou der qualquer erro, devolve null e a OC
 * segue exatamente como hoje (best-effort, NUNCA lança, NUNCA tem outbox —
 * não há efeito colateral a garantir). Auth por X-Service-Key (ADR-0008).
 */

const base = () => (process.env.PRODUTOS_API_BASE || 'http://127.0.0.1:3070/api/v1').replace(/\/+$/, '');
const chave = () => process.env.PRODUTOS_SERVICE_KEY || '';
export const habilitado = () => process.env.PRODUTOS_BOM_ENABLED === '1' && Boolean(chave());

// cache curto por sku|L|H (anti-N+1 numa OC de lote); vive só no processo
const cache = new Map();
const TTL = 60 * 1000;

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
