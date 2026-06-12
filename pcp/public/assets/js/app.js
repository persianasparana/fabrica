/**
 * PCP — Persianas Paraná · Planejamento e Controle da Produção
 *
 * Frontend do modelo de negócio do PCP (fila, alertas, bipagem, importação,
 * indicadores e estrutura do produto), conectado ao backend unificado
 * fabrica (Node + PostgreSQL) via /api/pcp e /api/auth.
 */
// ─── DATA ────────────────────────────────────────────────────────────────────
// ─── SESSÃO / API (PostgreSQL via backend fabrica) ───────────────────────────
let DB = [];          // itens da fila de produção (espelho local do banco)
let ESTRUTURA = [];   // estrutura do produto (catálogo oficial)
let usuario = null;
let csrfToken = '';
let currentPage = 'painel';

async function api(path, opts) {
  opts = opts || {};
  opts.credentials = 'same-origin';
  opts.headers = opts.headers || {};
  if (opts.method && opts.method !== 'GET') {
    opts.headers['X-CSRF-Token'] = csrfToken;
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
      opts.headers['Content-Type'] = 'application/json';
    }
  }
  const res = await fetch('../api/' + path, opts);
  if (res.status === 401) {
    window.location.href = 'login.html';
    throw new Error('Não autenticado');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

async function carregarSessao() {
  const data = await api('auth/session');
  usuario = data.user;
  csrfToken = data.csrf_token;
  const el = document.getElementById('user-name');
  if (el) el.textContent = data.user.full_name || data.user.username;
}

function normalizarItem(i) {
  return Object.assign({}, i, {
    id: Number(i.id),
    produto_id: i.produto_id != null ? Number(i.produto_id) : null,
    qnt: Number(i.qnt) || 1,
    especial: i.especial === true,
    pecas: (i.pecas || []).map((p) => Object.assign({}, p, { id: Number(p.id) })),
  });
}

function pecasConcluidas(item) {
  return (item.pecas || []).filter((p) => p.conclusao).length;
}
function pecasTotal(item) {
  return (item.pecas || []).length || Number(item.qnt) || 1;
}
function badgeEspecial(item, estilo) {
  return item.especial ? `<span class="st st-especial" style="${estilo || ''}">★ ESPECIAL</span> ` : '';
}

function aplicarItemAtualizado(item) {
  const n = normalizarItem(item);
  const ix = DB.findIndex((x) => x.id === n.id);
  if (ix >= 0) DB[ix] = n; else DB.push(n);
  return n;
}

async function carregarDados() {
  const [itens, estrutura] = await Promise.all([api('pcp/itens'), api('pcp/estrutura')]);
  DB = (itens.data || []).map(normalizarItem);
  ESTRUTURA = (estrutura.data || []).map((p) => Object.assign({}, p, { id: Number(p.id) }));
}

async function atualizarDados() {
  try {
    await carregarDados();
    popularSelectProdutos();
    renderAll();
    goTo(currentPage);
    toast('Dados atualizados do servidor.');
  } catch (e) { toast('Erro ao atualizar: ' + e.message); }
}

async function sair() {
  try { await api('auth/logout', { method: 'DELETE' }); } catch (e) {}
  window.location.href = 'login.html';
}

function hojeISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// ─── UTILS ───────────────────────────────────────────────────────────────────
const today = new Date(); today.setHours(0,0,0,0);
const todayStr = hojeISO();

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s); d.setHours(0,0,0,0); return isNaN(d) ? null : d;
}
function fmtDate(s) {
  if (!s) return '—';
  const d = parseDate(s);
  return d ? d.toLocaleDateString('pt-BR') : '—';
}
function diffDays(a, b) {
  if (!a || !b) return null;
  return Math.round((a - b) / 86400000);
}
function calcStatus(item) {
  const dc = parseDate(item.data_cliente);
  const co = parseDate(item.conclusao);
  if (co) {
    if (!dc) return 'ok';
    return diffDays(co, dc) <= 0 ? 'ok' : 'atraso';
  }
  if (!dc) return 'gray';
  const d = diffDays(dc, today);
  if (d < 0) return 'vencido';
  if (d <= 3) return 'atencao';
  return 'producao';
}
function statusLabel(s) {
  return {ok:'✓ No prazo',atraso:'✗ Atrasado',vencido:'✗ Vencido',atencao:'⚠ Atenção',producao:'◌ Em produção',gray:'–'}[s]||s;
}
function statusClass(s) {
  return {ok:'st-ok',atraso:'st-atraso',vencido:'st-vencido',atencao:'st-atencao',producao:'st-producao',gray:'st-gray'}[s]||'st-gray';
}
function tipoClass(t) {
  const m = {'Produção nova':'tp-novo','Retrabalho':'tp-rt','Higienização':'tp-hig','Carry-over 2025':'tp-carry','Showroom':'tp-show'};
  return m[t] || 'tp-novo';
}
function priorityOrder(item) {
  const s = calcStatus(item);
  const o = {vencido:0,atencao:1,producao:2,atraso:3,ok:4,gray:5};
  const base = o[s] ?? 5;
  const dc = parseDate(item.data_cliente);
  // dias desde a época (inteiro pequeno) — peças especiais vêm antes no mesmo status
  const dias = dc ? Math.round(dc.getTime() / 86400000) : 99999999;
  return base * 1e10 + (item.especial ? 0 : 5e9) + dias;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── NAVIGATION ──────────────────────────────────────────────────────────────
const titles = {painel:'Painel',fila:'Fila de Produção',alertas:'Alertas',busca:'Buscar Pedido',pedido:'Editar Pedido',indicadores:'Indicadores',bip:'Bipagem',estrutura:'Estrutura do Produto',novo:'Novo Pedido'};
function goTo(page) {
  currentPage = page;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('sec-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.getElementById('page-title').textContent = titles[page];
  if (page === 'fila') renderFila();
  if (page === 'alertas') renderAlertas();
  if (page === 'busca') { document.getElementById('busca-input').focus(); renderBusca(); }
  if (page === 'indicadores') renderIndicadores();
  if (page === 'estrutura') renderEstrutura();
  if (page === 'novo') renderProdutosPedido();
  if (page === 'pedido') setTimeout(()=>document.getElementById('ped-busca')?.focus(), 80);
  if (page === 'bip') setTimeout(()=>{ const el=document.getElementById('bip-input'); if(el) el.focus(); },100);
}

// ─── PAINEL ──────────────────────────────────────────────────────────────────
function renderPainel() {
  if (DB.length === 0) {
    document.getElementById('metrics-painel').innerHTML = '';
    ['painel-vencidos','painel-atencao','painel-producao'].forEach(id => {
      document.getElementById(id).innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nenhum dado. Importe um arquivo ou cadastre pedidos.</div>';
    });
    return;
  }
  const vencidos = [], atencao = [], producao = [];
  let totalAberto = 0, totalVencido = 0, totalAtencao = 0;
  
  DB.forEach(item => {
    const s = calcStatus(item);
    if (s === 'vencido') { vencidos.push(item); totalAberto++; totalVencido++; }
    else if (s === 'atencao') { atencao.push(item); totalAberto++; totalAtencao++; }
    else if (s === 'producao') { producao.push(item); totalAberto++; }
  });

  const concluidos = DB.filter(i => i.conclusao).length;
  const total = DB.length;
  const atrasados = DB.filter(i => { const s=calcStatus(i); return s==='atraso'; }).length;
  const noPrazo = DB.filter(i => calcStatus(i)==='ok').length;
  const pct = total > 0 ? Math.round(noPrazo / (noPrazo + atrasados) * 100) : 0;

  document.getElementById('metrics-painel').innerHTML = `
    <div class="metric"><div class="metric-label">Total de pedidos</div><div class="metric-value">${total.toLocaleString('pt-BR')}</div><div class="metric-sub">na base</div></div>
    <div class="metric ok"><div class="metric-label">% no prazo</div><div class="metric-value">${pct}%</div><div class="metric-sub">${noPrazo} de ${noPrazo+atrasados}</div></div>
    <div class="metric danger"><div class="metric-label">Vencidos</div><div class="metric-value">${totalVencido}</div><div class="metric-sub">em aberto</div></div>
    <div class="metric warn"><div class="metric-label">Atenção</div><div class="metric-value">${totalAtencao}</div><div class="metric-sub">vence em ≤3 dias</div></div>
    <div class="metric info"><div class="metric-label">Em produção</div><div class="metric-value">${totalAberto - totalVencido - totalAtencao}</div><div class="metric-sub">dentro do prazo</div></div>
    <div class="metric"><div class="metric-label">Concluídos</div><div class="metric-value">${concluidos.toLocaleString('pt-BR')}</div><div class="metric-sub">com data de conclusão</div></div>
    <div class="metric warn"><div class="metric-label">★ Especiais</div><div class="metric-value">${DB.filter(i=>i.especial && !i.conclusao).length}</div><div class="metric-sub">em aberto — atenção ao prazo</div></div>
  `;

  function alertHTML(items, cls, dotCls, badgeCls, limit) {
    if (!items.length) return '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nenhum item.</div>';
    return items.slice(0,limit).map(item => {
      const dc = item.data_cliente ? fmtDate(item.data_cliente) : '—';
      const s = calcStatus(item);
      const dias = item.data_cliente ? diffDays(parseDate(item.data_cliente), today) : null;
      const diasTxt = dias === null ? '' : dias < 0 ? `${Math.abs(dias)}d vencido` : dias === 0 ? 'hoje' : `${dias}d restante`;
      return `<div class="alert-item ${cls}" onclick="openDetail(${item.id})">
        <div class="alert-dot ${dotCls}"></div>
        <div class="alert-content">
          <div class="alert-produto">${badgeEspecial(item)}${esc(item.produto)}</div>
          <div class="alert-meta">Pedido ${esc(item.pedido)} · Cliente: ${dc} · Qtd: ${item.qnt}</div>
        </div>
        <span class="alert-badge ${badgeCls}">${diasTxt}</span>
      </div>`;
    }).join('') + (items.length > limit ? `<div style="font-size:11px;color:var(--text3);margin-top:6px">+ ${items.length-limit} itens</div>` : '');
  }

  document.getElementById('painel-vencidos').innerHTML = alertHTML(vencidos,'vencido','dot-red','badge-red',8);
  document.getElementById('painel-atencao').innerHTML = alertHTML(atencao,'atencao','dot-amber','badge-amber',8);
  document.getElementById('painel-producao').innerHTML = alertHTML(
    [...producao].sort((a,b) => (parseDate(a.data_cliente)||new Date(9e15)) - (parseDate(b.data_cliente)||new Date(9e15))),
    'producao','dot-blue','badge-blue',6
  );
}

// ─── ALERTAS ─────────────────────────────────────────────────────────────────
function renderAlertas() {
  const vencidos = DB.filter(i => calcStatus(i)==='vencido').sort((a,b)=>(parseDate(a.data_cliente)||0)-(parseDate(b.data_cliente)||0));
  const atencao  = DB.filter(i => calcStatus(i)==='atencao').sort((a,b)=>(parseDate(a.data_cliente)||0)-(parseDate(b.data_cliente)||0));

  document.getElementById('metrics-alertas').innerHTML = `
    <div class="metric danger"><div class="metric-label">Vencidos</div><div class="metric-value">${vencidos.length}</div></div>
    <div class="metric warn"><div class="metric-label">Atenção (≤3d)</div><div class="metric-value">${atencao.length}</div></div>
    <div class="metric info"><div class="metric-label">Total críticos</div><div class="metric-value">${vencidos.length+atencao.length}</div></div>
  `;

  function list(items, cls, dotCls, badgeCls) {
    if (!items.length) return '<div style="color:var(--text3);font-size:12px;padding:6px 0">Nenhum item.</div>';
    return items.map(item => {
      const dc = fmtDate(item.data_cliente);
      const dias = item.data_cliente ? diffDays(parseDate(item.data_cliente), today) : null;
      const diasTxt = dias === null ? '' : dias < 0 ? `${Math.abs(dias)} dias vencido` : dias === 0 ? 'vence hoje' : `${dias} dias`;
      return `<div class="alert-item ${cls}" onclick="openDetail(${item.id})">
        <div class="alert-dot ${dotCls}"></div>
        <div class="alert-content">
          <div class="alert-produto">${badgeEspecial(item)}${esc(item.produto)}</div>
          <div class="alert-meta">Ped. ${esc(item.pedido)} · Cliente: ${dc} · Qtd: ${item.qnt} · Tipo: ${esc(item.tipo)}</div>
          ${item.motivo_atraso ? `<div class="alert-meta" style="color:var(--amber)">Motivo: ${esc(item.motivo_atraso)}</div>` : ''}
        </div>
        <span class="alert-badge ${badgeCls}">${diasTxt}</span>
      </div>`;
    }).join('');
  }

  document.getElementById('alertas-vencidos').innerHTML = list(vencidos,'vencido','dot-red','badge-red');
  document.getElementById('alertas-atencao').innerHTML  = list(atencao,'atencao','dot-amber','badge-amber');
}


// ─── FILTROS DE DATA ─────────────────────────────────────────────────────────
function toggleDateFilter() {
  const campo = document.getElementById('fila-campo-data').value;
  const controls = document.getElementById('date-filter-controls');
  controls.style.display = campo ? 'flex' : 'none';
}

function toggleDatePeriod() {
  const periodo = document.getElementById('fila-periodo').value;
  document.getElementById('date-range-inputs').style.display   = periodo === 'range'    ? 'flex'  : 'none';
  document.getElementById('date-mes-input').style.display      = periodo === 'mes'      ? 'block' : 'none';
  document.getElementById('date-proximos-input').style.display = periodo === 'proximos' ? 'flex'  : 'none';
}

function limparFiltroData() {
  document.getElementById('fila-campo-data').value = '';
  document.getElementById('date-filter-controls').style.display = 'none';
  document.getElementById('fila-data-de').value = '';
  document.getElementById('fila-data-ate').value = '';
  document.getElementById('fila-mes').value = '';
  document.getElementById('fila-ndays').value = '7';
  renderFila();
}

function getDateFilterRange() {
  const campo   = document.getElementById('fila-campo-data').value;
  if (!campo) return null;
  const periodo = document.getElementById('fila-periodo').value;

  const now = new Date(); now.setHours(0,0,0,0);

  function startOfWeek(d) {
    const day = d.getDay(); // 0=sun
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.setDate(diff));
  }

  let from = null, to = null;

  if (periodo === 'range') {
    from = document.getElementById('fila-data-de').value  ? new Date(document.getElementById('fila-data-de').value  + 'T00:00:00') : null;
    to   = document.getElementById('fila-data-ate').value ? new Date(document.getElementById('fila-data-ate').value + 'T23:59:59') : null;
  } else if (periodo === 'mes') {
    const mes = document.getElementById('fila-mes').value; // "2026-06"
    if (mes) {
      const [y, m] = mes.split('-').map(Number);
      from = new Date(y, m - 1, 1);
      to   = new Date(y, m, 0, 23, 59, 59);
    }
  } else if (periodo === 'semana') {
    const d = new Date(now);
    from = startOfWeek(d);
    to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59);
  } else if (periodo === 'proxima') {
    const d = new Date(now);
    from = startOfWeek(d); from.setDate(from.getDate() + 7);
    to   = new Date(from); to.setDate(from.getDate() + 6); to.setHours(23,59,59);
  } else if (periodo === 'hoje') {
    from = new Date(now);
    to   = new Date(now); to.setHours(23,59,59);
  } else if (periodo === 'proximos') {
    const n = parseInt(document.getElementById('fila-ndays').value) || 7;
    from = new Date(now);
    to   = new Date(now); to.setDate(now.getDate() + n); to.setHours(23,59,59);
  } else if (periodo === 'vencidos') {
    from = null;
    to   = new Date(now); to.setDate(now.getDate() - 1); to.setHours(23,59,59);
  }

  return { campo, from, to };
}

