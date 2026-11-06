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

  // P3: saldo/falta pelo Compras (de-para produtos.nucleo_sku)
  const btnReq = document.querySelector('#sec-necessidade button[data-requisitar]');
  if (btnReq) { btnReq.disabled = !n.compras_habilitado; btnReq.title = n.compras_habilitado ? (n.compras_online ? 'Abre uma solicitação de compra no Compras com os itens escolhidos' : 'Compras fora do ar — a requisição fica pendente e é reenviada sozinha') : 'Integração com o Compras não configurada (COMPRAS_SERVICE_KEY)'; }
  const cabSaldo = n.compras_habilitado ? '<th style="text-align:right" title="saldo disponível no Compras (saldo − reservado em outras solicitações)">Saldo</th><th style="text-align:right" title="necessidade − saldo disponível">Falta</th>' : '';
  const colSaldo = (x) => !n.compras_habilitado ? '' : (x.compras === null || x.compras === undefined
    ? `<td colspan="2" style="text-align:center"><span class="st st-gray" style="font-size:9px" title="produto do Compras sem o sku do Núcleo (${esc(x.sku_compras || '—')}) — vincule na tela Solicitações do Compras">${n.compras_online ? 'sem de-para' : 'Compras fora'}</span></td>`
    : `<td style="text-align:right">${necQtd(x.saldo)}${x.compras.em_oc ? ` <small style="color:var(--text3)" title="em OC aberta">+${necQtd(x.compras.em_oc)} OC</small>` : ''}</td><td style="text-align:right;font-weight:700;color:${x.falta > 0 ? 'var(--red)' : 'var(--green)'}">${x.falta > 0 ? necQtd(x.falta) : '—'}</td>`);
  if (!n.compras_habilitado) document.getElementById('nec-avisos').insertAdjacentHTML('beforeend', '<div class="card" style="border-left:4px solid var(--text3);font-size:12px">ℹ Sem integração com o Compras configurada: a tela mostra a necessidade sem saldo/falta e não requisita.</div>');
  else if (!n.compras_online) document.getElementById('nec-avisos').insertAdjacentHTML('beforeend', '<div class="card" style="border-left:4px solid var(--amber);font-size:12px">⚠ Compras fora do ar: saldo/falta indisponíveis agora; a requisição pode ser feita e fica pendente (reenvio automático).</div>');
  document.getElementById('nec-tecido').innerHTML = n.tecido.length ? `<table>
    <thead><tr><th>Coleção</th><th>Cor</th><th>Rolo</th><th style="text-align:right">Metros</th><th style="text-align:right">Bobinas</th><th style="text-align:right">Sobra</th>${cabSaldo}<th style="text-align:right">Peças</th><th>Pedidos</th></tr></thead>
    <tbody>${n.tecido.map((t) => `<tr><td><b>${esc(t.colecao)}</b></td><td>${esc(t.cor || '—')}</td><td>${t.largura_rolo ? necQtd(t.largura_rolo) + ' m' : '—'}</td><td style="text-align:right;font-weight:700">${necQtd(t.metros)} m</td><td style="text-align:right">${t.bobinas}</td><td style="text-align:right">${necQtd(t.sobra)} m</td>${colSaldo(t)}<td style="text-align:right">${t.pecas ?? ''}</td><td>${necPeds(t.pedidos)}</td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhum tecido no horizonte.</div>';
  necCarregarRequisicoes();

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
  const hab = NEC.compras_habilitado;
  const cab = hab ? '<th style="text-align:right">Saldo</th><th style="text-align:right">Falta</th>' : '';
  const col = (m) => !hab ? '' : (m.compras === null || m.compras === undefined
    ? `<td colspan="2" style="text-align:center"><span class="st st-gray" style="font-size:9px" title="produto do Compras sem o sku do Núcleo (${esc(m.sku_compras || '—')})">${NEC.compras_online ? 'sem de-para' : 'Compras fora'}</span></td>`
    : `<td style="text-align:right">${necQtd(m.saldo)}${m.compras.em_oc ? ` <small style="color:var(--text3)" title="em OC aberta">+${necQtd(m.compras.em_oc)} OC</small>` : ''}</td><td style="text-align:right;font-weight:700;color:${m.falta > 0 ? 'var(--red)' : 'var(--green)'}">${m.falta > 0 ? necQtd(m.falta) : '—'}</td>`);
  document.getElementById('nec-componentes').innerHTML = lista.length ? `<table>
    <thead><tr><th style="width:150px">SKU</th><th>Componente</th><th style="text-align:right">Qtd</th><th style="width:44px">Un</th>${cab}<th style="text-align:right">Peças</th><th>Origem</th><th>Pedidos</th></tr></thead>
    <tbody>${lista.map((m) => `<tr><td style="font-family:monospace;font-size:11px">${esc(m.sku || '—')}</td><td>${esc(m.descricao || '')}${m.tipo && m.tipo !== 'componente' ? ` <span class="st st-gray" style="font-size:9px">${esc(m.tipo)}</span>` : ''}</td><td style="text-align:right;font-weight:700">${necQtd(m.qtd)}</td><td>${esc(m.un || '')}</td>${col(m)}<td style="text-align:right">${m.pecas ?? ''}</td><td><small style="color:var(--text3)">${(m.origens || []).map((o) => NEC_ORIGEM[o] || o).join(', ')}</small></td><td>${necPeds(m.pedidos)}</td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhum componente.</div>';
}

