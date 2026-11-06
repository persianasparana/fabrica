// ─── NECESSIDADE DE MATERIAIS (P1 do planejamento de produção, 06/11/2026) ──
// Consolidado do horizonte (padrão: liberado e ainda não cortou) pelo Núcleo de
// Produtos: tecido por coleção × cor × rolo, perfis/tubos em barras, componentes
// — cada linha com os pedidos que a puxam. Tudo vem de GET /api/pcp/necessidade.
let NEC = null;
const NEC_ORIGEM = { receita: 'receita', mecanismo: 'mecanismo', tubo: 'tubo', kit: 'kit motor.', motor: 'motor', emissor: 'emissor', fonte: 'fonte', box: 'box', bando: 'bandô', bando_tira: 'tira do bandô', tecido: 'tecido', lamina: 'lâmina', terceirizado: 'terceirizado', vertical: 'vertical', avulso: 'avulso' };
const necQtd = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const necPeds = (arr) => (arr && arr.length ? `<small style="color:var(--text3)">${arr.length > 4 ? esc(arr.slice(0, 4).join(', ')) + ` +${arr.length - 4}` : esc(arr.join(', '))}</small>` : '');

function necHorizonteMudou() {
  const h = document.getElementById('nec-horizonte').value;
  document.getElementById('nec-pedidos').style.display = h === 'pedidos' ? '' : 'none';
}
function necQuery() {
  const h = document.getElementById('nec-horizonte').value;
  const ate = document.getElementById('nec-ate').value;
  const peds = document.getElementById('nec-pedidos').value.trim();
  const qs = new URLSearchParams({ horizonte: h });
  if (ate) qs.set('ate', ate);
  if (h === 'pedidos') qs.set('pedidos', peds.split(/[,;\s]+/).filter(Boolean).join(','));
  return qs.toString();
}