function applyDateFilter(item, range) {
  if (!range) return true;
  const { campo, from, to } = range;
  const val = item[campo];
  if (!val) return false;
  const d = parseDate(val);
  if (!d) return false;
  if (from && d < from) return false;
  if (to   && d > to)   return false;
  return true;
}


// ─── ORDENAÇÃO DA FILA ───────────────────────────────────────────────────────
let filaSort = { campo: null, dir: null }; // dir: 'asc' | 'desc'

function sortFila(campo) {
  if (filaSort.campo === campo) {
    // Cicla: asc → desc → sem ordenação (prioridade padrão)
    if (filaSort.dir === 'asc')       filaSort.dir = 'desc';
    else if (filaSort.dir === 'desc') { filaSort.campo = null; filaSort.dir = null; }
    else                              filaSort.dir = 'asc';
  } else {
    filaSort.campo = campo;
    filaSort.dir = 'asc';
  }
  filaPage = 1;
  renderFila();
}

function updateSortHeaders() {
  const cols = ['produto','pedido','data_cliente','prev_producao','conclusao'];
  const labels = {
    produto:'Produto', pedido:'Pedido',
    data_cliente:'Data cliente', prev_producao:'Prev. prod.', conclusao:'Conclusão'
  };
  cols.forEach(c => {
    const el = document.getElementById('sh-' + c);
    if (!el) return;
    const arrow = filaSort.campo === c
      ? (filaSort.dir === 'asc' ? ' ▲' : ' ▼')
      : '';
    el.textContent = labels[c] + arrow;
  });
}

function applySort(items) {
  if (!filaSort.campo || !filaSort.dir) return items; // padrão: prioridade
  const { campo, dir } = filaSort;
  return [...items].sort((a, b) => {
    let va = a[campo], vb = b[campo];
    // Datas: ordenar como string ISO YYYY-MM-DD (funciona direto)
    // Nulls sempre no final
    if (!va && !vb) return 0;
    if (!va) return 1;
    if (!vb) return -1;
    // Numérico para pedido/qnt
    if (campo === 'pedido') {
      const na = parseInt(va) || 0, nb = parseInt(vb) || 0;
      return dir === 'asc' ? na - nb : nb - na;
    }
    // String/date comparison
    if (va < vb) return dir === 'asc' ? -1 :  1;
    if (va > vb) return dir === 'asc' ?  1 : -1;
    return 0;
  });
}

// ─── FILA ────────────────────────────────────────────────────────────────────
let filaPage = 1;
const PER_PAGE = 50;

