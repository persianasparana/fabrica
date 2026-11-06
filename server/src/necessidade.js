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
import { listaMateriaisDosPedidos, skuCompras } from './lista-materiais.js';
import { saldos as saldosCompras, comprasHabilitado, enviarComOutbox, consultarSolicitacao } from './compras-client.js';
import { createHash } from 'node:crypto';

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
  const componentes = comPedidos((d.materiais || []).filter((m) => m.tipo !== 'tecido'), pedidoDoItem).map((m) => ({ ...m, sku_compras: skuCompras(m) }));
  const tecido = comPedidos(d.tecido || [], pedidoDoItem).map((t) => ({ ...t, sku_compras: t.tecido_sku ? skuCompras({ tipo: 'tecido', sku: t.tecido_sku, cor: t.cor }) : null }));
  const perfis = comPedidos(d.perfis || [], pedidoDoItem);
  // P3: saldo · reservado · em OC pelo COMPRAS (best-effort; null = sem de-para; compras null = fora)
  const compras = await saldosCompras([...componentes, ...tecido].map((x) => x.sku_compras).filter(Boolean));
  const comSaldo = (linha, qtdNecessaria) => {
    const s = linha.sku_compras && compras ? compras[linha.sku_compras] : undefined;
    const saldo = s ? Number(s.disponivel) : null;
    return { ...linha, compras: s === undefined ? null : s, saldo, falta: saldo == null ? null : Math.max(0, Math.round((Number(qtdNecessaria) - saldo) * 10000) / 10000) };
  };
  return {
    compras_habilitado: comprasHabilitado(), compras_online: compras !== null,
    ...base,
    totais: { ...base.totais, pecas_ok: Number(d.totais?.pecas_ok) || 0, pecas_erro: Number(d.totais?.pecas_erro) || 0 },
    habilitado: true, motivo: null, avisos: lm.avisos || [],
    tecido: tecido.map((t) => comSaldo(t, t.metros)), tecido_totais: d.tecido_totais || { metros: 0, bobinas: 0 },
    perfis, perfis_totais: d.perfis_totais || null,
    tubos: d.tubos || [],
    componentes: componentes.map((m) => comSaldo(m, m.qtd)),
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

// ─── P3 — REQUISIÇÃO ao Compras ───────────────────────────────────────────────
/**
 * Transforma itens escolhidos da necessidade numa SOLICITAÇÃO DE COMPRA no Compras.
 * `d`: { horizonte, pedidos[], data_necessidade?, observacoes?, itens:[{sku, descricao, quantidade, un, pedidos[]}], usuario }
 * origem_ref = pcp:nec:<hash do conteúdo> — o mesmo conjunto (sku+qtd+pedidos) nunca
 * vira duas SCs (idempotente dos dois lados). Falha transitória = pendência (outbox).
 */
export async function requisitarCompras(d) {
  const itens = (Array.isArray(d.itens) ? d.itens : []).map((it) => ({
    sku: String(it.sku || '').trim() || null, descricao: String(it.descricao || it.sku || '').trim().slice(0, 255),
    quantidade: Math.round(Number(it.quantidade) * 10000) / 10000, unidade: String(it.un || it.unidade || 'un').slice(0, 20),
    pedidos: Array.isArray(it.pedidos) ? [...new Set(it.pedidos.map(String))].sort() : [],
  })).filter((it) => it.descricao && it.quantidade > 0);
  if (!itens.length) throw new HttpError(422, 'Escolha ao menos um item com quantidade > 0');
  if (!comprasHabilitado()) throw new HttpError(503, 'Integração com o Compras não configurada (COMPRAS_SERVICE_KEY / COMPRAS_API_BASE)');
  if (d.data_necessidade && !/^\d{4}-\d{2}-\d{2}$/.test(String(d.data_necessidade))) throw new HttpError(422, 'Data de necessidade inválida');
  const pedidos = [...new Set([...(Array.isArray(d.pedidos) ? d.pedidos.map(String) : []), ...itens.flatMap((i) => i.pedidos)])].sort();
  const conteudo = itens.map((i) => `${i.sku || i.descricao}=${i.quantidade}${i.unidade}[${i.pedidos.join(',')}]`).sort().join('|') + '#' + pedidos.join(',');
  const origemRef = `pcp:nec:${createHash('sha1').update(conteudo).digest('hex').slice(0, 20)}`;
  const payload = { origem_ref: origemRef, data_necessidade: d.data_necessidade || null, pedidos, solicitante: d.usuario?.nome ? `PCP · ${d.usuario.nome}` : 'PCP', observacoes: d.observacoes || `Necessidade de materiais do PCP (${d.horizonte || 'horizonte'}) — ${itens.length} item(ns), ${pedidos.length} pedido(s)`, itens };
  const { rows: ex } = await q(`SELECT * FROM pcp_requisicoes WHERE origem_ref = $1`, [origemRef]);
  if (!ex[0]) {
    await q(`INSERT INTO pcp_requisicoes (origem_ref, horizonte, pedidos, itens, data_necessidade, observacoes, criado_por, criado_por_nome)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (origem_ref) DO NOTHING`,
      [origemRef, d.horizonte || null, JSON.stringify(pedidos), JSON.stringify(itens), d.data_necessidade || null, payload.observacoes, d.usuario?.id || null, d.usuario?.nome || null]);
  }
  const r = await enviarComOutbox('solicitacao', `solicitacao:${origemRef}`, payload);
  if (!r.ok) await q(`UPDATE pcp_requisicoes SET erro = $2, updated_at = now() WHERE origem_ref = $1`, [origemRef, r.erro]);
  const { rows } = await q(`SELECT * FROM pcp_requisicoes WHERE origem_ref = $1`, [origemRef]);
  return { ...r, ja_existia: !!ex[0], requisicao: rows[0], solicitacao: r.ok ? r.resultado.solicitacao : null, criada: r.ok ? r.resultado.criada : false };
}

/** requisições feitas (com o status atual no Compras quando ele responde) */
export async function listarRequisicoes({ atualizar = false, limite = 50 } = {}) {
  const { rows } = await q(`SELECT * FROM pcp_requisicoes ORDER BY created_at DESC LIMIT $1`, [Math.min(200, Number(limite) || 50)]);
  if (atualizar) {
    for (const r of rows) {
      if (!r.numero_sc) continue;
      const sc = await consultarSolicitacao(r.numero_sc);
      if (sc && sc.status && sc.status !== r.status_sc) {
        await q(`UPDATE pcp_requisicoes SET status_sc = $2, updated_at = now() WHERE id = $1`, [r.id, sc.status]);
        r.status_sc = sc.status;
      }
    }
  }
  const { rows: pend } = await q(`SELECT tipo, chave, tentativas, ultimo_erro, bloqueada, updated_at FROM pcp_compras_pendencias ORDER BY updated_at DESC LIMIT 50`);
  return { requisicoes: rows, pendencias: pend, compras_habilitado: comprasHabilitado() };
}
