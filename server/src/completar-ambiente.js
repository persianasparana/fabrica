/**
 * COMPLETA o AMBIENTE das peças JÁ NA FILA, relendo o pedido no COMERCIAL
 * (26/11/2026).
 *
 * Por que existe: até aqui a liberação gravava `pcp_itens.ambiente` a partir da
 * coluna de texto `item.ambiente` do Comercial — que é legada e vem NULA nos
 * orçamentos montados com ambientes (o item traz `ambienteId` e o nome mora em
 * `pedido.ambientes[]`). Resultado: Ficha de Produção, etiqueta e Plano de
 * Corte saíam sem ambiente ("(sem ambiente)"). A liberação passou a resolver o
 * nome pelo vínculo (`nucleo-spec.js ambienteDoItemComercial`); aqui o mesmo é
 * feito para as peças liberadas ANTES disso.
 *
 * Seguro por construção:
 *  · leitura no Comercial (`GET /pedidos/:id`, X-Service-Key) — nada é escrito lá;
 *  · no PCP só preenche `ambiente` onde está VAZIO (o que foi digitado no modal
 *    "Ver" da fila nunca é sobrescrito; rodar de novo não muda nada);
 *  · Comercial fora / pedido apagado / item sem ambiente lá → o item fica como
 *    está e entra na contagem (rodar de novo depois resolve).
 */
import { q } from './db.js';
import { chamar } from './comercial-client.js';
import { mapaDeAmbientesComercial, ambienteDoItemComercial } from './nucleo-spec.js';

/**
 * PURO — o que fazer com UM item do PCP diante do item do Comercial.
 * @returns { ambiente } para gravar, ou { motivo } quando não dá
 */
export function ambienteParaCompletar(ambienteAtual, itemComercial, mapaAmbientes) {
  if (String(ambienteAtual == null ? '' : ambienteAtual).trim()) return { motivo: 'ja_tem' };
  if (!itemComercial || typeof itemComercial !== 'object') return { motivo: 'item_nao_esta_no_pedido' };
  const nome = ambienteDoItemComercial(itemComercial, mapaAmbientes);
  if (!nome) return { motivo: 'sem_ambiente_no_comercial' };
  return { ambiente: nome };
}

/**
 * Completa os itens com o ambiente vazio. `{ pedidos?: [PED-…], incluirConcluidos?, simular? }`
 * @returns { pendentes, completados, pedidos, por_motivo: {motivo: n}, detalhes: [{pedido, item_id, acao}], erros: [{pedido, erro}] }
 */
export async function completarAmbiente({ pedidos = null, incluirConcluidos = false, simular = false } = {}) {
  const params = [];
  let filtro = `btrim(COALESCE(i.ambiente, '')) = '' AND i.comercial_item_id IS NOT NULL AND btrim(COALESCE(i.pedido, '')) <> ''`;
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
    catch (e) {
      // 4xx do Comercial = o pedido não existe mais lá (apagado, id inválido): definitivo, não adianta
      // tentar de novo. Rede fora / chave recusada / 5xx (502 no cliente) = tentar depois.
      const definitivo = [400, 404, 410, 422].includes(Number(e && e.status));
      const motivo = definitivo ? 'pedido_nao_esta_no_comercial' : 'comercial_nao_respondeu';
      out.erros.push({ pedido, erro: e.message, definitivo });
      for (const it of itens) { conta(motivo); out.detalhes.push({ pedido, item_id: Number(it.id), acao: motivo }); }
      continue;
    }
    const mapa = mapaDeAmbientesComercial(detalhe && detalhe.ambientes);
    const porId = new Map((Array.isArray(detalhe && detalhe.itens) ? detalhe.itens : []).map((x) => [String(x.id), x]));
    for (const it of itens) {
      const r = ambienteParaCompletar(it.ambiente, porId.get(String(it.comercial_item_id)), mapa);
      if (!r.ambiente) { conta(r.motivo); out.detalhes.push({ pedido, item_id: Number(it.id), acao: r.motivo }); continue; }
      if (!simular) {
        // só preenche se continua vazio (corrida com uma edição no modal "Ver" ou outra execução)
        await q(
          `UPDATE pcp_itens SET ambiente = $2, updated_at = now() WHERE id = $1 AND btrim(COALESCE(ambiente, '')) = ''`,
          [Number(it.id), r.ambiente]);
      }
      out.completados += 1;
      conta('completado');
      out.detalhes.push({ pedido, item_id: Number(it.id), acao: 'completado', ambiente: r.ambiente });
    }
  }
  return out;
}