function renderFila() {
  const q = document.getElementById('fila-search').value.toLowerCase().trim();
  const fs = document.getElementById('fila-status').value;
  const ft = document.getElementById('fila-tipo').value;
  const fsi = document.getElementById('fila-situacao').value;
  const fe = document.getElementById('fila-especial').value;

  const dateRange = getDateFilterRange();
  let items = DB.filter(item => {
    const s = calcStatus(item);
    if (q && !item.produto.toLowerCase().includes(q) && !String(item.pedido).includes(q)) return false;
    if (fs && s !== fs) return false;
    if (ft && item.tipo !== ft) return false;
    if (fsi === 'aberto' && item.conclusao) return false;
    if (fsi === 'concluido' && !item.conclusao) return false;
    if (fe === 'especial' && !item.especial) return false;
    if (fe === 'comum' && item.especial) return false;
    if (!applyDateFilter(item, dateRange)) return false;
    return true;
  }).sort((a,b) => priorityOrder(a) - priorityOrder(b));
  items = applySort(items);
  updateSortHeaders();

  const total = items.length;
  const pages = Math.ceil(total / PER_PAGE);
  if (filaPage > pages) filaPage = 1;
  const slice = items.slice((filaPage-1)*PER_PAGE, filaPage*PER_PAGE);

  document.getElementById('fila-count').textContent = `${total.toLocaleString('pt-BR')} itens`;

  document.getElementById('fila-tbody').innerHTML = slice.map(item => {
    const s = calcStatus(item);
    const sc = statusClass(s);
    const tc = tipoClass(item.tipo);
    const done = pecasConcluidas(item), tot = pecasTotal(item);
    return `<tr>
      <td class="td-produto">${badgeEspecial(item)}${esc(item.produto)}</td>
      <td>${esc(item.pedido)}</td>
      <td style="text-align:center">${done > 0 && done < tot ? `<b style="color:var(--blue)">${done}/${tot}</b>` : tot}</td>
      <td>${fmtDate(item.data_cliente)}</td>
      <td>${fmtDate(item.prev_producao)}</td>
      <td>${fmtDate(item.conclusao)}</td>
      <td><span class="tp ${tc}">${esc(item.tipo)}</span></td>
      <td><span class="st ${sc}">${statusLabel(s)}</span></td>
      <td class="td-obs">${esc(item.motivo_atraso||item.observacoes||'')}</td>
      <td>
        <button class="btn btn-outline" style="padding:3px 8px;font-size:10px" onclick="openDetail(${item.id})">Ver</button>
        <button class="btn btn-outline" style="padding:3px 8px;font-size:10px;margin-left:4px" onclick="editarPedido('${esc(String(item.pedido))}')" title="Editar pedido inteiro">Pedido</button>
        ${!item.conclusao ? `<button class="btn btn-black" style="padding:3px 8px;font-size:10px;margin-left:4px" onclick="concluir(${item.id})">✓</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  // Pagination
  let pag = `<button onclick="filaPage--;renderFila()" ${filaPage<=1?'disabled':''}>◀</button>`;
  const start = Math.max(1, filaPage-2), end = Math.min(pages, start+4);
  for (let p = start; p <= end; p++) {
    pag += `<button class="${p===filaPage?'active-page':''}" onclick="filaPage=${p};renderFila()">${p}</button>`;
  }
  pag += `<button onclick="filaPage++;renderFila()" ${filaPage>=pages?'disabled':''}>▶</button>`;
  pag += `<span class="pag-info">Página ${filaPage} de ${pages}</span>`;
  document.getElementById('fila-pag').innerHTML = pag;
}

async function concluir(id) {
  const item = DB.find(i => i.id === id);
  if (!item) return;
  try {
    const r = await api('pcp/itens?id=' + id, { method: 'PUT', body: { conclusao: hojeISO() } });
    aplicarItemAtualizado(r.item);
    renderFila();
    renderPainel();
    toast(`Pedido ${item.pedido} marcado como concluído.`);
  } catch (e) { toast('Erro ao concluir: ' + e.message); }
}

// ─── BUSCA ───────────────────────────────────────────────────────────────────
function renderBusca() {
  const q = document.getElementById('busca-input').value.toLowerCase().trim();
  const results = document.getElementById('busca-results');
  const countEl = document.getElementById('busca-count');

  if (q.length < 2) {
    results.innerHTML = '<div style="color:var(--text3);padding:8px 0;font-size:12px">Digite pelo menos 2 caracteres para buscar.</div>';
    countEl.textContent = '';
    return;
  }

  const found = DB.filter(i =>
    i.produto.toLowerCase().includes(q) ||
    String(i.pedido).includes(q) ||
    (i.observacoes||'').toLowerCase().includes(q)
  ).sort((a,b) => priorityOrder(a)-priorityOrder(b)).slice(0,40);

  countEl.textContent = `${found.length} resultado(s)`;

  if (!found.length) {
    results.innerHTML = '<div style="color:var(--text3);padding:8px 0;font-size:12px">Nenhum resultado encontrado.</div>';
    return;
  }

  results.innerHTML = found.map(item => {
    const s = calcStatus(item);
    const sc = statusClass(s);
    const tc = tipoClass(item.tipo);
    return `<div class="search-result" onclick="openDetail(${item.id})">
      <div class="sr-header">
        <div class="sr-produto">${badgeEspecial(item)}${esc(item.produto)}</div>
        <div style="display:flex;gap:6px">
          <span class="tp ${tc}">${esc(item.tipo)}</span>
          <span class="st ${sc}">${statusLabel(s)}</span>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><span class="detail-label">Pedido</span><span class="detail-val">${esc(item.pedido)}</span></div>
        <div class="detail-row"><span class="detail-label">Qtd</span><span class="detail-val">${item.qnt}</span></div>
        <div class="detail-row"><span class="detail-label">Data cliente</span><span class="detail-val">${fmtDate(item.data_cliente)}</span></div>
        <div class="detail-row"><span class="detail-label">Conclusão</span><span class="detail-val">${fmtDate(item.conclusao)}</span></div>
        ${item.motivo_atraso ? `<div class="detail-row" style="grid-column:1/-1"><span class="detail-label">Motivo</span><span class="detail-val" style="color:var(--amber)">${esc(item.motivo_atraso)}</span></div>` : ''}
        ${item.observacoes ? `<div class="detail-row" style="grid-column:1/-1"><span class="detail-label">Obs</span><span class="detail-val">${esc(item.observacoes)}</span></div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ─── EDITAR PEDIDO (edição em massa) ─────────────────────────────────────────
let pedidoCarregado = null;

function editarPedido(pedido) {
  goTo('pedido');
  document.getElementById('ped-busca').value = pedido;
  carregarPedido();
}

async function carregarPedido() {
  const pedido = document.getElementById('ped-busca').value.trim();
  const info = document.getElementById('ped-info');
  const cont = document.getElementById('ped-conteudo');
  if (!pedido) { toast('Digite o número do pedido.'); return; }
  info.textContent = 'Carregando...';
  try {
    const data = await api('pcp/pedido?pedido=' + encodeURIComponent(pedido));
    pedidoCarregado = data;
    info.textContent = '';
    renderPedidoEditor();
  } catch (e) {
    pedidoCarregado = null;
    info.textContent = '';
    cont.innerHTML = `<div style="color:var(--red);font-size:12px;padding:8px 0">${esc(e.message)}</div>`;
  }
}

// valor comum a todos os itens, ou '' quando divergem
function comum(itens, campo) {
  const vals = [...new Set(itens.map(i => i[campo] == null ? '' : i[campo]))];
  return vals.length === 1 ? (vals[0] || '') : '';
}
function comumPlaceholder(itens, campo) {
  const vals = new Set(itens.map(i => i[campo] == null ? '' : i[campo]));
  return vals.size > 1 ? '(vários — deixe em branco p/ manter)' : '';
}

function renderPedidoEditor() {
  const cont = document.getElementById('ped-conteudo');
  if (!pedidoCarregado) { cont.innerHTML = ''; return; }
  const { pedido, itens } = pedidoCarregado;

  const totalPecas = itens.reduce((a, i) => a + pecasTotal(i), 0);
  const baixas = itens.reduce((a, i) => a + pecasConcluidas(i), 0);
  const algumEspecial = itens.some(i => i.especial);
  const todoEspecial = itens.every(i => i.especial);

  const tiposOpts = ['Produção nova','Retrabalho','Higienização','Showroom','Carry-over 2025']
    .map(t => `<option ${comum(itens,'tipo')===t?'selected':''}>${t}</option>`).join('');
  const motivos = ['','Falta de material','Defeito de material','Ausência de colaborador','Pedido esquecido','Solicitação do cliente','Aguardando material','Aviso ao cliente pendente','Peça showroom','Outros'];
  const motivoOpts = motivos.map(m => `<option value="${esc(m)}" ${comum(itens,'motivo_atraso')===m?'selected':''}>${esc(m||'—')}</option>`).join('');

  cont.innerHTML = `
    <div class="card" style="max-width:780px">
      <div class="card-title" style="display:flex;align-items:center;gap:10px">
        <span>Pedido ${esc(pedido)}</span>
        ${todoEspecial ? '<span class="st st-especial">★ ESPECIAL</span>' : algumEspecial ? '<span class="st st-especial">★ alguns especiais</span>' : ''}
        <span style="font-weight:400;color:var(--text3);font-size:11px">${itens.length} produto(s) · ${baixas}/${totalPecas} peças com baixa</span>
      </div>

      <div class="tbl-wrap" style="margin-bottom:16px">
        <table>
          <thead><tr><th>Produto</th><th>Peças (baixa)</th><th>Status</th></tr></thead>
          <tbody>
            ${itens.map(i => {
              const s = calcStatus(i), done = pecasConcluidas(i), tot = pecasTotal(i);
              return `<tr>
                <td class="td-produto">${badgeEspecial(i)}${esc(i.produto)}</td>
                <td style="text-align:center">${done}/${tot}</td>
                <td><span class="st ${statusClass(s)}">${statusLabel(s)}</span>
                    <button class="btn btn-outline" style="padding:2px 7px;font-size:10px;margin-left:6px" onclick="openDetail(${i.id})">peças</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="card-title">Status de todas as peças</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:18px">
        <input type="date" id="ped-conclusao" value="${todayStr}"
          style="font-size:12px;border:1px solid var(--border);border-radius:6px;padding:7px 10px;background:var(--surface);color:var(--text)">
        <button class="btn btn-black" onclick="pedidoAcao('concluir')">✓ Concluir todas as peças</button>
        <button class="btn btn-outline" onclick="pedidoAcao('reabrir')">↺ Reabrir todas as peças</button>
      </div>

      <div class="card-title">Dados do pedido (aplica a todos os produtos)</div>
      <div class="form-grid">
        <div class="form-group"><label>Data do cliente</label><input type="date" id="ped-data-cliente" value="${comum(itens,'data_cliente')}"></div>
        <div class="form-group"><label>Prev. produção</label><input type="date" id="ped-prev-prod" value="${comum(itens,'prev_producao')}"></div>
        <div class="form-group"><label>Chegada PCP</label><input type="date" id="ped-chegada" value="${comum(itens,'chegada_pcp')}"></div>
        <div class="form-group"><label>Tipo</label><select id="ped-tipo">${tiposOpts}</select></div>
        <div class="form-group" style="grid-column:1/-1"><label>Motivo atraso</label><select id="ped-motivo">${motivoOpts}</select></div>
        <div class="form-group" style="grid-column:1/-1">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
            <input type="checkbox" id="ped-especial" ${todoEspecial?'checked':''} style="width:15px;height:15px;accent-color:var(--red)">
            <span>★ Marcar todos como <strong>peça especial</strong></span>
          </label>
        </div>
        <div class="form-group" style="grid-column:1/-1"><label>Observações ${comumPlaceholder(itens,'observacoes')?'<span style="font-weight:400;text-transform:none;color:var(--text3)">'+comumPlaceholder(itens,'observacoes')+'</span>':''}</label>
          <textarea id="ped-obs" rows="2">${esc(comum(itens,'observacoes'))}</textarea></div>
      </div>
      <div style="margin-top:14px;display:flex;gap:8px">
        <button class="btn btn-red" onclick="salvarPedido()">Salvar dados do pedido</button>
        <button class="btn btn-outline" onclick="carregarPedido()">Recarregar</button>
        <button class="btn btn-outline" style="margin-left:auto;color:var(--red);border-color:var(--red)" onclick="excluirPedido()">Excluir pedido inteiro</button>
      </div>
    </div>`;
}

function aplicarPedidoResposta(r) {
  pedidoCarregado = { pedido: r.pedido, itens: r.itens };
  (r.itens || []).forEach(it => aplicarItemAtualizado(it));
  renderPedidoEditor();
  renderAll();
}

async function pedidoAcao(acao) {
  if (!pedidoCarregado) return;
  const ped = pedidoCarregado.pedido;
  const conclusao = document.getElementById('ped-conclusao')?.value || null;
  const msg = acao === 'concluir'
    ? `Dar baixa em TODAS as peças em aberto do pedido ${ped}?`
    : `Reabrir TODAS as peças do pedido ${ped} (remover as baixas)?`;
  if (!confirm(msg)) return;
  try {
    const body = { acao };
    if (acao === 'concluir' && conclusao) body.conclusao = conclusao;
    const r = await api('pcp/pedido?pedido=' + encodeURIComponent(ped), { method: 'PUT', body });
    aplicarPedidoResposta(r);
    toast(acao === 'concluir' ? 'Todas as peças concluídas.' : 'Todas as peças reabertas.');
  } catch (e) { toast('Erro: ' + e.message); }
}

async function salvarPedido() {
  if (!pedidoCarregado) return;
  const ped = pedidoCarregado.pedido;
  const body = {
    data_cliente: document.getElementById('ped-data-cliente').value || undefined,
    prev_producao: document.getElementById('ped-prev-prod').value || undefined,
    chegada_pcp: document.getElementById('ped-chegada').value || undefined,
    tipo: document.getElementById('ped-tipo').value || undefined,
    motivo_atraso: document.getElementById('ped-motivo').value,
    observacoes: document.getElementById('ped-obs').value,
    especial: document.getElementById('ped-especial').checked,
  };
  try {
    const r = await api('pcp/pedido?pedido=' + encodeURIComponent(ped), { method: 'PUT', body });
    aplicarPedidoResposta(r);
    toast(`Pedido ${ped} atualizado (${r.count} produto(s)).`);
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

async function excluirPedido() {
  if (!pedidoCarregado) return;
  const ped = pedidoCarregado.pedido;
  if (!confirm(`Excluir o pedido ${ped} INTEIRO (${pedidoCarregado.itens.length} produto(s) e todas as peças)? Não é possível desfazer.`)) return;
  try {
    await api('pcp/pedido?pedido=' + encodeURIComponent(ped), { method: 'DELETE' });
    pedidoCarregado = null;
    document.getElementById('ped-conteudo').innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Pedido excluído.</div>';
    await carregarDados();
    renderAll();
    toast(`Pedido ${ped} excluído.`);
  } catch (e) { toast('Erro ao excluir: ' + e.message); }
}

// ─── INDICADORES ─────────────────────────────────────────────────────────────
function renderIndicadores() {
  const total = DB.length;
  const concluidos = DB.filter(i=>i.conclusao).length;
  const atrasados = DB.filter(i=>calcStatus(i)==='atraso').length;
  const noPrazo = DB.filter(i=>calcStatus(i)==='ok').length;
  const vencidos = DB.filter(i=>calcStatus(i)==='vencido').length;
  const pct = (noPrazo+atrasados) > 0 ? Math.round(noPrazo/(noPrazo+atrasados)*100) : 0;

  document.getElementById('metrics-ind').innerHTML = `
    <div class="metric"><div class="metric-label">Total</div><div class="metric-value">${total.toLocaleString('pt-BR')}</div></div>
    <div class="metric ok"><div class="metric-label">% no prazo</div><div class="metric-value">${pct}%</div></div>
    <div class="metric danger"><div class="metric-label">Atrasados</div><div class="metric-value">${atrasados}</div></div>
    <div class="metric danger"><div class="metric-label">Vencidos</div><div class="metric-value">${vencidos}</div></div>
    <div class="metric info"><div class="metric-label">Em aberto</div><div class="metric-value">${DB.filter(i=>!i.conclusao).length}</div></div>
  `;

  // Top produtos atrasados
  const prodAtraso = {};
  DB.filter(i=>calcStatus(i)==='atraso'||calcStatus(i)==='vencido').forEach(i => {
    prodAtraso[i.produto] = (prodAtraso[i.produto]||0)+1;
  });
  const top = Object.entries(prodAtraso).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxP = top[0]?.[1] || 1;
  document.getElementById('chart-produtos').innerHTML = top.map(([p,n]) =>
    `<div class="bar-row"><div class="bar-label">${esc(p.length>20?p.slice(0,20)+'…':p)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/maxP*100)}%;background:var(--red)"></div></div>
    <div class="bar-val" style="color:var(--red)">${n}</div></div>`
  ).join('') || '<div style="color:var(--text3);font-size:12px">Sem dados.</div>';

  // Motivos
  const motivos = {};
  DB.filter(i=>i.motivo_atraso).forEach(i => { motivos[i.motivo_atraso] = (motivos[i.motivo_atraso]||0)+1; });
  const topM = Object.entries(motivos).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxM = topM[0]?.[1] || 1;
  document.getElementById('chart-motivos').innerHTML = topM.map(([m,n]) =>
    `<div class="bar-row"><div class="bar-label">${esc(m.length>20?m.slice(0,20)+'…':m)}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/maxM*100)}%;background:var(--amber)"></div></div>
    <div class="bar-val" style="color:var(--amber)">${n}</div></div>`
  ).join('') || '<div style="color:var(--text3);font-size:12px">Sem dados.</div>';

  // Mix tipos
  const tipos = {};
  DB.forEach(i=>{ tipos[i.tipo]=(tipos[i.tipo]||0)+1; });
  const colors = {'Produção nova':'#3949AB','Retrabalho':'#E65100','Higienização':'#0D47A1','Carry-over 2025':'#C1212D','Showroom':'#7B1FA2'};
  document.getElementById('chart-tipos').innerHTML = `<div class="donut-wrap">
    <div class="donut-legend">${Object.entries(tipos).map(([t,n])=>
      `<div class="legend-item"><div class="legend-dot" style="background:${colors[t]||'#999'}"></div>${esc(t)}: <strong>${n}</strong></div>`
    ).join('')}</div></div>`;

  // Situação
  const sit = {concluido:concluidos, aberto: DB.filter(i=>!i.conclusao).length};
  document.getElementById('chart-situacao').innerHTML = `<div class="donut-wrap">
    <div class="donut-legend">
      <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div>Concluídos: <strong>${sit.concluido}</strong> (${Math.round(sit.concluido/total*100)}%)</div>
      <div class="legend-item"><div class="legend-dot" style="background:#1976D2"></div>Em aberto: <strong>${sit.aberto}</strong> (${Math.round(sit.aberto/total*100)}%)</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--red)"></div>Atrasados: <strong>${atrasados}</strong></div>
      <div class="legend-item"><div class="legend-dot" style="background:#FFA000"></div>Vencidos: <strong>${vencidos}</strong></div>
    </div></div>`;
}

// ─── MODAL DETALHE / EDIÇÃO ───────────────────────────────────────────────────
let editingId = null;
function openDetail(id) {
  const item = DB.find(i => i.id === id);
  if (!item) return;
  editingId = id;
  document.getElementById('modal-title').textContent = item.produto;
  const s = calcStatus(item);
  const sc = statusClass(s);
  const tc = tipoClass(item.tipo);

  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group"><label>Produto</label><input type="text" id="ed-produto" list="produtos-datalist" value="${esc(item.produto)}"></div>
    <div class="form-group"><label>Nº Pedido</label><input type="text" id="ed-pedido" value="${esc(item.pedido)}"></div>
    <div class="form-group"><label>Quantidade</label><input type="number" id="ed-qnt" value="${item.qnt}" min="1"></div>
    <div class="form-group"><label>Data do cliente</label><input type="date" id="ed-data-cliente" value="${item.data_cliente||''}"></div>
    <div class="form-group"><label>Chegada PCP</label><input type="date" id="ed-chegada" value="${item.chegada_pcp||''}"></div>
    <div class="form-group"><label>Prev. produção</label><input type="date" id="ed-prev-prod" value="${item.prev_producao||''}"></div>
    <div class="form-group"><label>Conclusão</label><input type="date" id="ed-conclusao" value="${item.conclusao||''}"></div>
    <div class="form-group"><label>Tipo</label>
      <select id="ed-tipo">
        ${['Produção nova','Retrabalho','Higienização','Carry-over 2025','Showroom'].map(t=>`<option ${item.tipo===t?'selected':''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label>Motivo atraso</label>
      <select id="ed-motivo">
        <option value=""></option>
        ${['Falta de material','Defeito de material','Ausência de colaborador','Pedido esquecido','Solicitação do cliente','Aguardando material','Aviso ao cliente pendente','Peça showroom','Outros'].map(m=>`<option ${item.motivo_atraso===m?'selected':''}>${m}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
        <input type="checkbox" id="ed-especial" ${item.especial ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--red)">
        <span>★ <strong>Peça especial</strong> — atenção redobrada ao prazo (ex.: pintura personalizada)</span>
      </label>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label>Observações</label><textarea id="ed-obs" rows="2">${esc(item.observacoes||'')}</textarea></div>
    <div class="form-group"><label>Status atual</label><div style="margin-top:4px"><span class="st ${sc}">${statusLabel(s)}</span></div></div>
    <div class="form-group" style="grid-column:1/-1">
      <label>Peças e etiquetas (${pecasConcluidas(item)}/${pecasTotal(item)} com baixa)</label>
      <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">
        ${(item.pecas || []).map(p => `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid var(--border);font-size:11px;flex-wrap:wrap">
            <span style="font-weight:700;min-width:26px">#${p.numero}</span>
            <span style="flex:1;font-family:monospace;min-width:120px">${p.cod_barras ? esc(p.cod_barras) : '<span style="color:var(--text3)">sem etiqueta</span>'}</span>
            ${p.conclusao ? `<span class="st st-ok">✓ ${fmtDate(p.conclusao)}</span>` : '<span class="st st-producao">pendente</span>'}
            ${p.cod_barras && !p.conclusao ? `<button class="btn btn-outline" style="padding:2px 7px;font-size:10px" onclick="desvincularPeca(${p.id})">desvincular</button>` : ''}
            ${!p.cod_barras && !p.conclusao ? `<button class="btn btn-outline" style="padding:2px 7px;font-size:10px;color:var(--blue);border-color:var(--blue)" onclick="vincularPecaManual(${p.id})">vincular etiqueta</button>` : ''}
            ${!p.conclusao
              ? `<button class="btn btn-outline" style="padding:2px 7px;font-size:10px;color:var(--green);border-color:var(--green)" onclick="baixaPeca(${p.id})">dar baixa</button>`
              : `<button class="btn btn-outline" style="padding:2px 7px;font-size:10px" onclick="reabrirPeca(${p.id})">reabrir</button>`}
          </div>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">A etiqueta é vinculada na tela de Bipagem (modo Entrada PCP). A conclusão do item é automática quando todas as peças têm baixa.</div>
    </div>
  `;

  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-outline" onclick="excluir(${id})" style="margin-right:auto;color:var(--red);border-color:var(--red)">Excluir</button>
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-red" onclick="salvarEdicao()">Salvar alterações</button>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}

async function atualizarPeca(id, body, msg) {
  try {
    const r = await api('pcp/pecas?id=' + id, { method: 'PUT', body });
    aplicarItemAtualizado(r.item);
    renderAll();
    if (currentPage === 'fila') renderFila();
    if (editingId) openDetail(editingId);
    toast(msg);
  } catch (e) { toast('Erro: ' + e.message); }
}
function vincularPecaManual(id) {
  const cod = prompt('Bipe ou digite o código da etiqueta:');
  if (!cod || !cod.trim()) return;
  atualizarPeca(id, { cod_barras: cod.trim() }, 'Etiqueta vinculada à peça.');
}
function desvincularPeca(id) {
  if (confirm('Desvincular a etiqueta desta peça?')) atualizarPeca(id, { cod_barras: null }, 'Etiqueta desvinculada.');
}
function baixaPeca(id) {
  atualizarPeca(id, { conclusao: hojeISO() }, 'Baixa registrada na peça.');
}
function reabrirPeca(id) {
  if (confirm('Reabrir esta peça (remover a baixa)?')) atualizarPeca(id, { conclusao: null }, 'Peça reaberta.');
}

function openModal() {
  goTo('novo');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId = null;
}
document.getElementById('modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

async function salvarEdicao() {
  const item = DB.find(i => i.id === editingId);
  if (!item) return;
  const produtoNome = document.getElementById('ed-produto').value.trim().toUpperCase();
  const matchEstrutura = ESTRUTURA.find(p => p.nome.toUpperCase() === produtoNome);
  const payload = {
    produto: produtoNome,
    produto_id: matchEstrutura ? matchEstrutura.id : null,
    pedido: document.getElementById('ed-pedido').value.trim(),
    qnt: parseInt(document.getElementById('ed-qnt').value) || 1,
    data_cliente: document.getElementById('ed-data-cliente').value || null,
    chegada_pcp: document.getElementById('ed-chegada').value || null,
    prev_producao: document.getElementById('ed-prev-prod').value || null,
    conclusao: document.getElementById('ed-conclusao').value || null,
    tipo: document.getElementById('ed-tipo').value,
    motivo_atraso: document.getElementById('ed-motivo').value,
    observacoes: document.getElementById('ed-obs').value.trim(),
    especial: document.getElementById('ed-especial').checked,
  };
  try {
    const r = await api('pcp/itens?id=' + editingId, { method: 'PUT', body: payload });
    aplicarItemAtualizado(r.item);
    renderAll();
    if (currentPage === 'fila') renderFila();
    closeModal();
    toast('Pedido atualizado com sucesso.');
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

async function excluir(id) {
  if (!confirm('Excluir este pedido? Não é possível desfazer.')) return;
  try {
    await api('pcp/itens?id=' + id, { method: 'DELETE' });
    DB = DB.filter(i => i.id !== id);
    renderAll();
    if (currentPage === 'fila') renderFila();
    closeModal();
    toast('Pedido excluído.');
  } catch (e) { toast('Erro ao excluir: ' + e.message); }
}

// ─── NOVO PEDIDO ─────────────────────────────────────────────────────────────
// ─── NOVO PEDIDO: vários produtos, etiqueta bipada na adição ─────────────────
let pedidoProdutos = [];

function adicionarProdutoPedido() {
  const sel = document.getElementById('fn-produto');
  const livre = document.getElementById('fn-produto-livre');
  const etiquetaEl = document.getElementById('fn-etiqueta');
  const produto = sel.value === '__livre__' ? livre.value.trim().toUpperCase() : sel.value;
  let produto_id = null;
  if (sel.value && sel.value !== '__livre__') {
    const opt = sel.options[sel.selectedIndex];
    produto_id = opt && opt.dataset.id ? Number(opt.dataset.id) : null;
  }
  if (!produto) { toast('Selecione o produto antes de adicionar.'); sel.focus(); return; }

  const etiqueta = etiquetaEl.value.trim();
  if (etiqueta && pedidoProdutos.some(p => p.etiqueta === etiqueta)) {
    toast('Esta etiqueta já foi bipada neste pedido.');
    etiquetaEl.select();
    return;
  }
  if (etiqueta && DB.some(i => (i.pecas || []).some(p => p.cod_barras === etiqueta))) {
    toast('Esta etiqueta já está vinculada a uma peça de outro pedido.');
    etiquetaEl.select();
    return;
  }

  pedidoProdutos.push({
    produto,
    produto_id,
    etiqueta: etiqueta || null,
    especial: document.getElementById('fn-especial').checked,
  });
  etiquetaEl.value = '';
  document.getElementById('fn-especial').checked = false;
  renderProdutosPedido();
  etiquetaEl.focus(); // próxima leitura (mesmo produto selecionado = sequência rápida)
}

function removerProdutoPedido(ix) {
  pedidoProdutos.splice(ix, 1);
  renderProdutosPedido();
}

function renderProdutosPedido() {
  const el = document.getElementById('fn-lista-produtos');
  if (!el) return;
  if (!pedidoProdutos.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text3)">Nenhum produto adicionado ainda.</div>';
  } else {
    el.innerHTML = `
      <table style="width:100%">
        <thead><tr><th style="width:30px">#</th><th>Produto</th><th>Etiqueta</th><th style="width:70px"></th></tr></thead>
        <tbody>
          ${pedidoProdutos.map((p, ix) => `
            <tr>
              <td>${ix + 1}</td>
              <td class="td-produto">${p.especial ? '<span class="st st-especial">★ ESPECIAL</span> ' : ''}${esc(p.produto)}</td>
              <td style="font-family:monospace">${p.etiqueta ? esc(p.etiqueta) : '<span style="color:var(--text3)">— vincular depois</span>'}</td>
              <td><button class="btn btn-outline" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="removerProdutoPedido(${ix})">remover</button></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }
  const btn = document.getElementById('fn-salvar');
  if (btn) btn.textContent = pedidoProdutos.length
    ? `Salvar pedido (${pedidoProdutos.length} produto${pedidoProdutos.length > 1 ? 's' : ''})`
    : 'Salvar pedido';
}

async function salvarNovo() {
  const pedido = document.getElementById('fn-pedido').value.trim();
  const dataCliente = document.getElementById('fn-data-cliente').value;
  if (!pedido || !dataCliente) { toast('Preencha o nº do pedido e a data do cliente.'); return; }
  if (!pedidoProdutos.length) { toast('Adicione pelo menos um produto ao pedido.'); return; }

  const base = {
    pedido,
    qnt: 1,
    data_cliente: dataCliente,
    chegada_pcp: document.getElementById('fn-chegada').value || null,
    prev_producao: document.getElementById('fn-prev-prod').value || null,
    tipo: document.getElementById('fn-tipo').value,
    motivo_atraso: document.getElementById('fn-motivo').value,
    observacoes: document.getElementById('fn-obs').value.trim(),
  };
  const itens = pedidoProdutos.map(p => Object.assign({}, base, {
    produto: p.produto,
    produto_id: p.produto_id,
    especial: p.especial,
    etiqueta: p.etiqueta || undefined,
  }));

  try {
    const r = await api('pcp/itens/lote', { method: 'POST', body: { itens } });
    await carregarDados();
    renderAll();
    limparForm();
    toast(`Pedido ${pedido} cadastrado com ${r.count} produto(s).`);
    goTo('fila');
  } catch (e) { toast('Erro ao cadastrar: ' + e.message); }
}

function limparForm() {
  ['fn-pedido','fn-chegada','fn-prev-prod','fn-obs','fn-produto-livre','fn-etiqueta'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fn-produto').value = '';
  document.getElementById('fn-produto-livre').style.display = 'none';
  document.getElementById('fn-data-cliente').value = '';
  document.getElementById('fn-tipo').value = 'Produção nova';
  document.getElementById('fn-motivo').value = '';
  document.getElementById('fn-especial').checked = false;
  pedidoProdutos = [];
  renderProdutosPedido();
}

function toggleProdutoLivre() {
  const livre = document.getElementById('fn-produto-livre');
  const mostrar = document.getElementById('fn-produto').value === '__livre__';
  livre.style.display = mostrar ? 'block' : 'none';
  if (mostrar) livre.focus();
}

// ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────
function exportXLSX() {
  const rows = [['Produto','Pedido','Qtd','Peças c/ baixa','Especial','Chegada PCP','Prev. Produção','Data Conclusão','Data Cliente','Tipo','Status','Motivo Atraso','Observações']];
  DB.forEach(i => {
    rows.push([i.produto,i.pedido,i.qnt,`${pecasConcluidas(i)}/${pecasTotal(i)}`,i.especial?'Sim':'',i.chegada_pcp||'',i.prev_producao||'',i.conclusao||'',i.data_cliente||'',i.tipo,statusLabel(calcStatus(i)),i.motivo_atraso||'',i.observacoes||'']);
  });
  // CSV with BOM for Excel compatibility
  const bom = '\uFEFF';
  const csv = bom + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `PCP_Persianas_Parana_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('Exportado com sucesso. Abra com Excel.');
}






// ─── PDF DIRETO (pdf.js local) ───────────────────────────────────────────────
async function importPDFDirect(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  // Show modal loading
  document.getElementById('pdf-modal-overlay').style.display = 'flex';
  document.getElementById('pdf-loading').style.display = 'block';
  document.getElementById('pdf-result').style.display = 'none';
  document.getElementById('pdf-error').style.display = 'none';
  document.getElementById('pdf-modal-footer').style.display = 'none';
  document.getElementById('pdf-modal-sub').textContent = file.name;
  document.getElementById('pdf-loading-msg').textContent = 'Lendo o PDF...';
  pdfParsedItems = [];

  if (typeof pdfjsLib === 'undefined') {
    showPdfError('Biblioteca PDF não carregou. Recarregue a página e tente novamente.');
    return;
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      fullText += content.items.map(i => i.str).join(' ') + '\n';
    }
    document.getElementById('pdf-loading-msg').textContent = 'Processando dados...';
    const parsed = parsePersianasOrder(fullText);
    renderPdfPreview(parsed);
  } catch(err) {
    showPdfError('Erro ao ler o PDF: ' + err.message);
  }
}

function parsePersianasOrder(text) {
  // ── Normalizar texto ──
  const t = text.replace(/\s+/g, ' ').trim();

  // ── Número do pedido ──
  let pedido = '';
  const mPed = t.match(/N[uú]mero\s+F[aá]brica\s+(\d+)/i) ||
               t.match(/Pedido\s+(\d{4,6})\b/) ||
               t.match(/N[uú]mero\s+Revenda\s+(\d+)/i);
  if (mPed) pedido = mPed[1];

  // ── Data do pedido ──
  let data_pedido = null;
  const mDp = t.match(/Data\s+do\s+Pedido\s+(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (mDp) data_pedido = normDate(mDp[1], mDp[2], mDp[3]);

  // ── Prev. Saída = data cliente ──
  let data_cliente = null;
  const mPs = t.match(/Prev\.?\s*Sa[íi]da\s+(\d{2})\/(\d{2})\/(\d{2,4})/i) ||
              t.match(/Prev\.\s+Sa[íi]da\s*:?\s*(\d{2})\/(\d{2})\/(\d{2,4})/i);
  if (mPs) data_cliente = normDate(mPs[1], mPs[2], mPs[3]);

  // ── Cliente ──
  let cliente = '';
  const mCli = t.match(/^\d{4}\s+-\s+(.+?)\s+CPF/i) ||
               t.match(/(\d{4})\s+-\s+([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+){1,6})\s+CPF/i);
  if (mCli) cliente = (mCli[2] || mCli[1] || '').trim();

  // ── Produtos ──
  // Padrão: 001 Nome do produto MEDIDA ... QTD  VALOR  VALOR
  // ex: "001 Cortina Rolô Soft 0,660 X 1,730 1,142 1 620,00 620,00"
  const itens = [];
  // Match product lines: starts with 3-digit sequence number
  const prodRegex = /(\d{3})\s+([\w\sÀ-úãõâêîôûáéíóúàèìòùç,\.\/\-]+?)\s+([\d,]+\s+X\s+[\d,]+)?\s*([\d,]+)?\s+(\d+)\s+[\d\.,]+\s+[\d\.,]+/gi;
  
  let match;
  while ((match = prodRegex.exec(t)) !== null) {
    const rawNome = (match[2] || '').trim();
    const medida = match[3] ? match[3].trim() : '';
    const qnt = parseInt(match[5]) || 1;

    // Look for the spec block after this product line
    // Spec block typically contains: Modelo*, Acabamento*, Coleção*, etc.
    const afterProduct = t.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const obsMatch = afterProduct.match(/Modelo\*?[:\s].+?(?=(?:\d{3}\s+[A-Z]|Valor Total|$))/is);
    const obsRaw = obsMatch ? obsMatch[0].replace(/\s+/g, ' ').trim() : '';

    // Simplify obs: extract key fields
    const obs = buildObs(rawNome, medida, obsRaw);

    // Simplify product name for PCP
    const produto = simplifyProductName(rawNome, obsRaw);

    itens.push({ produto, qnt, observacoes: obs });

    // Check if there's a bando/trilho in spec — add as separate item
    if (/bando/i.test(obsRaw)) {
      const bandoColor = (obsRaw.match(/Cor\s+Perfil[^,]*:\s*([^,]+)/i)||[])[1]||'';
      itens.push({ produto: 'BANDO', qnt, observacoes: `Bando Vision${bandoColor ? ' | ' + bandoColor.trim() : ''} | Ped. ${pedido}` });
    }
  }

  // Fallback: if regex didn't catch products, try simpler approach
  if (!itens.length) {
    const lines = t.split(/\n/);
    lines.forEach(line => {
      const lm = line.match(/^(\d{3})\s+(.+?)\s+(\d+)\s+[\d\.,]+\s+[\d\.,]+\s*$/);
      if (lm) {
        itens.push({
          produto: simplifyProductName(lm[2], ''),
          qnt: parseInt(lm[3]) || 1,
          observacoes: lm[2].trim()
        });
      }
    });
  }

  return { pedido, data_pedido, data_cliente, cliente, itens };
}

function normDate(d, m, y) {
  const year = y.length === 2 ? '20' + y : y;
  return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function simplifyProductName(raw, obs) {
  const r = raw.toUpperCase();
  const o = (obs||'').toUpperCase();

  if (/ROLO|ROL[Ô O]/.test(r)) {
    if (/MOTORIZ/.test(r+o)) return 'ROLO MOTORIZADO';
    if (/SOFT\s+SHEER|SHEER\s+STRIPE/.test(r+o)) return 'ROLO SOFT SHEER';
    if (/SOFT/.test(r+o)) return 'ROLO SOFT LISA';
    if (/SHEER/.test(r+o)) return 'ROLO SHEER';
    if (/VISION/.test(r+o)) return 'ROLO VISION SHEER';
    return 'ROLO LISA';
  }
  if (/CORTINA/.test(r)) {
    if (/MOTORIZ/.test(r+o)) return 'CORTINA MOTORIZADA';
    if (/FRANZIDO|FRANZIDA/.test(r+o)) return 'CORTINA FRANZIDO';
    if (/GOMOS/.test(r+o)) return 'CORTINA GOMOS';
    return 'CORTINA';
  }
  if (/PERSIANA|PH\s*25|PH25/.test(r)) return 'PH25MM';
  if (/PH\s*50|PH50/.test(r)) return 'PH50MM';
  if (/ROMANA/.test(r)) return 'ROMANA';
  if (/TRILHO\s+VERT/.test(r)) return 'TRILHO VERTICAL';
  if (/TRILHO\s+SU[IÍ]/.test(r)) return 'TRILHO SUÍÇO';
  if (/BOX/.test(r)) return 'BOX70MM';
  if (/BANDO/.test(r)) return 'BANDO';
  if (/ROMANA/.test(r)) return 'ROMANA';
  // fallback: clean up the raw name
  return raw.replace(/\d+[,\.]\d+\s*[Xx]\s*\d+[,\.]\d+/g,'').replace(/\s+/g,' ').trim().toUpperCase().slice(0,30);
}

function buildObs(nome, medida, obsRaw) {
  const parts = [];
  if (medida) parts.push(medida);
  // Extract key spec fields
  const fields = [
    ['Modelo', /Modelo\*?[:\s]+([^,\|]+)/i],
    ['Cor', /Cor\s+Cole[çc][ãa]o[:\s]+([^,\|]+)/i],
    ['Acabamento', /Acabamento\*?[:\s]+([^,\|]+)/i],
    ['Acionamento', /Acionamento\*?[:\s]+([^,\|]+)/i],
    ['Ambiente', /Ambiente[:\s]+([^,\|]+)/i],
    ['Obs', /Observa[çc][õo]es[:\s]+([^,\|\.]+)/i],
  ];
  fields.forEach(([label, rx]) => {
    const m = obsRaw.match(rx);
    if (m && m[1].trim().length > 1) parts.push(m[1].trim());
  });
  return parts.join(' | ').slice(0, 200);
}

// ─── JSON PASTE (PDF lido no chat) ───────────────────────────────────────────
function openJsonPaste() {
  document.getElementById('json-paste-overlay').style.display = 'flex';
  document.getElementById('json-paste-input').value = '';
  document.getElementById('json-paste-error').style.display = 'none';
  setTimeout(() => document.getElementById('json-paste-input').focus(), 50);
}
function closeJsonPaste() {
  document.getElementById('json-paste-overlay').style.display = 'none';
}
document.getElementById('json-paste-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('json-paste-overlay')) closeJsonPaste();
});

function processJsonPaste() {
  const raw = document.getElementById('json-paste-input').value.trim();
  const errEl = document.getElementById('json-paste-error');
  errEl.style.display = 'none';
  if (!raw) { errEl.textContent = 'Cole o JSON antes de continuar.'; errEl.style.display = 'block'; return; }

  let parsed;
  try {
    let clean = raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
    parsed = JSON.parse(clean);
  } catch(e) {
    errEl.textContent = 'JSON inválido. Verifique se copiou o texto completo.';
    errEl.style.display = 'block';
    return;
  }

  closeJsonPaste();
  // Reuse the existing PDF preview modal
  pdfParsedItems = (parsed.itens || []).map((item, i) => ({
    _idx: i,
    pedido: parsed.pedido || '',
    data_pedido: parsed.data_pedido || null,
    data_cliente: parsed.data_cliente || null,
    cliente: parsed.cliente || '',
    produto: (item.produto || '').toUpperCase(),
    qnt: item.qnt || 1,
    observacoes: item.observacoes || '',
  }));

  if (!pdfParsedItems.length) {
    toast('Nenhum item encontrado no JSON.');
    return;
  }

  // Show the PDF review modal with the parsed data
  document.getElementById('pdf-modal-overlay').style.display = 'flex';
  document.getElementById('pdf-loading').style.display = 'none';
  document.getElementById('pdf-error').style.display = 'none';
  document.getElementById('pdf-modal-sub').textContent = `Pedido ${parsed.pedido || ''} — ${parsed.cliente || ''}`;
  renderPdfPreview(parsed);
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────
function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const name = file.name.toLowerCase();

  if (name.endsWith('.csv')) {
    const reader = new FileReader();
    reader.onload = e => {
      parseCSV(e.target.result);
      event.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
    return;
  }

  // XLSX via SheetJS (vendorizado localmente — sem CDN)
  const lerXlsx = () => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, {type:'array', cellDates:true});
        // Try sheet named PLANEJAMENTO, else first sheet
        const sheetName = wb.SheetNames.includes('PLANEJAMENTO') ? 'PLANEJAMENTO' : wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, {defval:''});
        processImportedRows(rows, sheetName);
      } catch(err) {
        toast('Erro ao ler o arquivo. Tente exportar como CSV primeiro.');
      }
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };
  if (window.XLSX) { lerXlsx(); return; }
  const script = document.createElement('script');
  script.src = 'assets/vendor/xlsx.full.min.js';
  script.onload = lerXlsx;
  script.onerror = () => toast('Falha ao carregar biblioteca de leitura. Use CSV.');
  document.head.appendChild(script);
}

function fmtImportDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val)) return null;
    return val.toISOString().split('T')[0];
  }
  const s = String(val).trim();
  if (!s || s === '—' || s === 'null') return null;
  // DD/MM/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return null;
}

