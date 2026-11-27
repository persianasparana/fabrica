/**
 * RELÊ o AMBIENTE das peças JÁ NA FILA no pedido do COMERCIAL (26/11 e 27/11/2026).
 *
 * 26/11 — a liberação gravava a coluna de texto `ambiente` do item do Comercial, nula em
 * todo pedido montado com ambientes (o nome mora em `pedido.ambientes[]`, pelo
 * `ambienteId`): as peças ficavam sem ambiente e o plano de corte do tecido do Núcleo
 * tratava o pedido inteiro como um ambiente só.
 *
 * 27/11 — pedido do cliente (proposta 2026/1348): quando o vendedor usa os ambientes do
 * pedido como agrupamento ("PARTE 1…8") e escreve o cômodo no Ambiente da própria peça, o
 * cômodo é o da PEÇA. A liberação passou a gravar o texto da peça em `ambiente`, o bloco
 * em `grupo_pedido` e a origem em `ambiente_origem`; as peças liberadas ANTES ficaram com
 * o nome do bloco em `ambiente` e sem as duas colunas novas — este módulo as completa.
 *
 * Quem entra: item vindo do Comercial com `ambiente_origem` NULO (nunca relido).
 *
 * Seguro por construção:
 *  · leitura no Comercial (`GET /pedidos/:id`, X-Service-Key) — nada é escrito lá;
 *  · no PCP o `ambiente` só é TROCADO quando está vazio ou é o nome do bloco do pedido (o
 *    que a própria liberação gravou). O que alguém digitou no modal "Ver" da fila fica —
 *    só ganha o grupo e a marca de origem. Depois de relido o item não entra de novo
 *    (idempotente);
 *  · Comercial fora / pedido apagado / item fora do pedido → o item fica como está e entra
 *    na contagem (rodar de novo depois resolve).
 */
import { q } from './db.js';
import { chamar } from './comercial-client.js';
import { ambienteDoItemComercial, ambienteParaReler } from './nucleo-spec.js';

/**
 * PURO (26/11) — só PREENCHE o ambiente vazio com o do bloco. Mantido para quem ainda o
 * chama; a decisão completa (texto da peça, grupo, origem) é `ambienteParaReler`.
 * @returns { ambiente } para gravar, ou { motivo } quando não há o que fazer
 */
export function ambienteParaCompletar(ambienteAtual, itemComercial, ambientes) {
  if (String(ambienteAtual == null ? '' : ambienteAtual).trim()) return { motivo: 'ja_tem' };
  if (!itemComercial || typeof itemComercial !== 'object') return { motivo: 'item_nao_esta_no_pedido' };
  const nome = ambienteDoItemComercial(itemComercial, ambientes);
  if (!nome) return { motivo: 'sem_ambiente_no_comercial' };
  return { ambiente: nome.slice(0, 120) };
}

/**
 * Relê os itens ainda não relidos. `{ pedidos?: [PED-…], incluirConcluidos?, simular? }`
 * @returns { pendentes, completados, trocados, pedidos, por_motivo: {motivo: n},
 *            detalhes: [{pedido, item_id, acao, ambiente?, antes?, grupo_pedido?, origem?}], erros: [{pedido, erro}] }
 *   `completados` = itens que ganharam grupo/origem · `trocados` = desses, os que mudaram de `ambiente`
 */
export async function completarAmbiente({ pedidos = null, incluirConcluidos = false, simular = false } = {}) {
  const params = [];
  let filtro = 'i.ambiente_origem IS NULL AND i.comercial_item_id IS NOT NULL';
  if (!incluirConcluidos) filtro += ' AND i.conclusao IS NULL';
  if (Array.isArray(pedidos) && pedidos.length) filtro += ` AND i.pedido = ANY($${params.push(pedidos.map(String))})`;
  const { rows } = await q(
    `SELECT i.id, i.pedido, i.comercial_item_id, i.ambiente, i.grupo_pedido, i.ambiente_origem, pi.comercial_id
     FROM pcp_itens i LEFT JOIN pcp_pedido_info pi ON pi.pedido = i.pedido
     WHERE ${filtro} ORDER BY i.pedido, i.id`, params);
  const out = { pendentes: rows.length, completados: 0, trocados: 0, pedidos: 0, por_motivo: {}, detalhes: [], erros: [], simulado: !!simular };
  const conta = (m) => { out.por_motivo[m] = (out.por_motivo[m] || 0) + 1; };
  const porPedido = new Map();
  for (const r of rows) { if (!porPedido.has(r.pedido)) porPedido.set(r.pedido, []); porPedido.get(r.pedido).push(r); }
  out.pedidos = porPedido.size;
  for (const [pedido, itens] of porPedido) {
    const comercialId = itens[0].comercial_id;
    if (!comercialId) { for (const it of itens) { conta('pedido_sem_id_do_comercial'); out.detalhes.push({ pedido, item_id: Number(it.id), acao: 'pedido_sem_id_do_comercial' }); } continue; }
    let detalhe;
    try { detalhe = await chamar('GET', `/pedidos/${encodeURIComponent(comercialId)}`); }
    catch (e) { out.erros.push({ pedido, erro: e.message }); for (const it of itens) conta('comercial_nao_respondeu'); continue; }
    const porId = new Map((Array.isArray(detalhe && detalhe.itens) ? detalhe.itens : []).map((x) => [String(x.id), x]));
    const ambientes = Array.isArray(detalhe && detalhe.ambientes) ? detalhe.ambientes : [];
    for (const it of itens) {
      const r = ambienteParaReler(it, porId.get(String(it.comercial_item_id)), ambientes);
      if (r.motivo) { conta(r.motivo); out.detalhes.push({ pedido, item_id: Number(it.id), acao: r.motivo }); continue; }
      if (!simular) {
        // só quem ainda não foi relido (corrida com outra execução ou com uma edição no modal Ver)
        await q(
          `UPDATE pcp_itens SET ambiente = $2, grupo_pedido = $3, ambiente_origem = $4, updated_at = now()
           WHERE id = $1 AND ambiente_origem IS NULL`,
          [Number(it.id), r.ambiente, r.grupo_pedido, r.ambiente_origem]);
      }
      out.completados += 1;
      const acao = r.trocou ? 'trocado' : 'marcado';
      if (r.trocou) out.trocados += 1;
      conta(acao);
      out.detalhes.push({
        pedido, item_id: Number(it.id), acao, ambiente: r.ambiente, grupo_pedido: r.grupo_pedido, origem: r.ambiente_origem,
        ...(r.trocou ? { antes: it.ambiente || null } : {}),
      });
    }
  }
  return out;
}
