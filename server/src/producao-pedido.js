/**
 * PRODUÇÃO POR ETAPAS do pedido — a parte que lê o banco e o Núcleo (27/11/2026).
 * A regra (o que entra em cada documento) é `producao.js`, puro.
 */
import { q } from './db.js';
import { HttpError } from './util.js';
import { calcularPlanoNucleo } from './ordem-corte-nucleo.js';
import { listaMateriaisDosPedidos } from './lista-materiais.js';
import { planoCorteHabilitado } from './produtos-client.js';
import { montarProducao, resumoDasPartes, parteDoItem, comodoDoItem } from './producao.js';

/** itens, peças (com as etapas por setor) e setores do pedido — só leitura */
export async function filaDoPedido(pedido) {
  const { rows: itens } = await q(
    `SELECT i.id, i.produto, i.colecao, i.cor_tecido, i.cor_perfil, i.acionamento, i.ambiente, i.grupo_pedido,
            i.ambiente_origem, i.observacoes, i.atributos, i.qnt, i.cliente, i.prioridade,
            to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente
     FROM pcp_itens i WHERE i.pedido = $1 ORDER BY i.id`, [pedido]);
  const { rows: pecas } = await q(
    `SELECT pp.id, pp.item_id, pp.numero, pp.cod_barras, pp.largura, pp.altura, pp.gaveta_id,
            to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     WHERE i.pedido = $1 ORDER BY pp.item_id, pp.numero`, [pedido]);
  const { rows: etapas } = await q(
    `SELECT e.peca_id, e.setor_id, e.inicio, e.fim
     FROM pcp_peca_etapas e JOIN pcp_pecas pp ON pp.id = e.peca_id JOIN pcp_itens i ON i.id = pp.item_id
     WHERE i.pedido = $1`, [pedido]);
  const porPeca = new Map();
  for (const e of etapas) {
    const k = Number(e.peca_id);
    if (!porPeca.has(k)) porPeca.set(k, []);
    porPeca.get(k).push({ setor_id: Number(e.setor_id), inicio: e.inicio, fim: e.fim });
  }
  for (const p of pecas) p.etapas = porPeca.get(Number(p.id)) || [];
  const { rows: setores } = await q('SELECT id, nome, ordem FROM pcp_setores WHERE ativo = TRUE ORDER BY ordem, id');
  return { itens, pecas, setores };
}

/** os documentos da produção por etapas — cada um é impresso (e registrado) em separado */
export const DOCS_DE_PRODUCAO = ['partes', 'tecido', 'perfis', 'montagem', 'compra'];
const MODO = (doc) => `prod-${doc}`;

/**
 * O que já foi impresso deste pedido: por documento `{ vezes, ultima, por }` (a montagem também por
 * parte) e `plano_por_peca` — o Plano de corte antigo (um documento só, por peça), para a bancada não
 * cortar duas vezes por documentos diferentes. Mesmo log da Ordem de Corte (`pcp_ordem_corte_log`).
 */
export async function impressoesDoPedido(pedido) {
  const { rows } = await q(
    `SELECT l.modo, l.detalhe, l.por_nome, to_char(l.created_at, 'YYYY-MM-DD HH24:MI') AS quando
     FROM pcp_ordem_corte_log l
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(l.pedidos) e WHERE e = $1)
     ORDER BY l.created_at DESC, l.id DESC`, [pedido]);
  const out = {};
  const soma = (alvo, r) => {
    if (!alvo.vezes) { alvo.ultima = r.quando; alvo.por = r.por_nome || null; }
    alvo.vezes = (alvo.vezes || 0) + 1;
  };
  for (const r of rows) {
    const doc = String(r.modo || '').startsWith('prod-') ? String(r.modo).slice(5) : 'plano_por_peca';
    if (!out[doc]) out[doc] = { vezes: 0, ultima: null, por: null };
    soma(out[doc], r);
    if (doc === 'montagem') {
      const parte = r.detalhe || '';
      if (!out[doc].partes) out[doc].partes = {};
      if (!out[doc].partes[parte]) out[doc].partes[parte] = { vezes: 0, ultima: null, por: null };
      soma(out[doc].partes[parte], r);
    }
  }
  return out;
}

/** Registra a impressão de UM documento do pedido; diz se é reimpressão daquele documento (e parte). */
export async function registrarImpressaoDoDocumento(pedido, doc, { parte = null, userId = null, userNome = null } = {}) {
  const codigo = String(pedido || '').trim();
  if (!codigo) throw new HttpError(422, 'Informe o pedido');
  if (!DOCS_DE_PRODUCAO.includes(doc)) throw new HttpError(422, `Documento inválido — use um de: ${DOCS_DE_PRODUCAO.join(', ')}`);
  const { rows: existe } = await q('SELECT 1 FROM pcp_itens WHERE pedido = $1 LIMIT 1', [codigo]);
  if (!existe.length) throw new HttpError(404, 'Pedido não encontrado na fila do PCP');
  const detalhe = doc === 'montagem' && String(parte || '').trim() ? String(parte).trim().slice(0, 160) : null;
  // reimpressão = o MESMO documento já saiu; na montagem de uma parte, conta a parte ou o pedido inteiro
  const { rows: antes } = await q(
    `SELECT COUNT(*)::int AS c FROM pcp_ordem_corte_log l
     WHERE l.modo = $2 AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(l.pedidos) e WHERE e = $1)
       AND ($3::text IS NULL OR l.detalhe IS NULL OR l.detalhe = $3)`, [codigo, MODO(doc), detalhe]);
  const reimpressao = antes[0].c > 0;
  await q(
    `INSERT INTO pcp_ordem_corte_log (pedido, setor_id, modo, tipo, pedidos, por, por_nome, detalhe)
     VALUES ($1, NULL, $2, $3, $4::jsonb, $5, $6, $7)`,
    [codigo, MODO(doc), reimpressao ? 'reimpressao' : 'impressao', JSON.stringify([codigo]), userId, userNome, detalhe]);
  return { reimpressao, impressoes: await impressoesDoPedido(codigo) };
}

