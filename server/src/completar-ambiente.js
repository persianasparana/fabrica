/**
 * COMPLETA o AMBIENTE das peças JÁ NA FILA relendo o pedido no COMERCIAL (26/11/2026).
 *
 * Por que existe: até 26/11 a liberação gravava a coluna de texto `ambiente` do
 * item do Comercial — que é LEGADA e vem nula em todo pedido montado com
 * ambientes (o nome mora em `pedido.ambientes[]`, pelo `ambienteId` do item).
 * As peças liberadas antes ficaram sem ambiente: a Ficha e a etiqueta não o
 * mostram e, na lista de materiais, o Núcleo (v14.98 — consumo de tecido pelo
 * plano do pedido, UMA largura de rolo por ambiente) trata o pedido inteiro
 * como um ambiente só — o tecido do pedido todo sai forçado da mesma largura.
 *
 * Seguro por construção:
 *  · leitura no Comercial (`GET /pedidos/:id`, X-Service-Key) — nada é escrito lá;
 *  · no PCP só preenche `pcp_itens.ambiente` onde ele está VAZIO (o ambiente que
 *    alguém digitou no modal "Ver" da fila nunca é trocado; idempotente);
 *  · Comercial fora / pedido apagado / item sem ambiente lá → o item fica como
 *    está e entra na contagem (rodar de novo depois resolve).
 */
import { q } from './db.js';
import { chamar } from './comercial-client.js';
import { ambienteDoItemComercial } from './nucleo-spec.js';

/**
 * PURO — o que fazer com UM item do PCP diante do item do Comercial.
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
 * Completa os itens sem ambiente. `{ pedidos?: [PED-…], incluirConcluidos?, simular? }`
 * @returns { pendentes, completados, pedidos, por_motivo: {motivo: n}, detalhes: [{pedido, item_id, acao, ambiente?}], erros: [{pedido, erro}] }
 */
export async function completarAmbiente({ pedidos = null, incluirConcluidos = false, simular = false } = {}) {
  const params = [];
  let filtro = `btrim(COALESCE(i.ambiente, '')) = '' AND i.comercial_item_id IS NOT NULL`;
  if (!incluirConcluidos) filtro += ' AND i.conclusao IS NULL';
  if (Array.isArray(pedidos) && pedidos.length) filtro += ` AND i.pedido = ANY($${params.push(pedidos.map(String))})`;
  const { rows } = await q(
    `SELECT i.id, i.pedido, i.comercial_item_id, i.ambiente, pi.comercial_id
     FROM pcp_itens i LEFT JOIN pcp_pedido_info pi ON pi.pedido = i.pedido
     WHERE ${filtro} ORDER BY i.pedido, i.id`, params);
  const out = { pendentes: rows.length, completados: 0, pedidos: 0, por_motivo: {}, detalhes: [], erros: [], simulado: !!simular };
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
      const r = ambienteParaCompletar(it.ambiente, porId.get(String(it.comercial_item_id)), ambientes);
      if (!r.ambiente) { conta(r.motivo); out.detalhes.push({ pedido, item_id: Number(it.id), acao: r.motivo }); continue; }
      if (!simular) {
        // só preenche, e só se continua vazio (corrida com outra execução ou com uma edição no modal Ver)
        await q(
          `UPDATE pcp_itens SET ambiente = $2, updated_at = now()
           WHERE id = $1 AND btrim(COALESCE(ambiente, '')) = ''`,
          [Number(it.id), r.ambiente]);
      }
      out.completados += 1;
      conta('completado');
      out.detalhes.push({ pedido, item_id: Number(it.id), acao: 'completado', ambiente: r.ambiente });
    }
  }
  return out;
}
