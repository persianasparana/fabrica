/**
 * NECESSIDADE DE MATERIAIS — P1 do planejamento de produção (06/11/2026; espec
 * docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.2 d).
 *
 * Escolhe o HORIZONTE de pedidos (padrão "liberado e não cortou": peça aberta
 * sem nenhuma etapa iniciada no setor de CORTE — o setor marcado `ordem_corte`,
 * ou, sem marca, sem NENHUMA etapa iniciada), chama a lista de materiais do P0
 * em lote (`listaMateriaisDosPedidos` → Núcleo `POST /lista-materiais`) e
 * devolve o consolidado — tecido por coleção × cor × rolo, perfis/tubos em
 * barras, componentes — já com os PEDIDOS que puxam cada linha (pelas refs
 * `item:peca` que o Núcleo ecoa), para a tela, o CSV e, na P3, a requisição ao
 * Compras. Sem dinheiro (o Núcleo já projeta sem).
 */
import { q } from './db.js';
import { HttpError } from './util.js';
import { listaMateriaisDosPedidos } from './lista-materiais.js';

export const HORIZONTES = ['nao_cortou', 'abertos', 'pedidos'];

/**
 * Pedidos do horizonte. `{ horizonte, ate?, pedidos? }` →
 * [{ pedido, itens, pecas, pecas_abertas, data_cliente }] ordenados por data prometida.
 */