/**
 * Os documentos de produção do pedido: corte do tecido, corte dos perfis, montagem, partes e compra.
 * O plano de corte por peça e a lista de materiais vêm do Núcleo, em paralelo; cada um falha sozinho
 * (o documento que depende do que faltou diz que ficou de fora).
 */
export async function producaoDoPedido(pedido) {
  const codigo = String(pedido || '').trim();
  if (!codigo) throw new HttpError(422, 'Informe ?pedido=');
  const { itens, pecas, setores } = await filaDoPedido(codigo);
  if (!itens.length) throw new HttpError(404, 'Pedido não encontrado na fila do PCP');
  const { rows: info } = await q(
    `SELECT cliente, vendedor, modalidade, observacoes, prazo_dias, to_char(aprovado_fin, 'YYYY-MM-DD') AS aprovado_fin, por_partes
     FROM pcp_pedido_info WHERE pedido = $1`, [codigo]);
  const [plano, lista, impressoes] = await Promise.all([
    planoCorteHabilitado()
      ? calcularPlanoNucleo(codigo).catch(() => null)
      : Promise.resolve(null),
    listaMateriaisDosPedidos([codigo]).catch((e) => ({ habilitado: false, motivo: e.message, data: null, avisos: [] })),
    impressoesDoPedido(codigo).catch(() => ({})),
  ]);
  const doc = montarProducao({
    pedido: codigo, itens, pecas, plano, setores,
    lista: lista && lista.data ? lista : (lista ? { ...lista, data: null } : null),
    porPartes: info[0] ? info[0].por_partes : null,
  });
  return {
    ...doc,
    gerado_em: new Date().toISOString(),
    cliente: (info[0] && info[0].cliente) || (itens.find((i) => i.cliente) || {}).cliente || null,
    info: info[0] || null,
    data_cliente: itens.map((i) => i.data_cliente).filter(Boolean).sort()[0] || null,
    setores: setores.map((s) => ({ id: Number(s.id), nome: s.nome })),
    impressoes,
  };
}

/** O PCP diz se o pedido é por partes: true / false, ou null para voltar ao automático. */
export async function definirPorPartes(pedido, valor) {
  const codigo = String(pedido || '').trim();
  if (!codigo) throw new HttpError(422, 'Informe o pedido');
  if (!(valor === true || valor === false || valor === null)) throw new HttpError(422, 'por_partes deve ser true, false ou null (automático)');
  const { rows: existe } = await q('SELECT 1 FROM pcp_itens WHERE pedido = $1 LIMIT 1', [codigo]);
  if (!existe.length) throw new HttpError(404, 'Pedido não encontrado na fila do PCP');
  await q(
    `INSERT INTO pcp_pedido_info (pedido, por_partes, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (pedido) DO UPDATE SET por_partes = EXCLUDED.por_partes, updated_at = now()`, [codigo, valor]);
  return { pedido: codigo, por_partes: valor };
}

/**
 * Para a INTEGRAÇÃO (Logística): por pedido, se ele é por partes, o andamento de cada parte e — por
 * item — a parte e o cômodo. É a MESMA regra dos documentos (`producao.js`), numa consulta só.
 * @returns Map(pedido → { por_partes, partes[], porItem: Map(item_id → { parte, comodo }) })
 */
export async function partesDosPedidos(pedidos) {
  const lista = [...new Set((pedidos || []).map((p) => String(p || '').trim()).filter(Boolean))];
  const out = new Map();
  if (!lista.length) return out;
  const { rows } = await q(
    `SELECT i.pedido, i.id, i.grupo_pedido, i.ambiente,
            COUNT(pp.id)::int AS pecas,
            (COUNT(pp.id) FILTER (WHERE pp.conclusao IS NOT NULL))::int AS concluidas,
            (COUNT(pp.id) FILTER (WHERE pp.gaveta_id IS NOT NULL))::int AS guardadas
     FROM pcp_itens i LEFT JOIN pcp_pecas pp ON pp.item_id = i.id
     WHERE i.pedido = ANY($1) GROUP BY i.pedido, i.id ORDER BY i.id`, [lista]);
  const { rows: info } = await q('SELECT pedido, por_partes FROM pcp_pedido_info WHERE pedido = ANY($1)', [lista]);
  const forcado = new Map(info.map((r) => [r.pedido, r.por_partes]));
  const porPedido = new Map();
  for (const r of rows) { if (!porPedido.has(r.pedido)) porPedido.set(r.pedido, []); porPedido.get(r.pedido).push(r); }
  for (const [pedido, itens] of porPedido) {
    const resumo = resumoDasPartes(itens, forcado.has(pedido) ? forcado.get(pedido) : null);
    const porItem = new Map(itens.map((it) => [Number(it.id), {
      parte: resumo.por_partes ? parteDoItem(it, true) : null,
      comodo: comodoDoItem(it, resumo.por_partes),
    }]));
    out.set(pedido, { ...resumo, porItem });
  }
  return out;
}