async function renderNecessidade() {
  const info = document.getElementById('nec-info');
  info.textContent = 'Calculando pelo Núcleo de Produtos…';
  ['nec-tecido', 'nec-perfis', 'nec-componentes', 'nec-pedidos-tabela'].forEach((id) => { document.getElementById(id).innerHTML = ''; });
  document.getElementById('nec-avisos').innerHTML = '';
  try {
    NEC = await api('pcp/necessidade?' + necQuery());
  } catch (e) {
    info.textContent = '';
    document.getElementById('nec-avisos').innerHTML = `<div class="card" style="border-left:4px solid var(--red);font-size:12px">Erro: ${esc(e.message)}</div>`;
    return;
  }
  const n = NEC;
  info.textContent = `${n.totais.pedidos} pedido(s) · ${n.totais.itens} item(ns) · ${n.totais.pecas} peça(s)${n.ate ? ` · data prometida até ${fmtDate(n.ate)}` : ''}`;
  document.getElementById('metrics-necessidade').innerHTML = `
    <div class="metric"><div class="metric-label">Pedidos no horizonte</div><div class="metric-value">${n.totais.pedidos}</div><div class="metric-sub">${n.totais.pecas} peças</div></div>
    <div class="metric"><div class="metric-label">Tecido</div><div class="metric-value">${necQtd(n.tecido_totais.metros)} m</div><div class="metric-sub">${n.tecido_totais.bobinas} bobina(s) · ${n.tecido.length} coleção×cor</div></div>
    <div class="metric"><div class="metric-label">Perfis / tubos</div><div class="metric-value">${(n.perfis || []).reduce((a, x) => a + (Number(x.barras) || 0), 0) + (n.tubos || []).reduce((a, x) => a + (Number(x.barras) || 0), 0)}</div><div class="metric-sub">barras · ${n.perfis.length + n.tubos.length} perfis</div></div>
    <div class="metric"><div class="metric-label">Componentes</div><div class="metric-value">${n.componentes.length}</div><div class="metric-sub">${n.totais.pecas_erro ? `<span style="color:var(--red)">${n.totais.pecas_erro} peça(s) sem cálculo</span>` : `${n.totais.pecas_ok} peças calculadas`}</div></div>`;
  const avisos = [];
  if (!n.habilitado) avisos.push(`<div class="card" style="border-left:4px solid var(--red);font-size:12px">📦 ${esc(n.motivo || 'Núcleo de Produtos indisponível')}</div>`);
  else if (n.motivo) avisos.push(`<div class="card" style="border-left:4px solid var(--amber);font-size:12px">${esc(n.motivo)}</div>`);
  if (n.totais.itens_sem_pedido) avisos.push(`<div class="card" style="border-left:4px solid var(--amber);font-size:12px">⚠ ${n.totais.itens_sem_pedido} item(ns) aberto(s) SEM número de pedido ficam fora da necessidade (corrija o pedido em Editar Pedido / Ver).</div>`);
  for (const a of (n.avisos || [])) avisos.push(`<div class="card" style="border-left:4px solid var(--amber);font-size:12px">⚠ ${esc(a)}</div>`);
  if ((n.pecas_erro || []).length) avisos.push(`<div class="card" style="border-left:4px solid var(--red);font-size:12px">⚠ ${n.pecas_erro.length} peça(s) que o Núcleo não calculou (fora da lista): ${esc([...new Set(n.pecas_erro.map((p) => `${p.pedido || '?'}: ${p.motivo || 'sem motivo'}`))].slice(0, 6).join(' · '))}</div>`);
  document.getElementById('nec-avisos').innerHTML = avisos.join('');

  document.getElementById('nec-tecido').innerHTML = n.tecido.length ? `<table>
    <thead><tr><th>Coleção</th><th>Cor</th><th>Rolo</th><th style="text-align:right">Metros</th><th style="text-align:right">Bobinas</th><th style="text-align:right">Sobra</th><th style="text-align:right">Peças</th><th>Pedidos</th></tr></thead>
    <tbody>${n.tecido.map((t) => `<tr><td><b>${esc(t.colecao)}</b></td><td>${esc(t.cor || '—')}</td><td>${t.largura_rolo ? necQtd(t.largura_rolo) + ' m' : '—'}</td><td style="text-align:right;font-weight:700">${necQtd(t.metros)} m</td><td style="text-align:right">${t.bobinas}</td><td style="text-align:right">${necQtd(t.sobra)} m</td><td style="text-align:right">${t.pecas ?? ''}</td><td>${necPeds(t.pedidos)}</td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhum tecido no horizonte.</div>';

  const nomesPerfis = new Set((n.perfis || []).map((x) => String(x.componente || '').toLowerCase().replace(/\s+/g, '')));
  const tubos = (n.tubos || []).filter((t) => !nomesPerfis.has(String(t.corte || '').toLowerCase().replace(/\s+/g, '')));
  document.getElementById('nec-perfis').innerHTML = (n.perfis.length || tubos.length) ? `<table>
    <thead><tr><th>Perfil / tubo</th><th>SKU</th><th style="text-align:right">Cortes</th><th style="text-align:right">Metros</th><th style="text-align:right">Barras</th><th style="text-align:right">Sobra</th><th>Pedidos</th></tr></thead>
    <tbody>${n.perfis.map((x) => `<tr><td>${esc(x.componente)}</td><td style="font-family:monospace;font-size:11px">${esc(x.sku || '')}</td><td style="text-align:right">${x.cortes}</td><td style="text-align:right">${necQtd(x.metros)} m</td><td style="text-align:right;font-weight:700">${x.barras} × ${necQtd(x.barra_m)} m</td><td style="text-align:right">${necQtd(x.sobra_m)} m</td><td>${necPeds(x.pedidos)}</td></tr>`).join('')}
    ${tubos.map((t) => `<tr><td>Tubo ${t.tubo} mm</td><td></td><td style="text-align:right">${t.cortes}</td><td style="text-align:right">${necQtd(t.metros)} m</td><td style="text-align:right;font-weight:700">${t.barras} × ${necQtd(t.barra_m)} m</td><td></td><td></td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhum perfil no horizonte.</div>';

  necFiltrarComponentes();
  document.getElementById('nec-pedidos-tabela').innerHTML = n.pedidos.length ? `<table>
    <thead><tr><th>Pedido</th><th style="text-align:right">Itens</th><th style="text-align:right">Peças</th><th>Data prometida</th><th>Prioridade</th><th></th></tr></thead>
    <tbody>${n.pedidos.map((p) => `<tr><td><b>${esc(p.pedido)}</b></td><td style="text-align:right">${p.itens}</td><td style="text-align:right">${p.pecas}</td><td>${fmtDate(p.data_cliente)}</td><td>${badgePrioridade(p)}${PRIORIDADES[Number(p.prioridade) || 0].n}</td><td><a href="ficha-producao.html?pedido=${encodeURIComponent(p.pedido)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--red)">Ficha</a></td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhum pedido no horizonte.</div>';
}

function necFiltrarComponentes() {
  if (!NEC) return;
  const f = (document.getElementById('nec-busca').value || '').toLowerCase().trim();
  const lista = NEC.componentes.filter((m) => !f || String(m.descricao || '').toLowerCase().includes(f) || String(m.sku || '').toLowerCase().includes(f));
  document.getElementById('nec-componentes').innerHTML = lista.length ? `<table>
    <thead><tr><th style="width:150px">SKU</th><th>Componente</th><th style="text-align:right">Qtd</th><th style="width:44px">Un</th><th style="text-align:right">Peças</th><th>Origem</th><th>Pedidos</th></tr></thead>
    <tbody>${lista.map((m) => `<tr><td style="font-family:monospace;font-size:11px">${esc(m.sku || '—')}</td><td>${esc(m.descricao || '')}${m.tipo && m.tipo !== 'componente' ? ` <span class="st st-gray" style="font-size:9px">${esc(m.tipo)}</span>` : ''}</td><td style="text-align:right;font-weight:700">${necQtd(m.qtd)}</td><td>${esc(m.un || '')}</td><td style="text-align:right">${m.pecas ?? ''}</td><td><small style="color:var(--text3)">${(m.origens || []).map((o) => NEC_ORIGEM[o] || o).join(', ')}</small></td><td>${necPeds(m.pedidos)}</td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhum componente.</div>';
}

function necExportarCsv() {
  if (!NEC) { toast('Calcule a necessidade primeiro.'); return; }
  const a = document.createElement('a');
  a.href = '../api/pcp/necessidade?' + necQuery() + '&formato=csv';
  a.download = '';
  document.body.appendChild(a); a.click(); a.remove();
}