function processImportedRows(rows, sheetName) {
  // Column name aliases (handles both our export and the original XLSX headers)
  const alias = {
    produto:       ['PRODUTO','Produto','produto'],
    pedido:        ['PEDIDO','Pedido','pedido','PEDIDO  '],
    qnt:           ['QNT','Qtd','qnt','QUANTIDADE','Quantidade'],
    chegada_pcp:   ['CHEGADA PCP','Chegada PCP','chegada_pcp','CHEGADA_PCP'],
    prev_inicial:  ['PREV. INICIAL','DATA PREVISTA INICIAL','prev_inicial'],
    prev_producao: ['PREV. PRODUÇÃO','DATA PREVISTA\n PRODUÇÃO','prev_producao','Prev. produção'],
    conclusao:     ['CONCLUSÃO','DATA DA \nCONCLUSÃO','conclusao','Data Conclusão'],
    data_cliente:  ['DATA CLIENTE','Data Cliente','data_cliente','DATA CLIENTE'],
    tipo:          ['TIPO','Tipo','tipo'],
    motivo_atraso: ['MOTIVO ATRASO','Motivo Atraso','motivo_atraso'],
    observacoes:   ['OBSERVAÇÕES','Observações','observacoes'],
    especial:      ['ESPECIAL','Especial','especial'],
  };

  function get(row, field) {
    for (const k of alias[field]) {
      if (k in row) return row[k];
    }
    return '';
  }

  const imported = [];
  rows.forEach((row) => {
    const prod = String(get(row,'produto')||'').trim();
    if (!prod || prod.toUpperCase() === 'PRODUTO') return;
    const nomeUpper = prod.toUpperCase();
    const matchEstrutura = ESTRUTURA.find(p => p.nome.toUpperCase() === nomeUpper);
    imported.push({
      produto: nomeUpper,
      produto_id: matchEstrutura ? matchEstrutura.id : null,
      pedido: String(get(row,'pedido')||'').replace('.0','').trim(),
      qnt: parseInt(get(row,'qnt')) || 1,
      chegada_pcp:   fmtImportDate(get(row,'chegada_pcp')),
      prev_inicial:  fmtImportDate(get(row,'prev_inicial')),
      prev_producao: fmtImportDate(get(row,'prev_producao')),
      conclusao:     fmtImportDate(get(row,'conclusao')),
      data_cliente:  fmtImportDate(get(row,'data_cliente')),
      tipo:          String(get(row,'tipo')||'Produção nova').trim() || 'Produção nova',
      motivo_atraso: String(get(row,'motivo_atraso')||'').trim(),
      observacoes:   String(get(row,'observacoes')||'').trim(),
      especial:      /^(s|sim|x|1|true)$/i.test(String(get(row,'especial')||'').trim()),
    });
  });

  if (!imported.length) { toast('Nenhum dado válido encontrado no arquivo.'); return; }
  if (imported.some(i => !i.pedido)) { toast('Há linhas sem número de pedido — corrija o arquivo.'); return; }

  const substituir = DB.length > 0 && confirm(`Substituir os ${DB.length} pedidos existentes pelos ${imported.length} importados?\n\nCancelar = adicionar ao existente.`);

  (async () => {
    try {
      const r = await api('pcp/itens/lote', { method: 'POST', body: { itens: imported, substituir } });
      await carregarDados();
      renderAll();
      if (currentPage === 'fila') renderFila();
      toast(`${r.count} pedidos importados da aba "${sheetName}".`);
    } catch (e) { toast('Erro na importação: ' + e.message); }
  })();
}

