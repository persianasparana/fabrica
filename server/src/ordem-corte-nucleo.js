/**
 * PLANEJAMENTO DE CORTE do pedido via NÚCLEO DE PRODUTOS (:3070).
 *
 * Alternativa "documento do motor" à Ordem de Corte local (ordem-corte.js —
 * caminho quente em produção, NÃO é tocado aqui): monta o lote de peças do
 * pedido (medidas do PCP em cm → METROS pro Núcleo), resolve produto/variante
 * no Núcleo em UMA chamada batch e devolve o plano por peça, agrupado por
 * ambiente, pra página imprimível plano-corte-nucleo.html. Medidas de corte
 * das linhas do plano vêm em CENTÍMETROS (convenção das planilhas oficiais).
 *
 * `overrides` = { [peca_id]: variante } — o operador troca a variante de uma
 * peça no navegador antes de imprimir (o override explícito SEMPRE vence no
 * resolvedor do Núcleo).
 */
import { q } from './db.js';
import { HttpError } from './util.js';
import { buscarPlanoCorte, buscarVariantesCorte } from './produtos-client.js';

export async function calcularPlanoNucleo(pedido, overrides = {}) {
  const codigo = String(pedido || '').trim();
  if (!codigo) throw new HttpError(422, 'Informe o pedido');

  const { rows: itens } = await q(
    `SELECT i.id, i.produto, i.colecao, i.acionamento, i.ambiente, i.atributos,
            i.produto_sku, p.produto_sku AS estrutura_sku
     FROM pcp_itens i LEFT JOIN pcp_produtos p ON p.id = i.produto_id
     WHERE i.pedido = $1 ORDER BY i.id`, [codigo]);
  if (!itens.length) throw new HttpError(404, 'Pedido não encontrado na fila do PCP');

  const { rows: pecas } = await q(
    `SELECT pp.id, pp.item_id, pp.numero, pp.largura, pp.altura, pp.medidas, pp.cod_barras
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     WHERE i.pedido = $1 ORDER BY pp.item_id, pp.numero`, [codigo]);

  const itemPorId = new Map(itens.map((i) => [Number(i.id), i]));
  const avisos = [];

  // Payload por PEÇA (Núcleo trabalha em METROS; PCP armazena cm)
  const payload = pecas.map((peca) => {
    const item = itemPorId.get(Number(peca.item_id)) || {};
    // Acabamento não tem coluna própria em pcp_itens — vive em atributos
    // (atributos.acabamento, vindo do formulário dinâmico do Comercial).
    const acab = JSON.stringify(item.atributos || {}).toLowerCase();
    const p = {
      ref: peca.id,
      produto_sku: item.produto_sku || item.estrutura_sku || null,
      tipo: item.produto || null,
      colecao: item.colecao || null,
      largura: peca.largura != null ? Number(peca.largura) / 100 : 0,
      altura: peca.altura != null ? Number(peca.altura) / 100 : 0,
      modo: /motor/i.test(item.acionamento || '') ? 'motor' : 'manual',
      bando: acab.includes('band') && !acab.includes('sem band'),
      box: acab.includes('box'),
    };
    if (overrides && overrides[peca.id] != null && String(overrides[peca.id]).trim())
      p.variante = String(overrides[peca.id]).trim();
    return p;
  });
  if (!payload.length) throw new HttpError(422, 'Pedido sem peças cadastradas');

  // UMA chamada batch ao Núcleo (máx. 500 peças — limite do próprio PCP por item)
  const resp = await buscarPlanoCorte(payload);
  if (!resp) throw new HttpError(502, 'Núcleo de Produtos indisponível — plano de corte não gerado');
  const data = resp.pecas;
  const porRef = new Map(data.map((d) => [String(d.ref), d]));

  // Agrupa por ambiente do ITEM (ordem de chegada)
  const grupos = new Map(); // ambiente -> { ambiente, pecas: [] }
  for (const peca of pecas) {
    const item = itemPorId.get(Number(peca.item_id)) || {};
    const r = porRef.get(String(peca.id)) || {};
    const aviso = r.ok === false ? (r.message || 'Peça não resolvida pelo Núcleo') : (r.aviso || null);
    if (aviso) avisos.push(`Peça nº ${peca.numero} (${item.produto || 'item'}): ${aviso}`);
    const amb = item.ambiente || '(sem ambiente)';
    if (!grupos.has(amb)) grupos.set(amb, { ambiente: amb, pecas: [] });
    grupos.get(amb).pecas.push({
      item_id: Number(peca.item_id),
      peca_id: Number(peca.id),
      numero: peca.numero,
      cod_barras: peca.cod_barras || null,
      produto: item.produto || null,
      colecao: item.colecao || null,
      largura_cm: peca.largura != null ? Number(peca.largura) : null,
      altura_cm: peca.altura != null ? Number(peca.altura) : null,
      produto_efetivo: r.produto_efetivo || null,
      produto_nome: r.produto_nome || null,
      tubo_efetivo: r.tubo_efetivo || null,
      modo: r.modo || null,
      box: !!r.box,
      bando: !!r.bando,
      variante: r.variante || null,
      plano: r.plano || null,
      aviso,
    });
  }

  return {
    pedido: codigo,
    gerado_em: new Date().toISOString(),
    habilitado: true,
    avisos,
    variantes: await buscarVariantesCorte(),
    ambientes: [...grupos.values()],
    // v09/08 — TECIDO do pedido (consumo por coleção + bobinas, calculado
    // pelo Núcleo com a mesma conta da precificação)
    resumo_tecido: resp.resumoTecido || [],
  };
}
