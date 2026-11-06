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
import { buscarListaMateriais, listaMateriaisHabilitado, erroListaMateriais } from './produtos-client.js';

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
    const corpo = corpoDaPeca(base, peca, { ref: `${item.id}:${peca.id}`, ambiente: item.ambiente || undefined });
    Object.defineProperty(corpo, '__pedido', { value: item.pedido, enumerable: false }); // só para dividir em blocos (não vai ao Núcleo)
    payload.push(corpo);
  }
  return { pedidos: lista, itens, pecas, payload, itens_sem_spec: [...semSpec] };
}

/** chave de agregação de uma linha de material (a mesma do Núcleo) */
const chave = (m) => `${m.tipo}::${m.sku || String(m.descricao || '').toLowerCase()}`;

// O Núcleo aceita até 300 peças por lote (`lote_grande`). A P1 (necessidade do
// horizonte) passa disso com folga → blocos de até LOTE_MAX peças, fechados na
// FRONTEIRA DO PEDIDO (um pedido só se divide quando sozinho excede o bloco), e
// os blocos são MESCLADOS: materiais por chave (qtd/peças somadas, refs e
// origens unidas), tecido por coleção × cor × rolo, perfis por componente,
// tubos por Ø — metros/bobinas/barras/sobras SOMADOS por bloco (o aninhamento
// e o encaixe de barras não cruzam blocos: pode sobrar 1 bobina/barra a mais).
export const LOTE_MAX = 250;
export function dividirEmBlocos(payload, max = LOTE_MAX) {
  const blocos = [];
  let atual = [];
  let pedidoAtual = null;
  const pedidoDe = (pc) => String(pc.__pedido || '');
  for (const pc of payload) {
    const ped = pedidoDe(pc);
    if (atual.length && (atual.length >= max || (ped !== pedidoAtual && atual.length + contarPedido(payload, ped) > max && contarPedido(payload, ped) <= max))) {
      blocos.push(atual); atual = [];
    }
    atual.push(pc); pedidoAtual = ped;
  }
  if (atual.length) blocos.push(atual);
  return blocos;
}
const contarPedidoCache = new WeakMap();
function contarPedido(payload, ped) {
  let m = contarPedidoCache.get(payload);
  if (!m) { m = new Map(); for (const pc of payload) { const k = String(pc.__pedido || ''); m.set(k, (m.get(k) || 0) + 1); } contarPedidoCache.set(payload, m); }
  return m.get(ped) || 0;
}
const r4 = (v) => Math.round((Number(v) || 0) * 10000) / 10000;
function somar(mapa, k, linha, campos, listas) {
  if (!mapa.has(k)) { mapa.set(k, { ...linha }); for (const l of listas) mapa.get(k)[l] = [...(linha[l] || [])]; return; }
  const a = mapa.get(k);
  for (const c of campos) a[c] = r4((Number(a[c]) || 0) + (Number(linha[c]) || 0));
  for (const l of listas) for (const x of (linha[l] || [])) if (!a[l].includes(x)) a[l].push(x);
}
/** mescla as respostas (data) de vários blocos numa só */
export function mesclarRespostas(blocos) {
  if (blocos.length === 1) return blocos[0];
  const out = { pecas: [], avisos: [], totais: { pecas: 0, pecas_ok: 0, pecas_erro: 0, avulsos: 0 }, parametros: blocos[0].parametros };
  const mat = new Map(), tec = new Map(), perf = new Map(), tub = new Map();
  for (const d of blocos) {
    out.pecas.push(...(d.pecas || []));
    for (const a of (d.avisos || [])) if (!out.avisos.includes(a)) out.avisos.push(a);
    for (const k of Object.keys(out.totais)) out.totais[k] += Number(d.totais?.[k]) || 0;
    for (const m of (d.materiais || [])) somar(mat, chave(m), m, ['qtd', 'pecas'], ['refs', 'origens']);
    for (const t of (d.tecido || [])) somar(tec, `${t.colecao}::${t.cor || ''}::${t.largura_rolo || ''}`, t, ['metros', 'bobinas', 'sobra', 'pecas'], ['refs']);
    for (const x of (d.perfis || [])) somar(perf, `${x.sku || x.componente}`, x, ['cortes', 'metros', 'barras', 'sobra_m'], ['refs']);
    for (const t of (d.tubos || [])) somar(tub, `${t.tubo}::${t.corte || ''}`, t, ['cortes', 'metros', 'barras'], []);
  }
  out.materiais = [...mat.values()];
  out.tecido = [...tec.values()];
  out.tecido_totais = { metros: r4(out.tecido.reduce((s, t) => s + (Number(t.metros) || 0), 0)), bobinas: out.tecido.reduce((s, t) => s + (Number(t.bobinas) || 0), 0) };
  out.perfis = [...perf.values()];
  out.perfis_totais = { barras: out.perfis.reduce((s, x) => s + (Number(x.barras) || 0), 0), metros: r4(out.perfis.reduce((s, x) => s + (Number(x.metros) || 0), 0)) };
  out.tubos = [...tub.values()];
  out.avisos.push(`Lote de ${out.totais.pecas} peças calculado em ${blocos.length} blocos de até ${LOTE_MAX} (limite do Núcleo): bobinas e barras somadas por bloco — pode sobrar uma a mais do que num cálculo único.`);
  return out;
}

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
  // blocos em PARALELO (até 3 por vez — o Núcleo é Express, aguenta; o tempo de
  // parede cai a ~1/3 num horizonte de 500+ peças)
  const blocos = dividirEmBlocos(m.payload);
  const respostas = new Array(blocos.length).fill(null);
  for (let i = 0; i < blocos.length; i += 3) {
    const fatia = blocos.slice(i, i + 3);
    const rs = await Promise.all(fatia.map((b) => buscarListaMateriais(b)));
    rs.forEach((r, j) => { respostas[i + j] = r; });
    const falhou = rs.findIndex((r) => !r);
    if (falhou >= 0) {
      out.habilitado = false;
      out.motivo = `Núcleo de Produtos não respondeu a lista de materiais${erroListaMateriais() ? ` (${erroListaMateriais()})` : ''}${blocos.length > 1 ? ` — bloco ${i + falhou + 1}/${blocos.length}` : ''}`;
      return out;
    }
  }
  const resp = mesclarRespostas(respostas);
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

