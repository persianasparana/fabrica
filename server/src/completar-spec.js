/**
 * COMPLETA a especificação das peças JÁ NA FILA com `cotacao` — como a peça foi
 * cotada no Motor (seleção automática / somente tecido / produto do tipo + tubo
 * equiparado) — relendo o pedido no COMERCIAL (25/11/2026).
 *
 * Por que existe: a lista de materiais passou a montar o corpo COMO A VENDA
 * COTOU (`nucleo-spec.js`), e quem sabe isso é o cadastro "Tipos de peça" do
 * Comercial, que chega no item do pedido em `nucleoCotacao` (Comercial
 * v2.140.1). Peça liberada ANTES disso tem a spec sem a chave: a lista dela
 * segue pelo sku gravado (tubo 47 na peça da linha 53; troca de tela como peça
 * inteira). Aqui a chave é acrescentada — SÓ ela, só onde falta.
 *
 * Seguro por construção:
 *  · leitura no Comercial (`GET /pedidos/:id`, X-Service-Key) — nada é escrito lá;
 *  · no PCP só acrescenta `spec_nucleo.cotacao` onde a chave NÃO existe
 *    (idempotente; rodar de novo não muda nada; nunca toca produto/medidas);
 *  · Comercial fora / anterior à v2.140.1 / pedido apagado → o item fica como
 *    está e entra na contagem (rodar de novo depois resolve).
 */
import { q } from './db.js';
import { chamar } from './comercial-client.js';
import { cotacaoDoItemComercial } from './nucleo-spec.js';

/**
 * PURO — o que fazer com UM item do PCP diante do item do Comercial.
 * @returns { cotacao } para gravar, ou { motivo } quando não dá
 */
export function cotacaoParaCompletar(spec, itemComercial) {
  if (!spec || typeof spec !== 'object') return { motivo: 'sem_spec' };
  if (spec.cotacao && typeof spec.cotacao === 'object') return { motivo: 'ja_tem' };
  if (!itemComercial || typeof itemComercial !== 'object') return { motivo: 'item_nao_esta_no_pedido' };
  const cot = cotacaoDoItemComercial(itemComercial);
  if (!cot) return { motivo: 'comercial_sem_o_campo' };
  // o item mudou de TIPO no Comercial depois da liberação? o cadastro do tipo
  // novo não diz como a peça LIBERADA foi cotada — não completa (fica o sku gravado)
  const tipoPcp = String(spec.tipo || '').trim();
  const tipoHoje = String(itemComercial.tipo || '').trim();
  if (tipoPcp && tipoHoje && tipoPcp !== tipoHoje) return { motivo: 'tipo_mudou_no_comercial' };
  return { cotacao: cot };
}

/**
 * Completa os itens pendentes. `{ pedidos?: [PED-…], incluirConcluidos?, simular? }`
 * @returns { pendentes, completados, pedidos, por_motivo: {motivo: n}, detalhes: [{pedido, item_id, acao}] , erros: [{pedido, erro}] }
 */
export async function completarSpecNucleo({ pedidos = null, incluirConcluidos = false, simular = false } = {}) {
  const params = [];
  let filtro = `i.spec_nucleo IS NOT NULL AND NOT (i.spec_nucleo ? 'cotacao') AND i.comercial_item_id IS NOT NULL`;
  if (!incluirConcluidos) filtro += ' AND i.conclusao IS NULL';
  if (Array.isArray(pedidos) && pedidos.length) filtro += ` AND i.pedido = ANY($${params.push(pedidos.map(String))})`;
  const { rows } = await q(
    `SELECT i.id, i.pedido, i.comercial_item_id, i.spec_nucleo, pi.comercial_id
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
    for (const it of itens) {
      const r = cotacaoParaCompletar(it.spec_nucleo, porId.get(String(it.comercial_item_id)));
      if (!r.cotacao) { conta(r.motivo); out.detalhes.push({ pedido, item_id: Number(it.id), acao: r.motivo }); continue; }
      if (!simular) {
        // só acrescenta a chave, e só se ela continua faltando (corrida com outra execução)
        await q(
          `UPDATE pcp_itens SET spec_nucleo = spec_nucleo || jsonb_build_object('cotacao', $2::jsonb), updated_at = now()
           WHERE id = $1 AND spec_nucleo IS NOT NULL AND NOT (spec_nucleo ? 'cotacao')`,
          [Number(it.id), JSON.stringify(r.cotacao)]);
      }
      out.completados += 1;
      conta('completado');
      out.detalhes.push({ pedido, item_id: Number(it.id), acao: 'completado', cotacao: r.cotacao });
    }
  }
  return out;
}
