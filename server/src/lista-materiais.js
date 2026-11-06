/**
 * LISTA DE MATERIAIS DE PRODUÇÃO de pedidos do PCP via NÚCLEO DE PRODUTOS
 * (:3070, `POST /lista-materiais`, v14.88) — P0 do planejamento de produção.
 *
 * Monta UMA peça por linha de `pcp_pecas` (medidas do PCP em cm → metros) com
 * a especificação da venda guardada em `pcp_itens.spec_nucleo` (liberação do
 * Comercial) + as colunas do item, chama o Núcleo em lote e devolve:
 *   · `data`     — a resposta do Núcleo (sem dinheiro): peças, materiais
 *                  agregados, tecido por coleção × cor, perfis em barras, tubos;
 *   · `por_item` — os materiais agregados POR ITEM do PCP (a Ficha imprime
 *                  por item) e as refs das peças.
 * Leitura, best-effort: Núcleo fora / chave ausente → `habilitado:false` com o
 * motivo (quem chama decide: a Ficha imprime sem a lista; a tela de
 * Necessidade de materiais avisa).
 */
import { q } from './db.js';
import { HttpError } from './util.js';
import { corpoDaPeca } from './nucleo-spec.js';
import { buscarListaMateriais, listaMateriaisHabilitado } from './produtos-client.js';

/** Itens + peças dos pedidos → payload do Núcleo (1 peça por linha de pcp_pecas). */
export async function montarPayloadPedidos(pedidos) {
  const lista = [...new Set((pedidos || []).map((p) => String(p || '').trim()).filter(Boolean))];
  if (!lista.length) throw new HttpError(422, 'Informe o(s) pedido(s)');
  const { rows: itens } = await q(
    `SELECT i.id, i.pedido, i.produto, i.produto_id, i.produto_sku, i.qnt, i.colecao, i.cor_tecido,
            i.cor_perfil, i.acionamento, i.ambiente, i.atributos, i.spec_nucleo, i.comercial_item_id,
            to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente, i.conclusao,
            p.produto_sku AS estrutura_sku
     FROM pcp_itens i LEFT JOIN pcp_produtos p ON p.id = i.produto_id
     WHERE i.pedido = ANY($1) ORDER BY i.pedido, i.id`, [lista]);
  const { rows: pecas } = await q(
    `SELECT pp.id, pp.item_id, pp.numero, pp.largura, pp.altura, pp.medidas, pp.cod_barras,
            to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     WHERE i.pedido = ANY($1) ORDER BY pp.item_id, pp.numero`, [lista]);
  const itemPorId = new Map(itens.map((i) => [Number(i.id), i]));
  const payload = [];
  const semSpec = new Set();
  for (const peca of pecas) {
    const item = itemPorId.get(Number(peca.item_id));
    if (!item) continue;
    const base = { ...item, produto_sku: item.produto_sku || item.estrutura_sku || null };
    if (!item.spec_nucleo) semSpec.add(Number(item.id));
    payload.push(corpoDaPeca(base, peca, { ref: `${item.id}:${peca.id}`, ambiente: item.ambiente || undefined }));
  }
  return { pedidos: lista, itens, pecas, payload, itens_sem_spec: [...semSpec] };
}

/** chave de agregação de uma linha de material (a mesma do Núcleo) */
const chave = (m) => `${m.tipo}::${m.sku || String(m.descricao || '').toLowerCase()}`;

/**
 * Lista de materiais dos pedidos. `{ habilitado, motivo?, pedidos, avisos,
 * data, por_item: { [item_id]: { pecas: n, materiais: [] } }, itens_sem_spec }`.
 */
export async function listaMateriaisDosPedidos(pedidos) {
  const m = await montarPayloadPedidos(pedidos);
  const out = {
    pedidos: m.pedidos, habilitado: listaMateriaisHabilitado(), motivo: null,
    itens: m.itens.length, pecas: m.pecas.length, itens_sem_spec: m.itens_sem_spec,
    avisos: [], data: null, por_item: {},
  };
  if (!out.habilitado) {
    out.motivo = 'Integração com o Núcleo de Produtos não configurada (PRODUTOS_SERVICE_KEY) — lista de materiais indisponível';
    return out;
  }
  if (!m.payload.length) { out.motivo = 'Pedido sem peças cadastradas'; return out; }
  if (m.itens_sem_spec.length) {
    out.avisos.push(`${m.itens_sem_spec.length} item(ns) sem a especificação do Comercial (pedido anterior ao planejamento ou entrada manual) — a lista usa só produto/coleção/medidas desses itens.`);
  }
  const resp = await buscarListaMateriais(m.payload);
  if (!resp) {
    out.habilitado = false;
    out.motivo = 'Núcleo de Produtos indisponível — lista de materiais não gerada';
    return out;
  }
  out.data = resp;
  out.avisos.push(...(resp.avisos || []));
  // agrega por ITEM do PCP (ref = "item:peca"; cada peça é 1 unidade)
  const porItem = {};
  for (const pc of (resp.pecas || [])) {
    const [itemId] = String(pc.ref || '').split(':');
    if (!itemId) continue;
    if (!porItem[itemId]) porItem[itemId] = { pecas: 0, pecas_erro: 0, erros: [], materiais: new Map(), avisos: [] };
    const agg = porItem[itemId];
    agg.pecas += 1;
    if (!pc.ok) { agg.pecas_erro += 1; if (pc.motivo && !agg.erros.includes(pc.motivo)) agg.erros.push(pc.motivo); continue; }
    for (const a of (pc.avisos || [])) if (!agg.avisos.includes(a)) agg.avisos.push(a);
    for (const mat of (pc.materiais || [])) {
      const k = chave(mat);
      if (!agg.materiais.has(k)) agg.materiais.set(k, { ...mat, qtd: 0 });
      agg.materiais.get(k).qtd += Number(mat.qtd) || 0;
    }
  }
  for (const [k, v] of Object.entries(porItem)) {
    out.por_item[k] = {
      pecas: v.pecas, pecas_erro: v.pecas_erro, erros: v.erros, avisos: v.avisos,
      materiais: [...v.materiais.values()]
        .map((x) => ({ ...x, qtd: Math.round(x.qtd * 10000) / 10000 }))
        .sort((a, b) => (a.tipo === b.tipo ? b.qtd - a.qtd : String(a.tipo).localeCompare(String(b.tipo)))),
    };
  }
  return out;
}