export async function pedidosDoHorizonte({ horizonte = 'nao_cortou', ate = null, pedidos = [] } = {}) {
  if (!HORIZONTES.includes(horizonte)) throw new HttpError(422, `Horizonte inválido (${HORIZONTES.join(' | ')})`);
  if (ate && !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new HttpError(422, 'Data limite inválida (AAAA-MM-DD)');
  const params = [];
  let filtroPeca = 'pp.conclusao IS NULL';
  if (horizonte === 'nao_cortou') {
    const { rows: corte } = await q(`SELECT id FROM pcp_setores WHERE ativo = TRUE AND ordem_corte = TRUE`);
    const idsCorte = corte.map((s) => Number(s.id));
    filtroPeca += idsCorte.length
      ? ` AND NOT EXISTS (SELECT 1 FROM pcp_peca_etapas e WHERE e.peca_id = pp.id AND e.inicio IS NOT NULL AND e.setor_id = ANY($${params.push(idsCorte)}))`
      : ` AND NOT EXISTS (SELECT 1 FROM pcp_peca_etapas e WHERE e.peca_id = pp.id AND e.inicio IS NOT NULL)`;
  } else if (horizonte === 'pedidos') {
    const lista = [...new Set((pedidos || []).map((p) => String(p || '').trim()).filter(Boolean))];
    if (!lista.length) throw new HttpError(422, 'Informe o(s) pedido(s)');
    filtroPeca = `i.pedido = ANY($${params.push(lista)})`;
  }
  if (ate) filtroPeca += ` AND i.data_cliente <= $${params.push(ate)}::date`;
  // item sem número de pedido (dado antigo/manual) fica fora: a necessidade e a
  // requisição (P3) são por pedido — `itens_sem_pedido` diz quantos ficaram fora
  filtroPeca += ` AND btrim(COALESCE(i.pedido, '')) <> ''`;
  const { rows } = await q(
    `SELECT i.pedido, count(DISTINCT i.id) AS itens, count(pp.id) AS pecas,
            count(pp.id) FILTER (WHERE pp.conclusao IS NULL) AS pecas_abertas,
            to_char(min(i.data_cliente), 'YYYY-MM-DD') AS data_cliente,
            max(i.prioridade) AS prioridade
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     WHERE ${filtroPeca}
     GROUP BY i.pedido ORDER BY min(i.data_cliente) NULLS LAST, i.pedido`, params);
  return rows.map((r) => ({ pedido: r.pedido, itens: Number(r.itens), pecas: Number(r.pecas), pecas_abertas: Number(r.pecas_abertas), data_cliente: r.data_cliente, prioridade: Number(r.prioridade) || 0 }));
}

/** acrescenta `pedidos[]` a cada linha a partir das refs "item:peca" */
function comPedidos(linhas, pedidoDoItem) {
  return (linhas || []).map((l) => {
    const peds = new Set();
    for (const ref of (l.refs || [])) { const it = String(ref).split(':')[0]; if (pedidoDoItem.has(it)) peds.add(pedidoDoItem.get(it)); }
    return { ...l, pedidos: [...peds].sort() };
  });
}

/**
 * Necessidade consolidada do horizonte: `{ horizonte, ate, pedidos[], totais,
 * habilitado, motivo, avisos[], tecido[], tecido_totais, perfis[], perfis_totais,
 * tubos[], componentes[], itens_sem_spec, por_item }`.
 */
export async function necessidadeMateriais(opts = {}) {
  const pedidos = await pedidosDoHorizonte(opts);
  const { rows: semPed } = await q(`SELECT count(DISTINCT i.id) AS n FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id WHERE pp.conclusao IS NULL AND btrim(COALESCE(i.pedido, '')) = ''`);
  const base = { horizonte: opts.horizonte || 'nao_cortou', ate: opts.ate || null, pedidos, totais: { pedidos: pedidos.length, itens: pedidos.reduce((a, p) => a + p.itens, 0), pecas: pedidos.reduce((a, p) => a + p.pecas, 0), pecas_ok: 0, pecas_erro: 0, itens_sem_pedido: Number(semPed[0]?.n) || 0 } };
  if (!pedidos.length) return { ...base, habilitado: true, motivo: 'Nenhum pedido no horizonte', avisos: [], tecido: [], tecido_totais: { metros: 0, bobinas: 0 }, perfis: [], perfis_totais: null, tubos: [], componentes: [], itens_sem_spec: [], por_item: {} };
  const lm = await listaMateriaisDosPedidos(pedidos.map((p) => p.pedido));
  if (!lm.habilitado || !lm.data) return { ...base, habilitado: false, motivo: lm.motivo, avisos: lm.avisos || [], tecido: [], tecido_totais: { metros: 0, bobinas: 0 }, perfis: [], perfis_totais: null, tubos: [], componentes: [], itens_sem_spec: lm.itens_sem_spec || [], por_item: {} };
  // item_id → pedido (para rotular as linhas com os pedidos que as puxam)
  const { rows: itens } = await q(`SELECT id, pedido FROM pcp_itens WHERE pedido = ANY($1)`, [pedidos.map((p) => p.pedido)]);
  const pedidoDoItem = new Map(itens.map((i) => [String(i.id), i.pedido]));
  const d = lm.data;
  const componentes = comPedidos((d.materiais || []).filter((m) => m.tipo !== 'tecido'), pedidoDoItem);
  const tecido = comPedidos(d.tecido || [], pedidoDoItem);
  const perfis = comPedidos(d.perfis || [], pedidoDoItem);
  return {
    ...base,
    totais: { ...base.totais, pecas_ok: Number(d.totais?.pecas_ok) || 0, pecas_erro: Number(d.totais?.pecas_erro) || 0 },
    habilitado: true, motivo: null, avisos: lm.avisos || [],
    tecido, tecido_totais: d.tecido_totais || { metros: 0, bobinas: 0 },
    perfis, perfis_totais: d.perfis_totais || null,
    tubos: d.tubos || [],
    componentes,
    itens_sem_spec: lm.itens_sem_spec || [],
    pecas_erro: (d.pecas || []).filter((p) => !p.ok).map((p) => ({ ref: p.ref, pedido: pedidoDoItem.get(String(p.ref || '').split(':')[0]) || null, motivo: p.motivo || p.error || null })),
    por_item: lm.por_item,
  };
}

/** CSV (Excel pt-BR: ; e vírgula decimal, BOM) da necessidade */
export function necessidadeCsv(n) {
  const num = (v) => (v == null || v === '' ? '' : String(Number(v)).replace('.', ','));
  const cel = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const linha = (arr) => arr.map(cel).join(';');
  const out = [];
  out.push(linha(['NECESSIDADE DE MATERIAIS', `horizonte: ${n.horizonte}`, n.ate ? `até ${n.ate}` : '', `${n.totais.pedidos} pedidos`, `${n.totais.pecas} peças`]));
  out.push('');
  out.push(linha(['PEDIDOS', 'Itens', 'Peças', 'Data prometida', 'Prioridade']));
  for (const p of n.pedidos) out.push(linha([p.pedido, p.itens, p.pecas, p.data_cliente || '', p.prioridade]));
  out.push('');
  out.push(linha(['TECIDO — coleção', 'Cor', 'Rolo (m)', 'Metros', 'Bobinas', 'Sobra (m)', 'Peças', 'Pedidos']));
  for (const t of n.tecido) out.push(linha([t.colecao, t.cor || '', num(t.largura_rolo), num(t.metros), t.bobinas, num(t.sobra), t.pecas, (t.pedidos || []).join(' ')]));
  out.push('');
  out.push(linha(['PERFIS / TUBOS (barras)', 'SKU', 'Cortes', 'Metros', 'Barras', 'Barra (m)', 'Sobra (m)', 'Pedidos']));
  for (const x of n.perfis) out.push(linha([x.componente, x.sku || '', x.cortes, num(x.metros), x.barras, num(x.barra_m), num(x.sobra_m), (x.pedidos || []).join(' ')]));
  for (const t of n.tubos) out.push(linha([`Tubo ${t.tubo} mm`, '', t.cortes, num(t.metros), t.barras, num(t.barra_m), '', '']));
  out.push('');
  out.push(linha(['COMPONENTES', 'SKU', 'Qtd', 'Un', 'Peças', 'Origem', 'Pedidos']));
  for (const m of n.componentes) out.push(linha([m.descricao, m.sku || '', num(m.qtd), m.un || '', m.pecas, (m.origens || []).join(' '), (m.pedidos || []).join(' ')]));
  return '﻿' + out.join('\n');
}