function parseCSV(text) {
  // Remove BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const sep = text.includes(';') ? ';' : ',';
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) { toast('CSV vazio ou inválido.'); return; }

  const headers = lines[0].split(sep).map(h=>h.replace(/^"|"$/g,'').trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(sep).map(v=>v.replace(/^"|"$/g,'').trim());
    const obj = {};
    headers.forEach((h,i) => obj[h] = vals[i]||'');
    return obj;
  });
  processImportedRows(rows, 'CSV');
}




// ─── PDF/JSON — REVISÃO E CONFIRMAÇÃO ────────────────────────────────────────
let pdfParsedItems = [];
let pdfParsedHeader = { pedido: '', data_cliente: null, cliente: '' };

function showPdfError(msg) {
  document.getElementById('pdf-loading').style.display = 'none';
  document.getElementById('pdf-result').style.display = 'none';
  document.getElementById('pdf-modal-footer').style.display = 'none';
  document.getElementById('pdf-error').style.display = 'block';
  document.getElementById('pdf-error-msg').textContent = msg;
}

function closePdfModal() {
  document.getElementById('pdf-modal-overlay').style.display = 'none';
  pdfParsedItems = [];
}

function renderPdfPreview(parsed) {
  pdfParsedHeader = {
    pedido: parsed.pedido || '',
    data_cliente: parsed.data_cliente || null,
    cliente: parsed.cliente || '',
  };
  pdfParsedItems = (parsed.itens || []).map((item) => ({
    produto: (item.produto || '').toUpperCase(),
    qnt: item.qnt || 1,
    observacoes: item.observacoes || '',
  }));

  if (!pdfParsedItems.length) {
    showPdfError('Nenhum produto identificado. Confira se o PDF é uma ordem de produção da fábrica.');
    return;
  }

  document.getElementById('pdf-loading').style.display = 'none';
  document.getElementById('pdf-error').style.display = 'none';
  document.getElementById('pdf-result').style.display = 'block';
  document.getElementById('pdf-modal-footer').style.display = 'flex';

  const container = document.getElementById('pdf-items-container');
  container.innerHTML = `
    <div class="form-grid" style="margin-bottom:14px">
      <div class="form-group"><label>Nº Pedido *</label><input type="text" id="pdf-h-pedido" value="${esc(pdfParsedHeader.pedido)}"></div>
      <div class="form-group"><label>Data do cliente (Prev. Saída)</label><input type="date" id="pdf-h-data" value="${pdfParsedHeader.data_cliente||''}"></div>
    </div>
    ${pdfParsedHeader.cliente ? `<div style="font-size:11px;color:var(--text3);margin-bottom:10px">Cliente: <strong>${esc(pdfParsedHeader.cliente)}</strong></div>` : ''}
    ${pdfParsedItems.map((it, i) => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px" data-pdf-row="${i}">
        <div class="form-grid">
          <div class="form-group"><label>Produto *</label><input type="text" id="pdf-i-produto-${i}" list="produtos-datalist" value="${esc(it.produto)}"></div>
          <div class="form-group"><label>Qtd</label><input type="number" id="pdf-i-qnt-${i}" value="${it.qnt}" min="1"></div>
          <div class="form-group" style="grid-column:1/-1"><label>Observações</label><input type="text" id="pdf-i-obs-${i}" value="${esc(it.observacoes)}"></div>
        </div>
        <button class="btn btn-outline" style="margin-top:8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="removerPdfItem(${i})">✕ Remover item</button>
      </div>`).join('')}
  `;
  document.getElementById('pdf-raw-obs').textContent =
    'Confira os produtos contra a Estrutura do Produto antes de salvar. A chegada no PCP será registrada como hoje.';
}

function removerPdfItem(i) {
  pdfParsedItems[i] = null;
  const row = document.querySelector(`[data-pdf-row="${i}"]`);
  if (row) row.remove();
}

async function confirmarPdfImport() {
  const pedido = document.getElementById('pdf-h-pedido').value.trim();
  const dataCliente = document.getElementById('pdf-h-data').value || null;
  if (!pedido) { toast('Informe o número do pedido.'); return; }

  const itens = [];
  pdfParsedItems.forEach((it, i) => {
    if (!it) return;
    const produto = (document.getElementById(`pdf-i-produto-${i}`)?.value || '').trim().toUpperCase();
    if (!produto) return;
    const matchEstrutura = ESTRUTURA.find(p => p.nome.toUpperCase() === produto);
    itens.push({
      produto,
      produto_id: matchEstrutura ? matchEstrutura.id : null,
      pedido,
      qnt: parseInt(document.getElementById(`pdf-i-qnt-${i}`)?.value) || 1,
      chegada_pcp: hojeISO(),
      data_cliente: dataCliente,
      tipo: 'Produção nova',
      motivo_atraso: '',
      observacoes: (document.getElementById(`pdf-i-obs-${i}`)?.value || '').trim(),
    });
  });
  if (!itens.length) { toast('Nenhum item para importar.'); return; }

  try {
    const r = await api('pcp/itens/lote', { method: 'POST', body: { itens } });
    await carregarDados();
    renderAll();
    closePdfModal();
    toast(`${r.count} item(ns) do pedido ${pedido} importado(s) com sucesso.`);
    goTo('fila');
  } catch (e) { toast('Erro ao importar: ' + e.message); }
}

document.getElementById('pdf-modal-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('pdf-modal-overlay')) closePdfModal();
});

// ─── BIPAGEM ─────────────────────────────────────────────────────────────────
let bipTimer = null;
let bipSessao = [];

function bipDigitado() {
  clearTimeout(bipTimer);
  bipTimer = setTimeout(processBip, 1500);
}

// Embalagem: cada bip dá baixa em UMA peça (a vinculação da etiqueta é feita
// no cadastro do pedido, pelo operador do PCP).
async function processBip() {
  clearTimeout(bipTimer);
  const input = document.getElementById('bip-input');
  const codigo = input.value.trim();
  if (!codigo) return;
  input.value = '';
  input.focus();

  try {
    const r = await api('pcp/bip', { method: 'POST', body: { codigo } });
    if (r.acao === 'desconhecido') {
      const res = document.getElementById('bip-resultado');
      if (res) res.innerHTML = `
        <div style="background:var(--amber-bg);border:2px solid #FFA000;border-radius:8px;padding:16px 20px;margin-bottom:16px">
          <div style="font-size:13px;font-weight:700;color:var(--amber);margin-bottom:4px">⚠ Etiqueta não vinculada</div>
          <div style="font-size:12px;color:var(--text2)">
            O código <strong>${esc(codigo)}</strong> não está vinculado a nenhuma peça.<br>
            Procure o operador do PCP para vincular a etiqueta no cadastro do pedido.
          </div>
        </div>`;
      return;
    }
    const item = aplicarItemAtualizado(r.item);
    showBipResultado(r.acao, item, codigo, r.peca_numero);
    addBipHistorico(r.acao, item, r.peca_numero);
    if (r.acao !== 'jafoi') renderAll();
  } catch (e) { toast('Erro na bipagem: ' + e.message); }
}

function showBipResultado(tipo, item, codigo, pecaNumero) {
  const res = document.getElementById('bip-resultado');
  if (!res) return;
  const done = pecasConcluidas(item), total = pecasTotal(item);
  const cfg = {
    baixa: { bg:'var(--green-bg)', border:'var(--green)',  icon:'✅', cor:'var(--green)',
             titulo: done >= total ? 'Baixa registrada — todas as peças do item concluídas!' : 'Baixa de produção registrada' },
    jafoi: { bg:'var(--gray-bg)',  border:'var(--border)', icon:'ℹ️', cor:'var(--text3)',
             titulo:'Esta peça já teve baixa' },
  };
  const c = cfg[tipo] || cfg.jafoi;
  res.innerHTML = `
    <div style="background:${c.bg};border:2px solid ${c.border};border-radius:8px;padding:16px 20px;margin-bottom:16px;animation:fadeIn .2s ease">
      <div style="font-size:24px;margin-bottom:6px">${c.icon}</div>
      <div style="font-size:15px;font-weight:700;color:${c.cor};margin-bottom:6px">${c.titulo}</div>
      <div style="font-size:13px;font-weight:700">${badgeEspecial(item)}${esc(item.produto)} — peça #${pecaNumero || '?'}</div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px">
        Pedido ${esc(item.pedido)} · ${done}/${total} peças com baixa · Cliente: ${fmtDate(item.data_cliente)}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Cód: ${esc(codigo)}</div>
    </div>`;
  setTimeout(() => { if (res) res.innerHTML = ''; }, 6000);
}

function addBipHistorico(tipo, item, pecaNumero) {
  const hora = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  bipSessao.unshift({tipo, item:{...item}, pecaNumero, hora});
  const el = document.getElementById('bip-historico');
  if (!el) return;
  const icons = {baixa:'✅', jafoi:'ℹ️'};
  const labels = {baixa:'Baixa registrada', jafoi:'Já tinha baixa'};
  el.innerHTML = bipSessao.slice(0,20).map((b) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border);border-radius:4px">
      <span style="font-size:15px">${icons[b.tipo]||'•'}</span>
      <div style="flex:1">
        <div style="font-weight:700;font-size:12px">${b.item.especial ? '★ ' : ''}${esc(b.item.produto)}${b.pecaNumero ? ` — peça #${b.pecaNumero}` : ''}</div>
        <div style="font-size:11px;color:var(--text3)">Ped. ${esc(b.item.pedido)} · ${labels[b.tipo]||b.tipo}</div>
      </div>
      <div style="font-size:11px;color:var(--text3)">${b.hora}</div>
    </div>`).join('');
}

function limparBipHistorico() {
  bipSessao = [];
  const el = document.getElementById('bip-historico');
  if (el) el.innerHTML = '<div style="color:var(--text3);font-size:12px">Nenhum bip registrado ainda.</div>';
}


// ─── ESTRUTURA DO PRODUTO (catálogo oficial: fórmulas de corte + BOM) ────────
const FAMILIA_META = {
  SOFT:          { rotulo: 'Soft',            cor: '#d97706' },
  PREMIUM:       { rotulo: 'Premium',         cor: '#0891b2' },
  MOTORIZADAS:   { rotulo: 'Motorizada',      cor: '#7c3aed' },
  INTERMEDIARIO: { rotulo: 'Intermediária',   cor: '#65a30d' },
  ACOPLADA:      { rotulo: 'Acoplada',        cor: '#0d9488' },
  ROMANA:        { rotulo: 'Romana/Painel',   cor: '#c2410c' },
  HORIZONTAL:    { rotulo: 'Horizontal (PH)', cor: '#475569' },
};
function familiaMeta(f) {
  return FAMILIA_META[f] || { rotulo: f, cor: '#606060' };
}

let estruturaAberta = {};

function fmtQtdComponente(c) {
  if (c.qtdFormula) {
    if (/garras/i.test(c.qtdFormula)) return '× conforme largura';
    return '× ' + c.qtdFormula;
  }
  return '× ' + (c.qtd != null ? c.qtd : 1);
}

function renderEstrutura() {
  const lista = document.getElementById('estrutura-lista');
  const busca = (document.getElementById('estrutura-busca').value || '').toLowerCase().trim();
  const countEl = document.getElementById('estrutura-count');

  const filtrados = ESTRUTURA.filter(p =>
    !busca ||
    p.nome.toLowerCase().includes(busca) ||
    p.familia.toLowerCase().includes(busca) ||
    familiaMeta(p.familia).rotulo.toLowerCase().includes(busca)
  );
  countEl.textContent = `${filtrados.length} de ${ESTRUTURA.length} produto(s)`;

  if (!filtrados.length) {
    lista.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nenhum produto encontrado.</div>';
    return;
  }

  const porFamilia = {};
  filtrados.forEach(p => { (porFamilia[p.familia] = porFamilia[p.familia] || []).push(p); });

  lista.innerHTML = Object.entries(porFamilia).map(([fam, prods]) => {
    const meta = familiaMeta(fam);
    return `<div class="fam-card">
      <div class="fam-header">
        <div class="fam-badge" style="background:${meta.cor}22;color:${meta.cor};border:1px solid ${meta.cor}55">${esc(meta.rotulo[0])}</div>
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">${esc(meta.rotulo)}</div>
        <span style="font-size:10px;color:var(--text3)">${prods.length} produto(s)</span>
      </div>
      ${prods.map(p => {
        const aberto = estruturaAberta[p.id];
        return `<div class="prod-row">
          <button class="prod-toggle" onclick="toggleProduto(${p.id})">
            <span style="color:${aberto ? 'var(--red)' : 'var(--text3)'};font-size:10px">${aberto ? '▼' : '▶'}</span>
            <span style="flex:1;font-weight:600">${esc(p.nome)}</span>
            ${p.unidade === 'm' ? '<span class="st st-atencao" style="font-size:9px">medidas em METROS</span>' : ''}
            ${p.tubo ? `<span style="font-size:10px;color:var(--text3)">∅ ${esc(p.tubo)}</span>` : ''}
          </button>
          ${aberto ? `<div class="prod-detail">
            <div>
              <h4>Fórmulas de corte</h4>
              <ul style="list-style:none;display:flex;flex-direction:column;gap:3px">
                ${(p.cortes||[]).map(c => `<li>
                  <span style="color:var(--red)">▸</span> <strong>${esc(c.nome)}</strong>
                  <span style="color:var(--text3)">[${esc(c.dim||'L')}]</span> =
                  <code style="background:var(--gray-bg);padding:1px 5px;border-radius:4px">${esc(c.formula)}</code>
                  ${c.qtd && c.qtd > 1 ? `<span style="color:var(--text3)"> ×${c.qtd}</span>` : ''}
                  ${c.qtdFormula ? `<span style="color:var(--text3)"> ×(${esc(c.qtdFormula)})</span>` : ''}
                </li>`).join('')}
              </ul>
            </div>
            <div>
              <h4>Componentes (BOM)</h4>
              <ul style="list-style:none;display:flex;flex-direction:column;gap:3px">
                ${(p.componentes||[]).map(c => `<li>
                  <span style="color:var(--red)">▸</span> ${esc(c.nome)}
                  <span style="color:var(--text3)">${esc(fmtQtdComponente(c))}</span>
                  ${c.obs ? `<span style="color:var(--amber);font-size:10px"> — ${esc(c.obs)}</span>` : ''}
                </li>`).join('')}
              </ul>
              ${p.calculo_extra_fonte ? '<div style="margin-top:8px;font-size:10px;color:var(--text3)">ℹ Este produto tem cálculo especial (cordas/furos/lâminas) preservado da planilha original.</div>' : ''}
              <div style="margin-top:10px;display:flex;gap:6px">
                <button class="btn btn-outline" style="font-size:10px" onclick="abrirProdutoModal(${p.id})">✎ Editar</button>
                <button class="btn btn-outline" style="font-size:10px;color:var(--red);border-color:var(--red)" onclick="desativarProduto(${p.id})">Desativar</button>
              </div>
            </div>
          </div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function toggleProduto(id) {
  estruturaAberta[id] = !estruturaAberta[id];
  renderEstrutura();
}

// ── Editor de produto (cria/edita no banco) ──────────────────────────────────
let produtoEditandoId = null;

function cortesParaTexto(cortes) {
  return (cortes||[]).map(c => {
    const partes = [c.nome, c.formula, c.dim || 'L'];
    if (c.qtd && c.qtd > 1) partes.push(String(c.qtd));
    else if (c.qtdFormula) partes.push(c.qtdFormula);
    return partes.join(' | ');
  }).join('\n');
}
function componentesParaTexto(comps) {
  return (comps||[]).map(c => {
    const partes = [c.nome, c.qtdFormula ? c.qtdFormula : String(c.qtd != null ? c.qtd : 1)];
    if (c.obs) partes.push(c.obs);
    return partes.join(' | ');
  }).join('\n');
}
function textoParaCortes(txt) {
  return txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [nome, formula, dim, qtd] = l.split('|').map(s => (s||'').trim());
    if (!nome || !formula) throw new Error(`Linha de corte inválida: "${l}" (use: nome | fórmula | L ou A | qtd)`);
    const c = { nome, formula, dim: (dim || 'L').toUpperCase() === 'A' ? 'A' : 'L' };
    if (qtd) {
      if (/^\d+$/.test(qtd)) { if (Number(qtd) > 1) c.qtd = Number(qtd); }
      else c.qtdFormula = qtd;
    }
    return c;
  });
}
function textoParaComponentes(txt) {
  return txt.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const [nome, qtd, obs] = l.split('|').map(s => (s||'').trim());
    if (!nome) throw new Error(`Linha de componente inválida: "${l}" (use: nome | qtd | obs)`);
    const c = { nome };
    const q = qtd || '1';
    if (/^\d+([\.,]\d+)?$/.test(q)) c.qtd = Number(q.replace(',', '.'));
    else c.qtdFormula = q;
    if (obs) c.obs = obs;
    return c;
  });
}