// ─── P3 do planejamento (06/11/2026) — sku do COMPRAS por linha de material ─────
// O de-para do Compras (`produtos.nucleo_sku`) é o sku do Núcleo: componente =
// sku do componente; TECIDO POR COR = `<sku do tecido>:<COR>` (sem cor = só o sku).
export function skuCompras(mat) {
  if (!mat || !mat.sku) return null;
  if (mat.tipo === 'tecido') {
    const cor = mat.cor || (mat.extra && mat.extra.cor) || null;
    return cor ? `${mat.sku}:${String(cor).trim().toUpperCase()}` : String(mat.sku);
  }
  return String(mat.sku);
}

/**
 * Materiais de UMA peça (para a baixa de produção na 1ª bipagem): consulta o
 * Núcleo só com essa peça. Devolve { pedido, ref, itens:[{sku, quantidade,
 * descricao, un}], sem_sku:[descricao] } ou null (Núcleo fora / peça não cota).
 */
export async function materiaisDaPecaParaBaixa(pecaId) {
  const { rows } = await q(`SELECT pp.id, i.pedido FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id WHERE pp.id = $1`, [Number(pecaId)]);
  if (!rows[0]) return null;
  const m = await montarPayloadPedidos([rows[0].pedido]);
  const ref = `${m.pecas.find((p) => Number(p.id) === Number(pecaId))?.item_id}:${pecaId}`;
  const corpo = m.payload.find((pc) => pc.ref === ref);
  if (!corpo) return null;
  const resp = await buscarListaMateriais([corpo]);
  const pc = resp && Array.isArray(resp.pecas) ? resp.pecas[0] : null;
  if (!pc || !pc.ok) return null;
  const agg = new Map(); const semSku = [];
  for (const mat of (pc.materiais || [])) {
    if (mat.tipo === 'servico' || !(Number(mat.qtd) > 0)) continue;
    const sku = skuCompras(mat);
    if (!sku) { semSku.push(mat.descricao || '?'); continue; }
    if (!agg.has(sku)) agg.set(sku, { sku, quantidade: 0, descricao: mat.descricao || sku, un: mat.un || null });
    agg.get(sku).quantidade = Math.round((agg.get(sku).quantidade + Number(mat.qtd)) * 10000) / 10000;
  }
  return { pedido: rows[0].pedido, ref, itens: [...agg.values()], sem_sku: semSku };
}