// ─── P3: REQUISITAR ao Compras ───────────────────────────────────────────────
function necAbrirRequisicao() {
  if (!NEC) { toast('Calcule a necessidade primeiro.'); return; }
  if (!podeEditar('fila')) { toast('Você não tem permissão para requisitar (editar a fila).'); return; }
  const linhas = [];
  for (const t of NEC.tecido) linhas.push({ k: 'tec:' + (t.sku_compras || t.colecao + ':' + t.cor), sku: t.sku_compras, descricao: `${t.colecao}${t.cor ? ' cor ' + t.cor : ''} — rolo ${t.largura_rolo ? necQtd(t.largura_rolo) + ' m' : ''}`.trim(), quantidade: t.metros, un: 'M', pedidos: t.pedidos || [], falta: t.falta, saldo: t.saldo });
  for (const m of NEC.componentes) linhas.push({ k: 'comp:' + (m.sku_compras || m.descricao), sku: m.sku_compras, descricao: m.descricao || m.sku, quantidade: m.qtd, un: m.un || 'un', pedidos: m.pedidos || [], falta: m.falta, saldo: m.saldo });
  const temSaldo = linhas.some((l) => l.saldo != null);
  document.getElementById('modal-title').textContent = 'Requisitar ao Compras';
  document.getElementById('modal-body-content').innerHTML = `
    <div style="grid-column:1/-1;font-size:12px;color:var(--text3)">Marque o que vai para a solicitação de compra. ${temSaldo ? 'Pré-marcados os itens com <b>falta</b> (necessidade maior que o saldo disponível); a quantidade sugerida é a falta.' : 'Sem saldo do Compras: a quantidade é a necessidade inteira.'} O mesmo conjunto de itens nunca vira duas solicitações.</div>
    <div class="form-group"><label>Data de necessidade</label><input type="date" id="req-data" value="${(NEC.pedidos.map((p) => p.data_cliente).filter(Boolean).sort()[0] || '')}"></div>
    <div class="form-group"><label>Observações</label><input type="text" id="req-obs" placeholder="opcional"></div>
    <div style="grid-column:1/-1" class="tbl-wrap"><table>
      <thead><tr><th><input type="checkbox" id="req-todos" title="marcar todos"></th><th>Item</th><th>SKU Núcleo</th><th style="text-align:right">Necessidade</th><th style="text-align:right">Saldo</th><th style="text-align:right;width:110px">Requisitar</th><th>Un</th></tr></thead>
      <tbody>${linhas.map((l, i) => `<tr>
        <td><input type="checkbox" class="req-sel" data-i="${i}" ${temSaldo ? (l.falta > 0 ? 'checked' : '') : 'checked'}></td>
        <td>${esc(l.descricao)}</td><td style="font-family:monospace;font-size:11px">${esc(l.sku || '—')}</td>
        <td style="text-align:right">${necQtd(l.quantidade)}</td><td style="text-align:right">${l.saldo == null ? '<span style="color:var(--text3)">—</span>' : necQtd(l.saldo)}</td>
        <td><input type="number" step="0.01" min="0" class="req-qtd" data-i="${i}" value="${l.falta > 0 ? l.falta : l.quantidade}" style="width:100px;text-align:right"></td><td>${esc(l.un)}</td></tr>`).join('')}</tbody></table></div>`;
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-red" id="req-enviar">📨 Enviar ao Compras</button>`;
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('req-todos').onchange = (e) => document.querySelectorAll('.req-sel').forEach((c) => { c.checked = e.target.checked; });
  document.getElementById('req-enviar').onclick = async () => {
    const itens = [...document.querySelectorAll('.req-sel:checked')].map((c) => { const l = linhas[Number(c.dataset.i)]; const q = Number(document.querySelector(`.req-qtd[data-i="${c.dataset.i}"]`).value); return { sku: l.sku, descricao: l.descricao, quantidade: q, un: l.un, pedidos: l.pedidos }; }).filter((i) => i.quantidade > 0);
    if (!itens.length) { toast('Marque ao menos um item com quantidade.'); return; }
    document.getElementById('req-enviar').disabled = true;
    try {
      const r = await api('pcp/necessidade/requisitar', { method: 'POST', body: { horizonte: NEC.horizonte, pedidos: NEC.pedidos.map((p) => p.pedido), data_necessidade: document.getElementById('req-data').value || null, observacoes: document.getElementById('req-obs').value || null, itens } });
      closeModal();
      if (r.ok) toast(r.criada ? `Solicitação ${r.solicitacao.numero} aberta no Compras com ${itens.length} item(ns).` : `Esse conjunto já tinha sido requisitado: ${r.solicitacao.numero} (${r.solicitacao.status}).`);
      else toast(r.bloqueada ? `O Compras recusou a requisição: ${r.erro}` : `Compras fora do ar — requisição registrada e será reenviada sozinha (${r.erro}).`);
      necCarregarRequisicoes(true);
    } catch (e) { toast('Erro: ' + e.message); document.getElementById('req-enviar').disabled = false; }
  };
}
async function necCarregarRequisicoes(atualizar) {
  const el = document.getElementById('nec-requisicoes'); if (!el) return;
  try {
    const r = await api('pcp/necessidade/requisicoes' + (atualizar ? '?atualizar=1' : ''));
    const ST = { aberta: 'aberta', em_cotacao: 'em cotação', atendida: 'atendida', cancelada: 'cancelada' };
    const pend = (r.pendencias || []).filter((p) => p.tipo === 'solicitacao');
    el.innerHTML = (r.requisicoes || []).length ? `<table>
      <thead><tr><th>Quando</th><th>Por</th><th>Pedidos</th><th style="text-align:right">Itens</th><th>Solicitação no Compras</th><th>Situação</th></tr></thead>
      <tbody>${r.requisicoes.map((q) => `<tr><td>${new Date(q.created_at).toLocaleString('pt-BR')}</td><td>${esc(q.criado_por_nome || '—')}</td><td class="muted"><small>${esc((q.pedidos || []).slice(0, 4).join(', '))}${(q.pedidos || []).length > 4 ? ` +${q.pedidos.length - 4}` : ''}</small></td><td style="text-align:right">${(q.itens || []).length}</td>
        <td>${q.numero_sc ? `<b>${esc(q.numero_sc)}</b>` : '<span style="color:var(--text3)">—</span>'}</td>
        <td>${q.numero_sc ? `<span class="st ${q.status_sc === 'atendida' ? 'st-ok' : q.status_sc === 'cancelada' ? 'st-gray' : 'st-atencao'}" style="font-size:9px">${esc(ST[q.status_sc] || q.status_sc || 'enviada')}</span>` : (pend.some((p) => p.chave === 'solicitacao:' + q.origem_ref) ? `<span class="st st-vencido" style="font-size:9px" title="${esc(q.erro || '')}">pendente de envio (reenvio automático)</span>` : `<span class="st st-vencido" style="font-size:9px" title="${esc(q.erro || '')}">falhou</span>`)}</td></tr>`).join('')}</tbody></table>`
      : '<div style="color:var(--text3);font-size:12px">Nenhuma requisição feita ainda.</div>';
  } catch (e) { el.innerHTML = `<div style="color:var(--red);font-size:12px">${esc(e.message)}</div>`; }
}

function necExportarCsv() {
  if (!NEC) { toast('Calcule a necessidade primeiro.'); return; }
  const a = document.createElement('a');
  a.href = '../api/pcp/necessidade?' + necQuery() + '&formato=csv';
  a.download = '';
  document.body.appendChild(a); a.click(); a.remove();
}