function abrirProdutoModal(id) {
  produtoEditandoId = id || null;
  const p = id ? ESTRUTURA.find(x => x.id === id) : null;
  const familias = Object.keys(FAMILIA_META);

  document.getElementById('modal-title').textContent = p ? `Estrutura — ${p.nome}` : 'Novo produto na estrutura';
  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group"><label>Nome do produto *</label><input type="text" id="ep-nome" value="${p ? esc(p.nome) : ''}" placeholder="Ex: Soft Lisa Novus — Sem Plus"></div>
    <div class="form-group"><label>Família *</label>
      <select id="ep-familia">${familias.map(f => `<option value="${f}" ${p && p.familia === f ? 'selected' : ''}>${esc(familiaMeta(f).rotulo)}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Tubo</label><input type="text" id="ep-tubo" value="${p && p.tubo ? esc(p.tubo) : ''}" placeholder="Ex: 32mm"></div>
    <div class="form-group"><label>Unidade das medidas</label>
      <select id="ep-unidade">
        <option value="cm" ${!p || p.unidade !== 'm' ? 'selected' : ''}>Centímetros (cm)</option>
        <option value="m" ${p && p.unidade === 'm' ? 'selected' : ''}>Metros (m)</option>
      </select>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label>Fórmulas de corte — uma por linha: nome | fórmula | L ou A | qtd</label>
      <textarea id="ep-cortes" rows="6" style="font-family:monospace;font-size:11px" placeholder="Tubo 32mm Natural | L - 2.2 | L">${p ? esc(cortesParaTexto(p.cortes)) : ''}</textarea>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label>Componentes (BOM) — um por linha: nome | qtd | obs</label>
      <textarea id="ep-componentes" rows="6" style="font-family:monospace;font-size:11px" placeholder="Comando Mini | 1">${p ? esc(componentesParaTexto(p.componentes)) : ''}</textarea>
    </div>
    <div style="grid-column:1/-1;font-size:10px;color:var(--text3)">
      Fórmulas usam L (largura) e A (altura) — ex: <code>L - 2.2</code>, <code>A + 15</code>, <code>(L + 30) / 4</code>.
      Qtd pode ser número ou fórmula (ex: <code>garrasPorLargura(L)</code>).
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-red" onclick="salvarProduto()">${p ? 'Salvar alterações' : 'Adicionar produto'}</button>
  `;
  document.getElementById('modal-overlay').classList.add('open');
}

async function salvarProduto() {
  const nome = document.getElementById('ep-nome').value.trim();
  if (!nome) { toast('Informe o nome do produto.'); return; }
  let cortes, componentes;
  try {
    cortes = textoParaCortes(document.getElementById('ep-cortes').value);
    componentes = textoParaComponentes(document.getElementById('ep-componentes').value);
  } catch (e) { toast(e.message); return; }

  const payload = {
    nome,
    familia: document.getElementById('ep-familia').value,
    tubo: document.getElementById('ep-tubo').value.trim() || null,
    unidade: document.getElementById('ep-unidade').value,
    cortes,
    componentes,
  };
  try {
    if (produtoEditandoId) {
      await api('pcp/estrutura?id=' + produtoEditandoId, { method: 'PUT', body: payload });
      toast('Produto atualizado na estrutura.');
    } else {
      await api('pcp/estrutura', { method: 'POST', body: payload });
      toast('Produto adicionado à estrutura.');
    }
    const estrutura = await api('pcp/estrutura');
    ESTRUTURA = (estrutura.data || []).map((p) => Object.assign({}, p, { id: Number(p.id) }));
    popularSelectProdutos();
    closeModal();
    produtoEditandoId = null;
    renderEstrutura();
  } catch (e) { toast('Erro ao salvar produto: ' + e.message); }
}

async function desativarProduto(id) {
  const p = ESTRUTURA.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Desativar "${p.nome}" da estrutura?\n\nEle deixa de aparecer na lista de produtos do novo pedido. Pedidos existentes não são afetados.`)) return;
  try {
    await api('pcp/estrutura?id=' + id, { method: 'DELETE' });
    ESTRUTURA = ESTRUTURA.filter(x => x.id !== id);
    popularSelectProdutos();
    renderEstrutura();
    toast('Produto desativado.');
  } catch (e) { toast('Erro: ' + e.message); }
}

// ── Lista de produtos no formulário de novo pedido (puxa da estrutura) ───────
function popularSelectProdutos() {
  const sel = document.getElementById('fn-produto');
  if (sel) {
    const atual = sel.value;
    const porFam = {};
    ESTRUTURA.forEach(p => { (porFam[p.familia] = porFam[p.familia] || []).push(p); });
    sel.innerHTML = '<option value="">— Selecione o produto —</option>' +
      Object.entries(porFam).map(([fam, prods]) =>
        `<optgroup label="${esc(familiaMeta(fam).rotulo)}">` +
        prods.map(p => `<option value="${esc(p.nome)}" data-id="${p.id}">${esc(p.nome)}</option>`).join('') +
        '</optgroup>'
      ).join('') +
      '<option value="__livre__">— Outro (digitar manualmente) —</option>';
    if (atual) sel.value = atual;
  }
  const dl = document.getElementById('produtos-datalist');
  if (dl) dl.innerHTML = ESTRUTURA.map(p => `<option value="${esc(p.nome)}">`).join('');
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function renderAll() {
  renderPainel();
  document.getElementById('sf-count').textContent = `${DB.length.toLocaleString('pt-BR')} registros`;
}

document.getElementById('today-label').textContent = new Date().toLocaleDateString('pt-BR', {weekday:'long',day:'numeric',month:'long',year:'numeric'});

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdf.worker.min.js';
}

document.getElementById('btn-sair').addEventListener('click', sair);

(async () => {
  try {
    await carregarSessao();
    await carregarDados();
    popularSelectProdutos();
    renderAll();
  } catch (e) {
    // 401 já redirecionou para o login; demais erros ficam visíveis
    console.error(e);
  }
})();