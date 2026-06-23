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
let STATUS = [];      // status de produção configuráveis (admin)
let TIPOS = [];       // tipos de entrada de pedido configuráveis (admin)
let SETORES = [];     // setores de produção (admin)
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
  aplicarPermissoes();
}

function popularFiltroStatus() {
  const sel = document.getElementById('fila-status-prod');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">Todos (status prod.)</option>'
    + '<option value="__sem__">— sem status —</option>'
    + STATUS.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join('');
  sel.value = atual;
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

function ehAdmin() { return !!usuario && usuario.role === 'admin'; }

const ABAS_PERM = ['painel','fila','alertas','busca','pedido','indicadores','bipagem','estrutura','novo','tipos'];
function nivelAba(aba) {
  if (ehAdmin()) return 'editar';
  return (usuario && usuario.permissoes && usuario.permissoes[aba]) || 'none';
}
function podeVer(aba) { return ehAdmin() || nivelAba(aba) !== 'none'; }
function podeEditar(aba) { return nivelAba(aba) === 'editar'; }

function aplicarPermissoes() {
  document.querySelectorAll('[data-admin]').forEach((n) => { n.style.display = ehAdmin() ? '' : 'none'; });
  document.querySelectorAll('#sidebar nav a[data-page]').forEach((a) => {
    const aba = a.dataset.page;
    if (a.hasAttribute('data-admin')) return; // abas de admin já tratadas acima
    a.style.display = podeVer(aba) ? '' : 'none';
  });
  const nb = document.getElementById('btn-novo-topo');
  if (nb) nb.style.display = podeEditar('novo') ? '' : 'none';
}

function primeiraAbaVisivel() {
  const a = [...document.querySelectorAll('#sidebar nav a[data-page]')].find((el) => el.style.display !== 'none');
  return a ? a.dataset.page : 'painel';
}

function statusProducaoBadge(item) {
  if (!item.status_nome) return '';
  const c = item.status_cor || '#606060';
  return `<span class="st-prod" style="background:${c}22;color:${c};border:1px solid ${c}66">${esc(item.status_nome)}</span>`;
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
  const [itens, estrutura, status, setores, tipos] = await Promise.all([
    api('pcp/itens'), api('pcp/estrutura'), api('pcp/status'), api('pcp/setores'), api('pcp/tipos'),
  ]);
  DB = (itens.data || []).map(normalizarItem);
  ESTRUTURA = (estrutura.data || []).map((p) => Object.assign({}, p, { id: Number(p.id) }));
  STATUS = (status.data || []).map((s) => Object.assign({}, s, { id: Number(s.id) }));
  SETORES = (setores.data || []).map((s) => Object.assign({}, s, { id: Number(s.id) }));
  TIPOS = (tipos.data || []).map((t) => Object.assign({}, t, { id: Number(t.id) }));
  popularFiltroStatus();
  popularSelectTipos();
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
function tipoCor(nome) {
  const t = TIPOS.find((x) => x.nome === nome);
  return t ? t.cor : '#606060';
}
function tipoPadraoNome() {
  const t = TIPOS.find((x) => x.padrao) || TIPOS[0];
  return t ? t.nome : '';
}
function tipoBadge(nome) {
  if (!nome) return '';
  const c = tipoCor(nome);
  return `<span class="tp" style="background:${c}22;color:${c}">${esc(nome)}</span>`;
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
const titles = {painel:'Painel',fila:'Fila de Produção',alertas:'Alertas',busca:'Buscar Pedido',pedido:'Editar Pedido',indicadores:'Indicadores',bip:'Bipagem',estrutura:'Estrutura do Produto',ordemcorte:'Ordem de Corte',status:'Status de Produção',tipos:'Tipos de Produção',setores:'Setores',usuarios:'Usuários',novo:'Novo Pedido'};
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
  if (page === 'ordemcorte') { ocInit(); setTimeout(()=>document.getElementById('oc-pedidos')?.focus(), 80); }
  if (page === 'status') renderStatusAdmin();
  if (page === 'tipos') renderTiposAdmin();
  if (page === 'setores') renderSetoresAdmin();
  if (page === 'usuarios') renderUsuariosAdmin();
  if (page === 'novo') renderProdutosPedido();
  if (page === 'pedido') setTimeout(()=>document.getElementById('ped-busca')?.focus(), 80);
  if (page === 'bip') { popularSetoresBip(); setBipEvento(bipEvento); setTimeout(()=>{ const el=document.getElementById('bip-input'); if(el) el.focus(); },100); }
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
  const fspEl = document.getElementById('fila-status-prod');
  const fsp = fspEl ? fspEl.value : '';

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
    if (fsp === '__sem__' && item.status_id) return false;
    if (fsp && fsp !== '__sem__' && String(item.status_id) !== fsp) return false;
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
    const done = pecasConcluidas(item), tot = pecasTotal(item);
    return `<tr>
      <td class="td-produto">${badgeEspecial(item)}${esc(item.produto)} ${statusProducaoBadge(item)}</td>
      <td>${esc(item.pedido)}</td>
      <td style="text-align:center">${done > 0 && done < tot ? `<b style="color:var(--blue)">${done}/${tot}</b>` : tot}</td>
      <td>${fmtDate(item.data_cliente)}</td>
      <td>${fmtDate(item.prev_producao)}</td>
      <td>${fmtDate(item.conclusao)}</td>
      <td>${tipoBadge(item.tipo)}</td>
      <td><span class="st ${sc}">${statusLabel(s)}</span></td>
      <td class="td-obs">${esc(item.motivo_atraso||item.observacoes||'')}</td>
      <td>
        <button class="btn btn-outline" style="padding:3px 8px;font-size:10px" onclick="openDetail(${item.id})">Ver</button>
        <button class="btn btn-outline" style="padding:3px 8px;font-size:10px;margin-left:4px" onclick="editarPedido('${esc(String(item.pedido))}')" title="Editar pedido inteiro">Pedido</button>
        ${!item.conclusao && podeEditar('fila') ? `<button class="btn btn-black" style="padding:3px 8px;font-size:10px;margin-left:4px" onclick="concluir(${item.id})">✓</button>` : ''}
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
    return `<div class="search-result" onclick="openDetail(${item.id})">
      <div class="sr-header">
        <div class="sr-produto">${badgeEspecial(item)}${esc(item.produto)}</div>
        <div style="display:flex;gap:6px">
          ${tipoBadge(item.tipo)}
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

// ─── SETORES (admin) ─────────────────────────────────────────────────────────
function statusOptions(sel) {
  return '<option value="">— sem status —</option>' +
    STATUS.map((s) => `<option value="${s.id}" ${String(sel)===String(s.id)?'selected':''}>${esc(s.nome)}</option>`).join('');
}

function renderSetoresAdmin() {
  const cont = document.getElementById('setores-conteudo');
  if (!cont || !ehAdmin()) { if (cont) cont.innerHTML='<div style="color:var(--red);font-size:12px">Acesso restrito.</div>'; return; }
  cont.innerHTML = `
    <div class="card" style="max-width:680px">
      <div class="card-title">Cadastrar setor</div>
      <div class="form-grid">
        <div class="form-group"><label>Nome do setor *</label><input type="text" id="se-nome" placeholder="Ex: Corte Tecido" maxlength="60" onkeydown="if(event.key==='Enter')criarSetor()"></div>
        <div class="form-group"><label>Status associado</label><select id="se-status">${statusOptions('')}</select></div>
        <div class="form-group"><label>Cor</label><input type="color" id="se-cor" value="#0891B2" style="height:40px;padding:3px"></div>
        <div class="form-group"><label>Ordem</label><input type="number" id="se-ordem" value="${(SETORES.length+1)*10}" min="0"></div>
        <div class="form-group" style="grid-column:1/-1">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
            <input type="checkbox" id="se-ordem-corte" style="width:15px;height:15px;accent-color:var(--red)">
            <span>🖨 <strong>Imprime ordem de corte</strong> — este setor sai na Ordem de Corte</span>
          </label>
        </div>
      </div>
      <button class="btn btn-red" style="margin-top:12px" onclick="criarSetor()">+ Adicionar setor</button>
    </div>
    <div class="card" style="max-width:680px">
      <div class="card-title">Setores cadastrados (${SETORES.length})</div>
      ${SETORES.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Setor</th><th>Status ao iniciar</th><th>Ordem de corte</th><th style="width:150px"></th></tr></thead>
        <tbody>${SETORES.map((s)=>`<tr>
          <td><span class="st-prod" style="background:${s.cor}22;color:${s.cor};border:1px solid ${s.cor}66">${esc(s.nome)}</span></td>
          <td><select onchange="alterarSetorStatus(${s.id}, this.value)" style="font-size:11px;border:1px solid var(--border);border-radius:6px;padding:4px 8px">${statusOptions(s.status_id)}</select> ${s.status_final?'<span class="st st-ok" style="font-size:9px">final → baixa</span>':''}</td>
          <td>${s.ordem_corte?'<span class="st st-ok" style="font-size:9px">🖨 imprime</span>':'<span style="color:var(--text3);font-size:11px">—</span>'}</td>
          <td>
            <button class="btn btn-outline" style="padding:2px 8px;font-size:10px" onclick="editarSetor(${s.id})">editar</button>
            <button class="btn btn-outline" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="excluirSetor(${s.id}, '${esc(s.nome)}')">excluir</button>
          </td></tr>`).join('')}</tbody></table></div>` : '<div style="color:var(--text3);font-size:12px">Nenhum setor cadastrado.</div>'}
    </div>`;
}

async function recarregarSetores() {
  const r = await api('pcp/setores');
  SETORES = (r.data || []).map((s) => Object.assign({}, s, { id: Number(s.id) }));
}
async function criarSetor() {
  const nome = document.getElementById('se-nome').value.trim();
  if (!nome) { toast('Informe o nome do setor.'); return; }
  try {
    await api('pcp/setores', { method:'POST', body:{ nome, cor:document.getElementById('se-cor').value, ordem:parseInt(document.getElementById('se-ordem').value)||0, status_id:document.getElementById('se-status').value||null, ordem_corte:document.getElementById('se-ordem-corte').checked } });
    await recarregarSetores(); renderSetoresAdmin(); toast(`Setor “${nome}” cadastrado.`);
  } catch(e){ toast('Erro: '+e.message); }
}
async function alterarSetorStatus(id, status_id) {
  try { await api('pcp/setores?id='+id, { method:'PUT', body:{ status_id: status_id||null } }); await recarregarSetores(); renderSetoresAdmin(); toast('Status do setor atualizado.'); }
  catch(e){ toast('Erro: '+e.message); }
}
function editarSetor(id) {
  const s = SETORES.find(x=>x.id===id); if(!s) return;
  document.getElementById('modal-title').textContent = 'Editar setor';
  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group"><label>Nome *</label><input type="text" id="se-ed-nome" value="${esc(s.nome)}" maxlength="60"></div>
    <div class="form-group"><label>Status associado</label><select id="se-ed-status">${statusOptions(s.status_id)}</select></div>
    <div class="form-group"><label>Cor</label><input type="color" id="se-ed-cor" value="${s.cor}" style="height:40px;padding:3px"></div>
    <div class="form-group"><label>Ordem</label><input type="number" id="se-ed-ordem" value="${s.ordem}" min="0"></div>
    <div class="form-group" style="grid-column:1/-1">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
        <input type="checkbox" id="se-ed-ordem-corte" ${s.ordem_corte?'checked':''} style="width:15px;height:15px;accent-color:var(--red)">
        <span>🖨 <strong>Imprime ordem de corte</strong> — este setor sai na Ordem de Corte</span>
      </label>
    </div>`;
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-red" onclick="salvarSetor(${id})">Salvar</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}
async function salvarSetor(id) {
  try {
    await api('pcp/setores?id='+id, { method:'PUT', body:{ nome:document.getElementById('se-ed-nome').value.trim(), cor:document.getElementById('se-ed-cor').value, ordem:parseInt(document.getElementById('se-ed-ordem').value)||0, status_id:document.getElementById('se-ed-status').value||null, ordem_corte:document.getElementById('se-ed-ordem-corte').checked } });
    await recarregarSetores(); closeModal(); renderSetoresAdmin(); toast('Setor atualizado.');
  } catch(e){ toast('Erro: '+e.message); }
}
async function excluirSetor(id, nome) {
  if (!confirm(`Excluir o setor “${nome}”? Ele será removido dos roteiros e das associações de usuários.`)) return;
  try { await api('pcp/setores?id='+id, { method:'DELETE' }); await recarregarSetores(); renderSetoresAdmin(); toast(`Setor “${nome}” excluído.`); }
  catch(e){ toast('Erro: '+e.message); }
}

// ─── USUÁRIOS (admin) ────────────────────────────────────────────────────────
const ABA_LABELS = {painel:'Painel',fila:'Fila de Produção',alertas:'Alertas',busca:'Buscar Pedido',pedido:'Editar Pedido',indicadores:'Indicadores',bipagem:'Bipagem',estrutura:'Estrutura do Produto',novo:'Novo Pedido',tipos:'Tipos de Produção (cadastrar/editar)'};
let usuariosCache = [];

async function renderUsuariosAdmin() {
  const cont = document.getElementById('usuarios-conteudo');
  if (!cont || !ehAdmin()) { if (cont) cont.innerHTML='<div style="color:var(--red);font-size:12px">Acesso restrito.</div>'; return; }
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px">Carregando...</div>';
  try {
    const r = await api('pcp/usuarios');
    usuariosCache = (r.data || []).map((u) => ({ ...u, id: Number(u.id), setores: (u.setores || []).map(Number) }));
  } catch(e){ cont.innerHTML = `<div style="color:var(--red);font-size:12px">${esc(e.message)}</div>`; return; }
  cont.innerHTML = `
    <div style="margin-bottom:12px"><button class="btn btn-red" onclick="abrirUsuarioEditor()">+ Novo usuário</button></div>
    <div class="card" style="padding:0;overflow:hidden"><div class="tbl-wrap"><table>
      <thead><tr><th>Usuário</th><th>Nome</th><th>Papel</th><th>Setores</th><th>Status</th><th style="width:150px"></th></tr></thead>
      <tbody>${usuariosCache.map((u)=>`<tr>
        <td>${esc(u.username)}</td>
        <td class="td-produto">${esc(u.full_name)}</td>
        <td>${u.role==='admin'?'<span class="st st-vencido">admin</span>':'<span class="st st-gray">operador</span>'}</td>
        <td style="font-size:11px">${(u.setores||[]).map(id=>{const s=SETORES.find(x=>x.id===id);return s?esc(s.nome):'#'+id;}).join(', ')||'—'}</td>
        <td>${u.active?'<span class="st st-ok">ativo</span>':'<span class="st st-gray">inativo</span>'}</td>
        <td>
          <button class="btn btn-outline" style="padding:2px 8px;font-size:10px" onclick="abrirUsuarioEditor(${u.id})">editar</button>
          <button class="btn btn-outline" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="excluirUsuario(${u.id}, '${esc(u.username)}')">excluir</button>
        </td></tr>`).join('')}</tbody></table></div></div>`;
}

function abrirUsuarioEditor(id) {
  const u = id ? usuariosCache.find(x=>Number(x.id)===Number(id)) : null;
  const perms = (u && u.permissoes) || {};
  const setoresU = (u && u.setores) || [];
  document.getElementById('modal-title').textContent = u ? `Usuário: ${u.username}` : 'Novo usuário';
  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group"><label>Login *</label><input type="text" id="us-username" value="${u?esc(u.username):''}" ${u?'disabled':''} placeholder="ex: joao"></div>
    <div class="form-group"><label>Nome completo *</label><input type="text" id="us-nome" value="${u?esc(u.full_name):''}"></div>
    <div class="form-group"><label>Senha ${u?'<span style="font-weight:400;text-transform:none;color:var(--text3)">(em branco = manter)</span>':'*'}</label><input type="password" id="us-senha" autocomplete="new-password" placeholder="${u?'••••••':'mín. 8 caracteres'}"></div>
    <div class="form-group"><label>Papel</label><select id="us-role"><option value="user" ${!u||u.role==='user'?'selected':''}>Operador</option><option value="admin" ${u&&u.role==='admin'?'selected':''}>Administrador</option></select></div>
    <div class="form-group"><label>Situação</label><select id="us-ativo"><option value="1" ${!u||u.active?'selected':''}>Ativo</option><option value="0" ${u&&!u.active?'selected':''}>Inativo</option></select></div>
    <div class="form-group" style="grid-column:1/-1"><label>Permissões por aba</label>
      <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
        ${ABAS_PERM.map((aba)=>`<div style="display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border)">
          <span style="flex:1;font-size:12px">${esc(ABA_LABELS[aba]||aba)}</span>
          <select id="us-perm-${aba}" style="font-size:11px;border:1px solid var(--border);border-radius:6px;padding:4px 8px">
            <option value="none" ${(perms[aba]||'none')==='none'?'selected':''}>Sem acesso</option>
            <option value="ver" ${perms[aba]==='ver'?'selected':''}>Ver</option>
            <option value="editar" ${perms[aba]==='editar'?'selected':''}>Editar</option>
          </select>
        </div>`).join('')}
      </div>
      <div style="font-size:10px;color:var(--text3);margin-top:4px">Administrador ignora a matriz (acesso total + abas de admin).</div>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label>Setores de produção</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${SETORES.length ? SETORES.map((s)=>`<label style="display:flex;align-items:center;gap:5px;font-size:12px;text-transform:none;font-weight:400;border:1px solid var(--border);border-radius:6px;padding:5px 9px;cursor:pointer">
          <input type="checkbox" class="us-setor" value="${s.id}" ${setoresU.includes(s.id)?'checked':''} style="accent-color:var(--red)"> ${esc(s.nome)}
        </label>`).join('') : '<span style="font-size:11px;color:var(--text3)">Cadastre setores primeiro.</span>'}
      </div>
    </div>`;
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-red" onclick="salvarUsuario(${id||0})">${u?'Salvar alterações':'Criar usuário'}</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function salvarUsuario(id) {
  const permissoes = {};
  ABAS_PERM.forEach((aba)=>{ const v=document.getElementById('us-perm-'+aba).value; if(v!=='none') permissoes[aba]=v; });
  const setores = [...document.querySelectorAll('.us-setor:checked')].map((c)=>Number(c.value));
  const body = {
    full_name: document.getElementById('us-nome').value.trim(),
    role: document.getElementById('us-role').value,
    active: document.getElementById('us-ativo').value === '1',
    permissoes, setores,
  };
  const senha = document.getElementById('us-senha').value;
  if (senha) body.password = senha;
  try {
    if (id) {
      await api('pcp/usuarios?id='+id, { method:'PUT', body });
      toast('Usuário atualizado.');
    } else {
      body.username = document.getElementById('us-username').value.trim();
      if (!body.username) { toast('Informe o login.'); return; }
      if (!senha) { toast('Defina a senha do novo usuário.'); return; }
      await api('pcp/usuarios', { method:'POST', body });
      toast('Usuário criado.');
    }
    closeModal();
    renderUsuariosAdmin();
  } catch(e){ toast('Erro: '+e.message); }
}

async function excluirUsuario(id, username) {
  if (!confirm(`Excluir o usuário “${username}”?`)) return;
  try { await api('pcp/usuarios?id='+id, { method:'DELETE' }); renderUsuariosAdmin(); toast(`Usuário “${username}” excluído.`); }
  catch(e){ toast('Erro: '+e.message); }
}

// ─── STATUS DE PRODUÇÃO (admin) ──────────────────────────────────────────────
function renderStatusAdmin() {
  const cont = document.getElementById('status-conteudo');
  if (!cont) return;
  if (!ehAdmin()) {
    cont.innerHTML = '<div style="color:var(--red);font-size:12px;padding:8px 0">Acesso restrito a administradores.</div>';
    return;
  }
  const usados = {};
  DB.forEach((i) => { if (i.status_id) usados[i.status_id] = (usados[i.status_id] || 0) + 1; });

  cont.innerHTML = `
    <div class="card" style="max-width:620px">
      <div class="card-title">Cadastrar status</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nome do status *</label>
          <input type="text" id="st-nome" placeholder="Ex: Em pintura" maxlength="40"
            onkeydown="if(event.key==='Enter')criarStatus()"></div>
        <div class="form-group"><label>Cor</label><input type="color" id="st-cor" value="#C1212D" style="height:40px;padding:3px"></div>
        <div class="form-group"><label>Ordem</label><input type="number" id="st-ordem" value="${(STATUS.length + 1) * 10}" min="0"></div>
      </div>
      <button class="btn btn-red" style="margin-top:12px" onclick="criarStatus()">+ Adicionar status</button>
    </div>

    <div class="card" style="max-width:620px">
      <div class="card-title">Status cadastrados (${STATUS.length})</div>
      ${STATUS.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Status</th><th>Final</th><th>Em uso</th><th style="width:150px"></th></tr></thead>
        <tbody>
          ${STATUS.map((s) => `<tr>
            <td><span class="st-prod" style="background:${s.cor}22;color:${s.cor};border:1px solid ${s.cor}66">${esc(s.nome)}</span></td>
            <td>${s.final ? '<span class="st st-ok" style="font-size:9px">final → baixa</span>' : '<span style="color:var(--text3)">—</span>'}</td>
            <td>${usados[s.id] || 0} item(ns)</td>
            <td>
              <button class="btn btn-outline" style="padding:2px 8px;font-size:10px" onclick="editarStatus(${s.id})">editar</button>
              <button class="btn btn-outline" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="excluirStatus(${s.id}, '${esc(s.nome)}', ${usados[s.id] || 0})">excluir</button>
            </td>
          </tr>`).join('')}
        </tbody></table></div>`
      : '<div style="color:var(--text3);font-size:12px">Nenhum status cadastrado.</div>'}
      <div style="font-size:10px;color:var(--text3);margin-top:10px">Excluir um status remove a marcação dos itens que o usavam (eles ficam “sem status”). O PCP define o status por item (no detalhe) ou no pedido inteiro (aba Editar Pedido).</div>
    </div>`;
}

async function criarStatus() {
  const nome = document.getElementById('st-nome').value.trim();
  if (!nome) { toast('Informe o nome do status.'); return; }
  const cor = document.getElementById('st-cor').value || '#606060';
  const ordem = parseInt(document.getElementById('st-ordem').value) || 0;
  try {
    await api('pcp/status', { method: 'POST', body: { nome, cor, ordem } });
    const r = await api('pcp/status');
    STATUS = (r.data || []).map((s) => Object.assign({}, s, { id: Number(s.id) }));
    popularFiltroStatus();
    renderStatusAdmin();
    toast(`Status “${nome}” cadastrado.`);
  } catch (e) { toast('Erro: ' + e.message); }
}

async function recarregarStatus() {
  const r = await api('pcp/status');
  STATUS = (r.data || []).map((s) => Object.assign({}, s, { id: Number(s.id) }));
  popularFiltroStatus();
}

function editarStatus(id) {
  const s = STATUS.find((x) => x.id === id);
  if (!s) return;
  document.getElementById('modal-title').textContent = `Editar status — ${s.nome}`;
  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group" style="grid-column:1/-1"><label>Nome *</label><input type="text" id="st-ed-nome" value="${esc(s.nome)}" maxlength="40"></div>
    <div class="form-group"><label>Cor</label><input type="color" id="st-ed-cor" value="${s.cor}" style="height:40px;padding:3px"></div>
    <div class="form-group"><label>Ordem</label><input type="number" id="st-ed-ordem" value="${s.ordem}" min="0"></div>
    <div class="form-group" style="grid-column:1/-1">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
        <input type="checkbox" id="st-ed-final" ${s.final ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--red)">
        <span>Status <strong>final</strong> — o “Fim” de um setor com este status dá <strong>baixa</strong> na peça</span>
      </label>
    </div>`;
  document.getElementById('modal-footer').innerHTML =
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-red" onclick="salvarStatusEdit(${id})">Salvar</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function salvarStatusEdit(id) {
  const nome = document.getElementById('st-ed-nome').value.trim();
  if (!nome) { toast('Informe o nome do status.'); return; }
  const body = {
    nome,
    cor: document.getElementById('st-ed-cor').value,
    ordem: parseInt(document.getElementById('st-ed-ordem').value) || 0,
    final: document.getElementById('st-ed-final').checked,
  };
  try {
    await api('pcp/status?id=' + id, { method: 'PUT', body });
    await recarregarStatus();
    closeModal();
    renderStatusAdmin();
    renderAll();
    toast('Status atualizado.');
  } catch (e) { toast('Erro: ' + e.message); }
}

async function excluirStatus(id, nome, emUso) {
  const aviso = emUso > 0
    ? `Excluir o status “${nome}”?\n\n${emUso} item(ns) usam esse status e ficarão “sem status”.`
    : `Excluir o status “${nome}”?`;
  if (!confirm(aviso)) return;
  try {
    await api('pcp/status?id=' + id, { method: 'DELETE' });
    STATUS = STATUS.filter((s) => s.id !== id);
    // limpa o status em memória dos itens afetados
    DB.forEach((i) => { if (i.status_id === id) { i.status_id = null; i.status_nome = null; i.status_cor = null; } });
    popularFiltroStatus();
    renderStatusAdmin();
    renderAll();
    toast(`Status “${nome}” excluído.`);
  } catch (e) { toast('Erro: ' + e.message); }
}

// ─── TIPOS DE PRODUÇÃO (admin) ───────────────────────────────────────────────
function renderTiposAdmin() {
  const cont = document.getElementById('tipos-conteudo');
  if (!cont) return;
  if (!podeVer('tipos')) {
    cont.innerHTML = '<div style="color:var(--red);font-size:12px;padding:8px 0">Sem permissão para ver os tipos de produção.</div>';
    return;
  }
  const editar = podeEditar('tipos');
  const usados = {};
  DB.forEach((i) => { if (i.tipo) usados[i.tipo] = (usados[i.tipo] || 0) + 1; });

  cont.innerHTML = `
    ${editar ? `<div class="card" style="max-width:620px">
      <div class="card-title">Cadastrar tipo</div>
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1"><label>Nome do tipo *</label>
          <input type="text" id="tp-nome" placeholder="Ex: Garantia" maxlength="40"
            onkeydown="if(event.key==='Enter')criarTipo()"></div>
        <div class="form-group"><label>Cor</label><input type="color" id="tp-cor" value="#3949AB" style="height:40px;padding:3px"></div>
        <div class="form-group"><label>Ordem</label><input type="number" id="tp-ordem" value="${(TIPOS.length + 1) * 10}" min="0"></div>
        <div class="form-group" style="grid-column:1/-1">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
            <input type="checkbox" id="tp-padrao" style="width:15px;height:15px;accent-color:var(--red)">
            <span>Tipo <strong>padrão</strong> — pré-selecionado ao cadastrar um novo pedido</span>
          </label>
        </div>
      </div>
      <button class="btn btn-red" style="margin-top:12px" onclick="criarTipo()">+ Adicionar tipo</button>
    </div>` : ''}

    <div class="card" style="max-width:620px">
      <div class="card-title">Tipos cadastrados (${TIPOS.length})</div>
      ${TIPOS.length ? `<div class="tbl-wrap"><table>
        <thead><tr><th>Tipo</th><th>Padrão</th><th>Em uso</th>${editar ? '<th style="width:150px"></th>' : ''}</tr></thead>
        <tbody>
          ${TIPOS.map((t) => `<tr>
            <td>${tipoBadge(t.nome)}</td>
            <td>${t.padrao ? '<span class="st st-ok" style="font-size:9px">padrão</span>' : '<span style="color:var(--text3)">—</span>'}</td>
            <td>${usados[t.nome] || 0} item(ns)</td>
            ${editar ? `<td>
              <button class="btn btn-outline" style="padding:2px 8px;font-size:10px" onclick="editarTipo(${t.id})">editar</button>
              <button class="btn btn-outline" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="excluirTipo(${t.id}, '${esc(t.nome)}', ${usados[t.nome] || 0})">excluir</button>
            </td>` : ''}
          </tr>`).join('')}
        </tbody></table></div>`
      : '<div style="color:var(--text3);font-size:12px">Nenhum tipo cadastrado.</div>'}
      ${editar ? '<div style="font-size:10px;color:var(--text3);margin-top:10px">Renomear um tipo atualiza automaticamente os pedidos que já o usavam. Não é possível excluir o tipo padrão — defina outro como padrão antes.</div>' : ''}
    </div>`;
}

async function criarTipo() {
  const nome = document.getElementById('tp-nome').value.trim();
  if (!nome) { toast('Informe o nome do tipo.'); return; }
  const cor = document.getElementById('tp-cor').value || '#3949AB';
  const ordem = parseInt(document.getElementById('tp-ordem').value) || 0;
  const padrao = document.getElementById('tp-padrao').checked;
  try {
    await api('pcp/tipos', { method: 'POST', body: { nome, cor, ordem, padrao } });
    await recarregarTipos();
    renderTiposAdmin();
    toast(`Tipo “${nome}” cadastrado.`);
  } catch (e) { toast('Erro: ' + e.message); }
}

async function recarregarTipos() {
  const r = await api('pcp/tipos');
  TIPOS = (r.data || []).map((t) => Object.assign({}, t, { id: Number(t.id) }));
  popularSelectTipos();
}

function editarTipo(id) {
  const t = TIPOS.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('modal-title').textContent = `Editar tipo — ${t.nome}`;
  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group" style="grid-column:1/-1"><label>Nome *</label><input type="text" id="tp-ed-nome" value="${esc(t.nome)}" maxlength="40"></div>
    <div class="form-group"><label>Cor</label><input type="color" id="tp-ed-cor" value="${t.cor}" style="height:40px;padding:3px"></div>
    <div class="form-group"><label>Ordem</label><input type="number" id="tp-ed-ordem" value="${t.ordem}" min="0"></div>
    <div class="form-group" style="grid-column:1/-1">
      <label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none;font-size:12px">
        <input type="checkbox" id="tp-ed-padrao" ${t.padrao ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--red)">
        <span>Tipo <strong>padrão</strong> — pré-selecionado ao cadastrar um novo pedido</span>
      </label>
    </div>`;
  document.getElementById('modal-footer').innerHTML =
    `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
     <button class="btn btn-red" onclick="salvarTipoEdit(${id})">Salvar</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}

async function salvarTipoEdit(id) {
  const nome = document.getElementById('tp-ed-nome').value.trim();
  if (!nome) { toast('Informe o nome do tipo.'); return; }
  const body = {
    nome,
    cor: document.getElementById('tp-ed-cor').value,
    ordem: parseInt(document.getElementById('tp-ed-ordem').value) || 0,
    padrao: document.getElementById('tp-ed-padrao').checked,
  };
  try {
    await api('pcp/tipos?id=' + id, { method: 'PUT', body });
    await carregarDados(); // renomeação reflete nos itens — recarrega a fila
    closeModal();
    renderTiposAdmin();
    renderAll();
    toast('Tipo atualizado.');
  } catch (e) { toast('Erro: ' + e.message); }
}

async function excluirTipo(id, nome, emUso) {
  const aviso = emUso > 0
    ? `Excluir o tipo “${nome}”?\n\n${emUso} item(ns) usam esse tipo e manterão o texto, mas o tipo sai dos seletores.`
    : `Excluir o tipo “${nome}”?`;
  if (!confirm(aviso)) return;
  try {
    await api('pcp/tipos?id=' + id, { method: 'DELETE' });
    await recarregarTipos();
    renderTiposAdmin();
    renderAll();
    toast(`Tipo “${nome}” excluído.`);
  } catch (e) { toast('Erro: ' + e.message); }
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

  const tiposOpts = TIPOS.map(t => `<option ${comum(itens,'tipo')===t.nome?'selected':''}>${esc(t.nome)}</option>`).join('');
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

      <div class="card-title">Medidas das peças</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Informe largura e altura de cada peça. Produtos horizontais (PH 25/PH 50) também pedem nº de furos e modelo.</div>
      <div id="ped-medidas">${renderPedidoMedidas(itens)}</div>

      <div class="card-title" style="margin-top:18px">Status de todas as peças</div>
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
        <div class="form-group" style="grid-column:1/-1"><label>Status de produção</label>
          <select id="ped-status">
            <option value="__keep__" selected>(manter atual)</option>
            <option value="">— sem status —</option>
            ${STATUS.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('')}
          </select>
        </div>
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

// ── Medidas por peça (largura/altura + furos/modelo p/ horizontais) ──────────
// O pedido do outro sistema vem em METROS; o corte desce em CENTÍMETROS. Por isso
// as medidas são digitadas em metros e o sistema converte (×100) para cm — que é
// a unidade que as fórmulas de corte esperam. Armazenamento e cálculo: sempre cm.
function mParaCm(m) {
  if (m == null || m === '' || !Number.isFinite(Number(m))) return null;
  return Math.round(Number(m) * 10000) / 100; // 1,54 m → 154 cm (2 casas)
}
function cmParaM(cm) {
  if (cm == null || cm === '' || !Number.isFinite(Number(cm))) return '';
  return Math.round(Number(cm) * 100) / 10000; // 154 cm → 1.54 m
}
function ehHorizontal(item) {
  if (!item) return false;
  const fam = String(item.familia || '').toUpperCase();
  if (fam === 'HORIZONTAL') return true;
  const prodEstr = item.produto_id ? ESTRUTURA.find(p => p.id === Number(item.produto_id)) : null;
  if (prodEstr) {
    if (String(prodEstr.familia || '').toUpperCase() === 'HORIZONTAL') return true;
    if (prodEstr.calculo_extra_fonte) return true;
  }
  if (item.calculo_extra_fonte) return true;
  const nome = String(item.produto || '').toUpperCase();
  return /\bPH\s*25|\bPH25|\bPH\s*50|\bPH50|HORIZONTAL/.test(nome);
}

function renderPedidoMedidas(itens) {
  if (!itens || !itens.length) return '<div style="font-size:11px;color:var(--text3)">Nenhuma peça.</div>';
  return itens.map(item => {
    const horiz = ehHorizontal(item);
    const pecas = item.pecas || [];
    if (!pecas.length) {
      return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px">${badgeEspecial(item)}${esc(item.produto)}</div>
        <div style="font-size:11px;color:var(--text3)">Sem peças cadastradas.</div>
      </div>`;
    }
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px">
      <div style="font-weight:700;font-size:12px;margin-bottom:8px">${badgeEspecial(item)}${esc(item.produto)}${horiz?' <span class="st st-atencao" style="font-size:9px">HORIZONTAL</span>':''}</div>
      <div style="overflow-x:auto"><table style="width:100%;font-size:11px">
        <thead><tr>
          <th style="width:34px">#</th>
          <th style="width:90px">Largura (m)</th>
          <th style="width:90px">Altura (m)</th>
          ${horiz?'<th style="width:70px">Furos</th><th>Modelo</th>':''}
          <th style="width:64px"></th>
        </tr></thead>
        <tbody>
          ${pecas.map(p => {
            const med = p.medidas || {};
            return `<tr>
              <td style="font-weight:700">#${p.numero}</td>
              <td><input type="number" step="0.001" id="pm-larg-${p.id}" value="${p.largura!=null?esc(cmParaM(p.largura)):''}" placeholder="ex: 1,54" style="width:80px;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:4px 6px;background:var(--surface);color:var(--text)"></td>
              <td><input type="number" step="0.001" id="pm-alt-${p.id}" value="${p.altura!=null?esc(cmParaM(p.altura)):''}" placeholder="ex: 1,31" style="width:80px;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:4px 6px;background:var(--surface);color:var(--text)"></td>
              ${horiz?`
                <td><input type="number" step="1" id="pm-furos-${p.id}" value="${med.furos!=null?esc(med.furos):''}" placeholder="nº" style="width:60px;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:4px 6px;background:var(--surface);color:var(--text)"></td>
                <td><input type="text" id="pm-modelo-${p.id}" value="${med.modelo!=null?esc(med.modelo):''}" placeholder="modelo" style="width:100%;min-width:90px;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:4px 6px;background:var(--surface);color:var(--text)"></td>`:''}
              <td><button class="btn btn-outline" style="padding:2px 7px;font-size:10px" onclick="salvarMedidaPeca(${p.id}, ${horiz})">salvar</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></div>
    </div>`;
  }).join('');
}

async function salvarMedidaPeca(pecaId, horiz) {
  const larg = document.getElementById('pm-larg-'+pecaId);
  const alt = document.getElementById('pm-alt-'+pecaId);
  const largM = larg && larg.value !== '' ? Number(larg.value) : null; // metros
  const altM = alt && alt.value !== '' ? Number(alt.value) : null;
  const body = {
    largura: mParaCm(largM), // armazena em cm (unidade do cálculo)
    altura:  mParaCm(altM),
  };
  if ((largM != null && largM > 10) || (altM != null && altM > 10))
    toast('Atenção: a medida é em metros (ex.: 1,54). O valor parece estar em cm — confira.');
  if (horiz) {
    const medidas = {};
    const furosEl = document.getElementById('pm-furos-'+pecaId);
    const modeloEl = document.getElementById('pm-modelo-'+pecaId);
    if (furosEl && furosEl.value !== '') medidas.furos = Number(furosEl.value);
    if (modeloEl && modeloEl.value.trim()) medidas.modelo = modeloEl.value.trim();
    body.medidas = medidas;
  }
  try {
    const r = await api('pcp/pecas?id=' + pecaId, { method: 'PUT', body });
    if (r.item) aplicarItemAtualizado(r.item);
    // atualiza o pedido em memória sem re-renderizar tudo (mantém o foco do usuário)
    if (pedidoCarregado) {
      (pedidoCarregado.itens || []).forEach(it => {
        const pc = (it.pecas || []).find(x => x.id === pecaId);
        if (pc) { pc.largura = body.largura; pc.altura = body.altura; if (horiz) pc.medidas = body.medidas; }
      });
    }
    toast('Medidas da peça salvas.');
  } catch (e) { toast('Erro ao salvar medidas: ' + e.message); }
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
  const sv = document.getElementById('ped-status').value;
  if (sv !== '__keep__') body.status_id = sv === '' ? null : Number(sv);
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
  document.getElementById('chart-tipos').innerHTML = `<div class="donut-wrap">
    <div class="donut-legend">${Object.entries(tipos).map(([t,n])=>
      `<div class="legend-item"><div class="legend-dot" style="background:${tipoCor(t)}"></div>${esc(t)}: <strong>${n}</strong></div>`
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
        ${(TIPOS.some(t=>t.nome===item.tipo)?TIPOS:[{nome:item.tipo},...TIPOS]).map(t=>`<option ${item.tipo===t.nome?'selected':''}>${esc(t.nome)}</option>`).join('')}
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
    <div class="form-group" style="grid-column:1/-1"><label>Status de produção</label>
      <select id="ed-status">
        <option value="">— sem status —</option>
        ${STATUS.map(s=>`<option value="${s.id}" ${item.status_id==s.id?'selected':''}>${esc(s.nome)}</option>`).join('')}
      </select>
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
    status_id: document.getElementById('ed-status').value === '' ? null : Number(document.getElementById('ed-status').value),
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

  const horiz = ehHorizontal({ produto, produto_id });
  const largEl = document.getElementById('fn-larg');
  const altEl = document.getElementById('fn-alt');
  const largM = largEl && largEl.value !== '' ? Number(largEl.value) : null; // metros (como vem do pedido)
  const altM = altEl && altEl.value !== '' ? Number(altEl.value) : null;
  const larg = mParaCm(largM); // converte para cm (unidade do cálculo)
  const alt = mParaCm(altM);
  const medidas = {};
  if (horiz) {
    const furosEl = document.getElementById('fn-furos');
    const modeloEl = document.getElementById('fn-modelo');
    if (furosEl && furosEl.value !== '') medidas.furos = Number(furosEl.value);
    if (modeloEl && modeloEl.value.trim()) medidas.modelo = modeloEl.value.trim();
  }

  if ((largM != null && largM > 10) || (altM != null && altM > 10))
    toast('Atenção: a medida é em metros (ex.: 1,54). O valor parece estar em cm — confira.');

  pedidoProdutos.push({
    produto,
    produto_id,
    etiqueta: etiqueta || null,
    especial: document.getElementById('fn-especial').checked,
    largura: larg,
    altura: alt,
    medidas: Object.keys(medidas).length ? medidas : null,
    horiz,
  });
  etiquetaEl.value = '';
  document.getElementById('fn-especial').checked = false;
  ['fn-larg', 'fn-alt', 'fn-furos', 'fn-modelo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
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
        <thead><tr><th style="width:30px">#</th><th>Produto</th><th>Etiqueta</th><th>Medidas</th><th style="width:70px"></th></tr></thead>
        <tbody>
          ${pedidoProdutos.map((p, ix) => {
            const med = [];
            if (p.largura != null || p.altura != null) med.push(`${p.largura != null ? p.largura : '?'}×${p.altura != null ? p.altura : '?'} cm`);
            if (p.medidas) { if (p.medidas.furos != null) med.push(`${p.medidas.furos} furos`); if (p.medidas.modelo) med.push(esc(p.medidas.modelo)); }
            const medTxt = med.length ? med.join(' · ') : '<span style="color:var(--text3)">—</span>';
            return `
            <tr>
              <td>${ix + 1}</td>
              <td class="td-produto">${p.especial ? '<span class="st st-especial">★ ESPECIAL</span> ' : ''}${esc(p.produto)}</td>
              <td style="font-family:monospace">${p.etiqueta ? esc(p.etiqueta) : '<span style="color:var(--text3)">— vincular depois</span>'}</td>
              <td style="font-size:11px">${medTxt}</td>
              <td><button class="btn btn-outline" style="padding:2px 8px;font-size:10px;color:var(--red);border-color:var(--red)" onclick="removerProdutoPedido(${ix})">remover</button></td>
            </tr>`; }).join('')}
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
    largura: p.largura,
    altura: p.altura,
    medidas: p.medidas || undefined,
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
  ['fn-pedido','fn-chegada','fn-prev-prod','fn-obs','fn-produto-livre','fn-etiqueta','fn-larg','fn-alt','fn-furos','fn-modelo'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fn-produto').value = '';
  document.getElementById('fn-produto-livre').style.display = 'none';
  document.getElementById('fn-data-cliente').value = '';
  document.getElementById('fn-tipo').value = tipoPadraoNome();
  document.getElementById('fn-motivo').value = '';
  document.getElementById('fn-especial').checked = false;
  const hg = document.getElementById('fn-horiz-group'); if (hg) hg.style.display = 'none';
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
      tipo:          String(get(row,'tipo')||'').trim() || tipoPadraoNome() || 'Produção nova',
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
      tipo: tipoPadraoNome() || 'Produção nova',
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
let bipEvento = 'inicio';

function setoresDoUsuario() {
  if (ehAdmin()) return SETORES;
  const meus = (usuario && usuario.setores) || [];
  return SETORES.filter((s) => meus.includes(s.id));
}
function popularSetoresBip() {
  const sel = document.getElementById('bip-setor'); if (!sel) return;
  const lista = setoresDoUsuario();
  const atual = sel.value;
  sel.innerHTML = lista.length
    ? lista.map((s) => `<option value="${s.id}">${esc(s.nome)}</option>`).join('')
    : '<option value="">— nenhum setor associado a você —</option>';
  if (atual) sel.value = atual;
}
function setBipEvento(ev) {
  bipEvento = ev === 'fim' ? 'fim' : 'inicio';
  const bi = document.getElementById('bip-evt-inicio'), bf = document.getElementById('bip-evt-fim');
  if (bi) bi.className = 'btn ' + (bipEvento === 'inicio' ? 'btn-red' : 'btn-outline');
  if (bf) bf.className = 'btn ' + (bipEvento === 'fim' ? 'btn-red' : 'btn-outline');
  const i = document.getElementById('bip-input'); if (i) i.focus();
}

function bipDigitado() { clearTimeout(bipTimer); bipTimer = setTimeout(processBip, 1500); }

async function processBip() {
  clearTimeout(bipTimer);
  const input = document.getElementById('bip-input');
  if (!podeEditar('bipagem')) { toast('Você não tem permissão para bipar.'); input.value = ''; return; }
  const setorSel = document.getElementById('bip-setor');
  const setor_id = setorSel ? Number(setorSel.value) : 0;
  if (!setor_id) { toast('Selecione o setor.'); setorSel && setorSel.focus(); return; }
  const codigo = input.value.trim();
  if (!codigo) return;
  input.value = ''; input.focus();
  try {
    const r = await api('pcp/bip', { method: 'POST', body: { codigo, setor_id, evento: bipEvento } });
    if (r.acao === 'desconhecido') { mostrarBipAviso(`Etiqueta ${codigo} não está vinculada a nenhuma peça.`); return; }
    const item = aplicarItemAtualizado(r.item);
    showBipResultado(r.acao, item, codigo, r.peca_numero, r.setor_nome, r.etapas);
    addBipHistorico(r.acao, item, r.peca_numero, r.setor_nome);
    if (r.acao !== 'jafoi') renderAll();
  } catch (e) { mostrarBipAviso(e.message); }
}

function mostrarBipAviso(msg) {
  const res = document.getElementById('bip-resultado'); if (!res) return;
  res.innerHTML = `<div style="background:var(--amber-bg);border:2px solid #FFA000;border-radius:8px;padding:14px 18px;margin-bottom:16px;animation:fadeIn .2s ease"><div style="font-size:13px;font-weight:700;color:var(--amber)">⚠ ${esc(msg)}</div></div>`;
}

function etapasHTML(etapas) {
  if (!etapas || !etapas.length) return '';
  return `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:5px">${etapas.map((e) => {
    const cor = e.fim ? 'var(--green)' : (e.inicio ? '#1976D2' : 'var(--text3)');
    const tag = e.fim ? '✓' : (e.inicio ? '▸' : '·');
    return `<span class="st-prod" style="background:${cor}22;color:${cor};border:1px solid ${cor}66">${tag} ${esc(e.setor_nome)}</span>`;
  }).join('')}</div>`;
}

function showBipResultado(tipo, item, codigo, pecaNumero, setorNome, etapas) {
  const res = document.getElementById('bip-resultado'); if (!res) return;
  const done = pecasConcluidas(item), total = pecasTotal(item);
  const cfg = {
    inicio: { bg:'var(--blue-bg)',  border:'#1976D2',      icon:'▶️', cor:'var(--blue)',  titulo:`Início registrado — ${esc(setorNome||'')}` },
    fim:    { bg:'var(--amber-bg)', border:'#FFA000',      icon:'⏹️', cor:'var(--amber)', titulo:`Fim registrado — ${esc(setorNome||'')}` },
    baixa:  { bg:'var(--green-bg)', border:'var(--green)', icon:'✅', cor:'var(--green)', titulo:'Baixa de produção — peça concluída!' },
    jafoi:  { bg:'var(--gray-bg)',  border:'var(--border)',icon:'ℹ️', cor:'var(--text3)', titulo:`${esc(setorNome||'')} já estava com “fim”` },
  };
  const c = cfg[tipo] || cfg.jafoi;
  res.innerHTML = `<div style="background:${c.bg};border:2px solid ${c.border};border-radius:8px;padding:16px 20px;margin-bottom:16px;animation:fadeIn .2s ease">
    <div style="font-size:24px;margin-bottom:6px">${c.icon}</div>
    <div style="font-size:15px;font-weight:700;color:${c.cor};margin-bottom:6px">${c.titulo}</div>
    <div style="font-size:13px;font-weight:700">${badgeEspecial(item)}${esc(item.produto)} — peça #${pecaNumero || '?'}</div>
    <div style="font-size:12px;color:var(--text2);margin-top:4px">Pedido ${esc(item.pedido)} · ${done}/${total} peças concluídas · Cliente: ${fmtDate(item.data_cliente)}</div>
    ${etapasHTML(etapas)}
    <div style="font-size:11px;color:var(--text3);margin-top:4px">Cód: ${esc(codigo)}</div>
  </div>`;
  setTimeout(() => { if (res) res.innerHTML = ''; }, 7000);
}

function addBipHistorico(tipo, item, pecaNumero, setorNome) {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  bipSessao.unshift({ tipo, item:{...item}, pecaNumero, setorNome, hora });
  const el = document.getElementById('bip-historico'); if (!el) return;
  const icons = { inicio:'▶️', fim:'⏹️', baixa:'✅', jafoi:'ℹ️' };
  const labels = { inicio:'Início', fim:'Fim', baixa:'Baixa', jafoi:'Já fim' };
  el.innerHTML = bipSessao.slice(0,20).map((b) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 6px;border-bottom:1px solid var(--border)">
      <span style="font-size:15px">${icons[b.tipo]||'•'}</span>
      <div style="flex:1">
        <div style="font-weight:700;font-size:12px">${b.item.especial?'★ ':''}${esc(b.item.produto)}${b.pecaNumero?` — peça #${b.pecaNumero}`:''}</div>
        <div style="font-size:11px;color:var(--text3)">Ped. ${esc(b.item.pedido)} · ${labels[b.tipo]||b.tipo}${b.setorNome?' · '+esc(b.setorNome):''}</div>
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
                  ${c.setor_id ? `<span class="st-prod" style="margin-left:4px;background:var(--gray-bg);color:var(--text2);border:1px solid var(--border)">${esc(setorNome(c.setor_id))}</span>` : '<span style="color:var(--amber);font-size:9px;margin-left:4px">sem setor</span>'}
                </li>`).join('')}
              ${(p.roteiro && p.roteiro.length) ? `<div style="margin-top:8px;font-size:10px;color:var(--text3)">Roteiro: ${p.roteiro.map(r=>{const dep=(r.depende_de||[]).map(d=>setorNome(d)).join(', ');return esc(setorNome(r.setor_id))+(dep?` (após ${esc(dep)})`:'');}).join(' · ')}</div>` : ''}
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

// componentes continuam em texto (não têm fabricação/setor — só separam material)
function componentesParaTexto(comps) {
  return (comps||[]).map(c => {
    const partes = [c.nome, c.qtdFormula ? c.qtdFormula : String(c.qtd != null ? c.qtd : 1)];
    if (c.obs) partes.push(c.obs);
    return partes.join(' | ');
  }).join('\n');
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

// ── Editor estruturado de cortes + roteiro de produção ───────────────────────
let epCortes = [];   // [{nome, formula, dim, qtdRaw, setor_id}]
let epRoteiro = [];  // [{setor_id, depende_de:[id,...]}]

function setorNome(id) { const s = SETORES.find(x => x.id === Number(id)); return s ? s.nome : ('setor #' + id); }
function setorOptions(sel) {
  return '<option value="">— sem setor —</option>' +
    SETORES.map(s => `<option value="${s.id}" ${String(sel)===String(s.id)?'selected':''}>${esc(s.nome)}</option>`).join('');
}
function corteParaEstado(c) {
  return { nome: c.nome||'', formula: c.formula||'', dim: (c.dim==='A'?'A':'L'),
           qtdRaw: c.qtdFormula ? c.qtdFormula : (c.qtd && c.qtd>1 ? String(c.qtd) : ''),
           setor_id: c.setor_id!=null ? Number(c.setor_id) : null };
}
function estadoParaCorte(e) {
  const c = { nome: e.nome.trim(), formula: e.formula.trim(), dim: e.dim==='A'?'A':'L' };
  if (e.setor_id) c.setor_id = Number(e.setor_id);
  const q = (e.qtdRaw||'').trim();
  if (q) { if (/^\d+$/.test(q)) { if (Number(q)>1) c.qtd = Number(q); } else c.qtdFormula = q; }
  return c;
}

function epSet(i, campo, val) { if (epCortes[i]) epCortes[i][campo] = val; }
function epSetSetor(i, val) { if (epCortes[i]) { epCortes[i].setor_id = val ? Number(val) : null; renderEpRoteiro(); } }
function epAddCorte() { epCortes.push({ nome:'', formula:'', dim:'L', qtdRaw:'', setor_id:null }); renderEpCortes(); }
function epDelCorte(i) { epCortes.splice(i,1); renderEpCortes(); renderEpRoteiro(); }

function renderEpCortes() {
  const el = document.getElementById('ep-cortes-lista'); if (!el) return;
  el.innerHTML = epCortes.length ? epCortes.map((c,i)=>`
    <div style="display:grid;grid-template-columns:1.3fr 1fr 42px 56px 1fr 24px;gap:4px;align-items:center;margin-bottom:5px">
      <input type="text" value="${esc(c.nome)}" placeholder="Parte" oninput="epSet(${i},'nome',this.value)" style="font-size:11px">
      <input type="text" value="${esc(c.formula)}" placeholder="L - 2.2" oninput="epSet(${i},'formula',this.value)" style="font-size:11px;font-family:monospace">
      <select onchange="epSet(${i},'dim',this.value)" style="font-size:11px"><option ${c.dim==='L'?'selected':''}>L</option><option ${c.dim==='A'?'selected':''}>A</option></select>
      <input type="text" value="${esc(c.qtdRaw)}" placeholder="qtd" oninput="epSet(${i},'qtdRaw',this.value)" style="font-size:11px" title="número ou fórmula (ex: garrasPorLargura(L))">
      <select onchange="epSetSetor(${i},this.value)" style="font-size:11px">${setorOptions(c.setor_id)}</select>
      <button class="btn btn-outline" style="padding:2px 0;font-size:10px;color:var(--red);border-color:var(--red)" onclick="epDelCorte(${i})" title="remover">✕</button>
    </div>`).join('') : '<div style="font-size:11px;color:var(--text3)">Nenhum corte. Adicione as partes fabricadas (cada uma com seu setor).</div>';
}

function epRoteiroSetores() {
  const ids = new Set();
  epCortes.forEach(c => { if (c.setor_id) ids.add(Number(c.setor_id)); });
  epRoteiro.forEach(r => ids.add(Number(r.setor_id)));
  return [...ids];
}
function renderEpRoteiro() {
  const el = document.getElementById('ep-roteiro'); if (!el) return;
  const ids = epRoteiroSetores();
  epRoteiro = ids.map(id => {
    const ex = epRoteiro.find(r => Number(r.setor_id)===id);
    return { setor_id:id, depende_de:(ex?ex.depende_de:[]).map(Number).filter(d=>ids.includes(d)) };
  });
  const fora = SETORES.filter(s => !ids.includes(s.id));
  el.innerHTML = `
    ${ids.length ? epRoteiro.map(r=>`
      <div style="border:1px solid var(--border);border-radius:6px;padding:8px 10px;margin-bottom:6px">
        <div style="font-weight:700;font-size:12px;margin-bottom:4px">${esc(setorNome(r.setor_id))}</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:3px">Depende de (precisa estar “fim” antes de iniciar):</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${ids.filter(d=>d!==r.setor_id).map(d=>`<label style="display:flex;align-items:center;gap:4px;font-size:11px;border:1px solid var(--border);border-radius:5px;padding:3px 7px;cursor:pointer">
            <input type="checkbox" ${r.depende_de.includes(d)?'checked':''} onchange="epToggleDep(${r.setor_id},${d})" style="accent-color:var(--red)"> ${esc(setorNome(d))}
          </label>`).join('') || '<span style="font-size:11px;color:var(--text3)">— independente —</span>'}
        </div>
      </div>`).join('') : '<div style="font-size:11px;color:var(--text3)">Defina o setor dos cortes (ou adicione etapas) para montar o roteiro.</div>'}
    ${fora.length ? `<div style="margin-top:4px;display:flex;gap:6px;align-items:center">
      <select id="ep-add-etapa" style="font-size:11px"><option value="">+ etapa sem corte (ex.: Montagem, Embalagem)</option>${fora.map(s=>`<option value="${s.id}">${esc(s.nome)}</option>`).join('')}</select>
      <button class="btn btn-outline" style="padding:3px 8px;font-size:10px" onclick="epAddEtapa()">adicionar</button>
    </div>`:''}`;
}
function epToggleDep(setorId, depId) {
  const r = epRoteiro.find(x=>Number(x.setor_id)===Number(setorId)); if(!r) return;
  const i = r.depende_de.indexOf(Number(depId));
  if (i>=0) r.depende_de.splice(i,1); else r.depende_de.push(Number(depId));
}
function epAddEtapa() {
  const v = document.getElementById('ep-add-etapa').value; if(!v) return;
  if (!epRoteiro.find(r=>Number(r.setor_id)===Number(v))) epRoteiro.push({ setor_id:Number(v), depende_de:[] });
  renderEpRoteiro();
}

let produtoEditandoId = null;

function abrirProdutoModal(id) {
  produtoEditandoId = id || null;
  const p = id ? ESTRUTURA.find(x => x.id === id) : null;
  const familias = Object.keys(FAMILIA_META);
  epCortes = (p && p.cortes ? p.cortes : []).map(corteParaEstado);
  epRoteiro = (p && p.roteiro ? p.roteiro : []).map(r=>({ setor_id:Number(r.setor_id), depende_de:(r.depende_de||[]).map(Number) }));

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
    <div class="form-group" style="grid-column:1/-1">
      <label>Fórmulas de corte — parte · fórmula · dim · qtd · setor de fabricação</label>
      <div id="ep-cortes-lista"></div>
      <button class="btn btn-outline" style="margin-top:4px;font-size:11px" onclick="epAddCorte()">+ adicionar corte</button>
    </div>
    <div class="form-group" style="grid-column:1/-1"><label>Componentes (BOM) — só separam material do estoque (sem fabricação) — um por linha: nome | qtd | obs</label>
      <textarea id="ep-componentes" rows="4" style="font-family:monospace;font-size:11px" placeholder="Comando Mini | 1">${p ? esc(componentesParaTexto(p.componentes)) : ''}</textarea>
    </div>
    <div class="form-group" style="grid-column:1/-1">
      <label>Roteiro de produção — setores e dependências (este produto pode passar por vários setores)</label>
      <div id="ep-roteiro"></div>
    </div>
    <div style="grid-column:1/-1;font-size:10px;color:var(--text3);line-height:1.6">
      <strong>Variáveis:</strong> <code>largura</code>/<code>L</code> e <code>altura</code>/<code>A</code> (medidas da peça); pode referenciar outro corte pela sua <em>key</em>.<br>
      <strong>Funções:</strong> <code>SE(cond; v_verdadeiro; v_falso)</code>, <code>E(...)</code>, <code>OU(...)</code>, <code>ARREDACIMA(x)</code>, <code>ARRED(x; casas)</code>, <code>MIN(...)</code>, <code>MAX(...)</code>.<br>
      Ex.: <code>L - 4.5</code> · <code>(L+30)/4</code> · <code>SE(furos>1; L-0.303; 0)</code>. Qtd: número ou fórmula. Setor vazio = corte sem setor. O roteiro define a ordem: um setor só inicia quando os setores de que ele depende estão com “fim”.
    </div>
  `;
  document.getElementById('modal-footer').innerHTML = `
    <button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
    <button class="btn btn-red" onclick="salvarProduto()">${p ? 'Salvar alterações' : 'Adicionar produto'}</button>
  `;
  document.getElementById('modal-overlay').classList.add('open');
  renderEpCortes();
  renderEpRoteiro();
}

async function salvarProduto() {
  const nome = document.getElementById('ep-nome').value.trim();
  if (!nome) { toast('Informe o nome do produto.'); return; }
  for (const c of epCortes) {
    if (!c.nome.trim() || !c.formula.trim()) { toast('Cada corte precisa de “parte” e “fórmula”.'); return; }
  }
  let componentes;
  try { componentes = textoParaComponentes(document.getElementById('ep-componentes').value); }
  catch (e) { toast(e.message); return; }

  const payload = {
    nome,
    familia: document.getElementById('ep-familia').value,
    tubo: document.getElementById('ep-tubo').value.trim() || null,
    unidade: document.getElementById('ep-unidade').value,
    cortes: epCortes.map(estadoParaCorte),
    componentes,
    roteiro: epRoteiro.map(r => ({ setor_id: Number(r.setor_id), depende_de: (r.depende_de||[]).map(Number) })),
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

// Preenche o select de tipo do novo pedido a partir do cadastro (pcp_tipos).
function popularSelectTipos() {
  const sel = document.getElementById('fn-tipo');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = TIPOS.map(t => `<option>${esc(t.nome)}</option>`).join('');
  if (atual && TIPOS.some(t => t.nome === atual)) sel.value = atual;
  else sel.value = tipoPadraoNome();
}

// Produto atualmente selecionado no formulário de novo pedido.
function fnProdutoSelecionado() {
  const sel = document.getElementById('fn-produto');
  const livre = document.getElementById('fn-produto-livre');
  const produto = sel.value === '__livre__' ? (livre.value || '').trim().toUpperCase() : sel.value;
  let produto_id = null;
  if (sel.value && sel.value !== '__livre__') {
    const opt = sel.options[sel.selectedIndex];
    produto_id = opt && opt.dataset.id ? Number(opt.dataset.id) : null;
  }
  return { produto, produto_id };
}

// Mostra os campos de furos/modelo só quando o produto é horizontal (PH 25/50).
function fnAtualizarHorizontal() {
  const grp = document.getElementById('fn-horiz-group');
  if (!grp) return;
  grp.style.display = ehHorizontal(fnProdutoSelecionado()) ? '' : 'none';
}

// ─── ORDEM DE CORTE ──────────────────────────────────────────────────────────
let ocModo = 'individual';          // 'individual' | 'lote'
let ocPreviewData = null;           // resposta do /preview
let ocStatusData = {};              // mapa pedido -> {impresso, ultima, vezes, historico}
let ocPedidosAtuais = [];           // pedidos da última pré-visualização

function ocInit() {
  // garante estado visual do toggle ao entrar na página
  ocSetModo(ocModo);
}

function ocSetModo(modo) {
  ocModo = modo === 'lote' ? 'lote' : 'individual';
  const bi = document.getElementById('oc-modo-individual');
  const bl = document.getElementById('oc-modo-lote');
  if (bi) bi.className = 'btn ' + (ocModo === 'individual' ? 'btn-red' : 'btn-outline');
  if (bl) bl.className = 'btn ' + (ocModo === 'lote' ? 'btn-red' : 'btn-outline');
}

function ocLerPedidos() {
  const raw = (document.getElementById('oc-pedidos').value || '').trim();
  if (!raw) return [];
  return [...new Set(raw.split(/[,;\s]+/).map(p => p.trim()).filter(Boolean))];
}

function ocFmtMedida(linha) {
  const u = linha.unidade ? ' ' + linha.unidade : '';
  const l = linha.largura != null && linha.largura !== '' ? linha.largura : null;
  const a = linha.altura != null && linha.altura !== '' ? linha.altura : null;
  if (l != null && a != null) return `${l} × ${a}${u ? ' ' + linha.unidade : ''}`;
  if (l != null) return `${l}${u}`;
  if (a != null) return `${a}${u}`;
  return '—';
}
function ocFmtValor(linha) {
  if (linha.valor == null || linha.valor === '') return '—';
  const u = linha.unidade ? ' ' + esc(linha.unidade) : '';
  return esc(String(linha.valor)) + u;
}

// ── Ficha didática: agrupa por peça e junta "X (Largura)" + "X (Altura)" ──────
function ocValNum(v) { return v != null && v !== '' && Number.isFinite(Number(v)); }

// Combina as linhas de um setor em peças; cortes "Base (Largura)"/"Base (Altura)"
// viram um único corte 2D (mesmo pano: largura e altura juntas).
function ocCombinarCortes(linhas) {
  const reLA = /^(.*?)[\s]*\((largura|altura|larg\.?|alt\.?|l|a)\)\s*$/i;
  const pecas = new Map();
  for (const l of (linhas || [])) {
    const key = `${l.pedido}#${l.peca_numero}#${l.produto}`;
    if (!pecas.has(key)) pecas.set(key, {
      pedido: l.pedido, produto: l.produto, peca_numero: l.peca_numero,
      largura: l.largura, altura: l.altura, itens: [], _idx: {},
    });
    const g = pecas.get(key);
    const m = String(l.corte || '').match(reLA);
    if (m) {
      const base = m[1].trim();
      const eixo = /^(largura|larg\.?|l)$/i.test(m[2]) ? 'l' : 'a';
      const ik = base.toLowerCase();
      let c = g._idx[ik];
      if (!c) { c = { nome: base, tipo: '2d', larg: null, alt: null, unidade: l.unidade }; g._idx[ik] = c; g.itens.push(c); }
      if (eixo === 'l') c.larg = l.valor; else c.alt = l.valor;
      if (!c.unidade && l.unidade) c.unidade = l.unidade;
    } else {
      g.itens.push({ nome: l.corte, tipo: '1d', valor: l.valor, unidade: l.unidade });
    }
  }
  return [...pecas.values()];
}

function ocCorteTexto(c) {
  const u = c.unidade ? ' ' + c.unidade : '';
  if (c.tipo === '2d') {
    const lt = ocValNum(c.larg) ? c.larg : '—';
    const at = ocValNum(c.alt) ? c.alt : '—';
    return `${lt} × ${at}${u}`;
  }
  return ocValNum(c.valor) ? `${c.valor}${u}` : '—';
}
// valor não-positivo = medida provavelmente em metros / faltando (planilha usa IF>0)
function ocCorteInvalido(c) {
  if (c.tipo === '2d') return (ocValNum(c.larg) && c.larg <= 0) || (ocValNum(c.alt) && c.alt <= 0);
  return ocValNum(c.valor) && c.valor <= 0;
}

// Gera os blocos por peça (didático). modo: 'preview' (tema do app) | 'print'.
function ocFichaPecasHTML(linhas, modo) {
  const grupos = ocCombinarCortes(linhas);
  if (!grupos.length) {
    return modo === 'print'
      ? '<p class="vazio">Sem cortes neste setor.</p>'
      : '<div style="font-size:11px;color:var(--text3)">Sem cortes neste setor.</div>';
  }
  const P = modo === 'print'
    ? { card: '1px solid #D2D0C9', head: '#1D1D1B', sub: '#606060', warn: '#C1212D', linha: '#ECEBE7', val: '#1D1D1B', headbg: '#FAF7EE' }
    : { card: '1px solid var(--border)', head: 'var(--text)', sub: 'var(--text3)', warn: 'var(--red)', linha: 'var(--border)', val: 'var(--text)', headbg: 'var(--gray-bg)' };
  return grupos.map(g => {
    const vao = (ocValNum(g.largura) || ocValNum(g.altura))
      ? `vão ${ocValNum(g.largura) ? g.largura : '—'} × ${ocValNum(g.altura) ? g.altura : '—'} cm`
      : 'medida pendente';
    const itens = g.itens.map(c => {
      const inval = ocCorteInvalido(c);
      const aviso = inval ? ` <span style="color:${P.warn};font-size:9px;font-weight:700">⚠ confira a medida (cm)</span>` : '';
      const dimTag = c.tipo === '2d' ? ` <span style="font-size:9px;color:${P.sub}">(largura × altura)</span>` : '';
      return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 12px;border-top:1px solid ${P.linha}">
        <span style="font-size:12px;color:${P.head}">${ocEscPrint(c.nome)}${dimTag}</span>
        <span style="font-weight:800;font-size:15px;color:${inval ? P.warn : P.val};white-space:nowrap">${ocEscPrint(ocCorteTexto(c))}${aviso}</span>
      </div>`;
    }).join('');
    return `<div style="border:${P.card};border-radius:8px;overflow:hidden;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:10px;padding:7px 12px;background:${P.headbg}">
        <strong style="font-size:12px;color:${P.head}">Peça ${g.peca_numero != null ? '#' + ocEscPrint(String(g.peca_numero)) : ''} · ${ocEscPrint(g.produto)}</strong>
        <span style="font-size:11px;color:${P.sub}">${ocEscPrint(vao)}</span>
      </div>
      ${itens}
    </div>`;
  }).join('');
}

async function ocPreview() {
  if (!ehAdmin() && !podeVer('ordemcorte')) { toast('Sem permissão para a Ordem de Corte.'); return; }
  const pedidos = ocLerPedidos();
  const cont = document.getElementById('oc-conteudo');
  const avisosEl = document.getElementById('oc-avisos');
  const statusBox = document.getElementById('oc-status-box');
  if (!pedidos.length) { toast('Informe ao menos um pedido.'); return; }
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Carregando pré-visualização...</div>';
  avisosEl.innerHTML = '';
  statusBox.innerHTML = '';
  ocPedidosAtuais = pedidos;

  try {
    const qs = 'pedidos=' + encodeURIComponent(pedidos.join(','));
    const [preview, status] = await Promise.all([
      api('pcp/ordem-corte/preview?' + qs),
      api('pcp/ordem-corte/status?' + qs).catch(() => ({ data: {} })),
    ]);
    ocPreviewData = preview;
    ocStatusData = (status && status.data) || {};
    ocRenderStatus();
    ocRenderAvisos(preview.avisos || []);
    ocRenderPreview(preview);
  } catch (e) {
    cont.innerHTML = `<div style="color:var(--red);font-size:12px;padding:8px 0">${esc(e.message)}</div>`;
  }
}

function ocRenderStatus() {
  const box = document.getElementById('oc-status-box');
  const peds = ocPedidosAtuais;
  if (!peds.length) { box.innerHTML = ''; return; }
  const cards = peds.map(p => {
    const st = ocStatusData[p];
    if (st && st.impresso) {
      return `<div style="flex:1;min-width:200px;background:var(--amber-bg);border:2px solid #FFA000;border-radius:8px;padding:10px 14px">
        <div style="font-size:13px;font-weight:800;color:var(--amber);letter-spacing:.02em">⚠ PEDIDO ${esc(p)} — JÁ IMPRESSO</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${st.vezes||1}× · última: ${ocFmtDataHora(st.ultima)}</div>
      </div>`;
    }
    return `<div style="flex:1;min-width:200px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px">
      <div style="font-size:13px;font-weight:700">Pedido ${esc(p)}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px">Ainda não impresso</div>
    </div>`;
  }).join('');
  box.innerHTML = `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">${cards}</div>`;
}

function ocFmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return esc(String(iso));
  return d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

function ocRenderAvisos(avisos) {
  const el = document.getElementById('oc-avisos');
  if (!avisos || !avisos.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="background:var(--amber-bg);border:1px solid #FFA000;border-radius:8px;padding:10px 14px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;color:var(--amber);margin-bottom:4px">⚠ Avisos</div>
    <ul style="margin:0;padding-left:18px;font-size:11px;color:var(--text2)">${avisos.map(a=>`<li>${esc(typeof a === 'string' ? a : (a.mensagem || JSON.stringify(a)))}</li>`).join('')}</ul>
  </div>`;
}

function ocRenderPreview(preview) {
  const cont = document.getElementById('oc-conteudo');
  const setores = (preview && preview.setores) || [];
  const peds = (preview && preview.pedidos) || ocPedidosAtuais;

  if (!setores.length) {
    cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nenhum corte encontrado para esses pedidos (verifique se há setores marcados como “imprime ordem de corte” e se as peças têm cortes).</div>';
    return;
  }

  const cabecalho = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
    <div style="font-size:13px;font-weight:700">Pré-visualização — ${peds.length} pedido(s): ${esc(peds.join(', '))}</div>
    <div style="margin-left:auto;display:flex;gap:8px">
      <button class="btn btn-black" onclick="ocImprimir(null)">🖨 Imprimir tudo</button>
    </div>
  </div>`;

  const secoes = setores.map((s, ix) => {
    const setor = s.setor || {};
    const linhas = s.linhas || [];
    const cor = setor.cor || '#606060';
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid ${cor}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span class="st-prod" style="background:${cor}22;color:${cor};border:1px solid ${cor}66;font-size:12px">${esc(setor.nome || 'Setor')}</span>
        <span style="font-size:11px;color:var(--text3)">${new Set(linhas.map(l=>l.pedido+'#'+l.peca_numero)).size} peça(s)</span>
        <button class="btn btn-outline" style="margin-left:auto;font-size:10px" onclick="ocImprimir(${setor.id != null ? setor.id : 'null'})">🖨 Imprimir só este setor</button>
      </div>
      ${linhas.length ? ocFichaPecasHTML(linhas, 'preview') : '<div style="font-size:11px;color:var(--text3)">Sem cortes neste setor.</div>'}
    </div>`;
  }).join('');

  cont.innerHTML = cabecalho + secoes + ocHistoricoHTML();
  ocCarregarHistorico();
}

function ocHistoricoHTML() {
  return `<div class="card"><div class="card-title">Histórico de impressão</div>
    <div id="oc-historico" style="font-size:12px;color:var(--text3)">Carregando histórico...</div></div>`;
}

async function ocCarregarHistorico() {
  const el = document.getElementById('oc-historico');
  if (!el) return;
  const peds = ocPedidosAtuais;
  if (!peds.length) { el.innerHTML = '<div style="color:var(--text3)">Nenhum pedido.</div>'; return; }
  try {
    const resultados = await Promise.all(peds.map(p =>
      api('pcp/ordem-corte/log?pedido=' + encodeURIComponent(p)).then(r => ({ pedido: p, logs: r.data || [] })).catch(() => ({ pedido: p, logs: [] }))
    ));
    const linhas = [];
    resultados.forEach(({ pedido, logs }) => {
      logs.forEach(log => linhas.push({ pedido, ...log }));
    });
    if (!linhas.length) { el.innerHTML = '<div style="color:var(--text3)">Nenhuma impressão registrada ainda.</div>'; return; }
    el.innerHTML = `<div class="tbl-wrap"><table style="font-size:11px">
      <thead><tr><th>Pedido</th><th>Tipo</th><th>Modo</th><th>Por</th><th>Quando</th></tr></thead>
      <tbody>${linhas.map(l=>{
        const reimp = String(l.tipo||'').toLowerCase().includes('reimp');
        return `<tr>
          <td>${esc(l.pedido)}</td>
          <td>${reimp ? '<span class="st st-atencao" style="font-size:9px">reimpressão</span>' : '<span class="st st-ok" style="font-size:9px">impressão</span>'}</td>
          <td>${esc(l.modo || '—')}</td>
          <td>${esc(l.por || '—')}</td>
          <td>${ocFmtDataHora(l.quando)}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red)">${esc(e.message)}</div>`;
  }
}

async function ocImprimir(setorId) {
  if (!ocPreviewData) { toast('Pré-visualize antes de imprimir.'); return; }
  const peds = ocPedidosAtuais;
  if (!peds.length) { toast('Informe os pedidos.'); return; }
  const body = { pedidos: peds, modo: ocModo };
  if (setorId != null) body.setor_id = setorId;
  try {
    const r = await api('pcp/ordem-corte/imprimir', { method: 'POST', body });
    if (r.reimpressao) toast('Atenção: esta é uma REIMPRESSÃO (já havia sido impresso antes).');
    else toast('Ordem de corte registrada para impressão.');
    // abre a janela de impressão (filtra por setor se aplicável)
    ocAbrirImpressao(setorId);
    // atualiza status + histórico
    try {
      const qs = 'pedidos=' + encodeURIComponent(peds.join(','));
      const status = await api('pcp/ordem-corte/status?' + qs).catch(() => ({ data: {} }));
      ocStatusData = (status && status.data) || {};
      ocRenderStatus();
    } catch (e) {}
    ocCarregarHistorico();
  } catch (e) { toast('Erro ao imprimir: ' + e.message); }
}

// ── monta a view de impressão (PDF via navegador) ────────────────────────────
function ocSetoresFiltrados(setorId) {
  const setores = (ocPreviewData && ocPreviewData.setores) || [];
  if (setorId == null) return setores;
  return setores.filter(s => s.setor && Number(s.setor.id) === Number(setorId));
}

function ocEhHorizontalLinha(l) {
  const nome = String(l.produto || '').toUpperCase();
  return /\bPH\s*25|\bPH25|\bPH\s*50|\bPH50|HORIZONTAL/.test(nome);
}

function ocAbrirImpressao(setorId) {
  const setores = ocSetoresFiltrados(setorId);
  if (!setores.length) { toast('Nada para imprimir neste setor.'); return; }
  const peds = ocPedidosAtuais;
  const dataStr = new Date().toLocaleString('pt-BR');
  const modoLabel = ocModo === 'lote' ? 'Lote' : 'Individual';

  // URLs absolutas (a janela de impressão não herda o base do app)
  const asset = (rel) => new URL(rel, document.baseURI).href;
  const logo = asset('assets/brand/logos/logo-preto.png');
  const fonte = (w) => asset('assets/fonts/manrope-' + w + '.woff2');

  // Cada setor vira uma FICHA própria (uma página por setor).
  const fichas = setores.map(s => {
    const setor = s.setor || {};
    const linhas = s.linhas || [];
    const cor = setor.cor || '#C1212D';
    const corpo = ocFichaPecasHTML(linhas, 'print');
    const totalPecas = new Set(linhas.map(l => l.pedido + '#' + l.peca_numero)).size;
    return `<section class="ficha">
      <header class="ficha-head">
        <div class="brand">
          <img class="logo" src="${logo}" alt="Persianas Paraná"
               onerror="this.style.display='none'">
          <div class="brand-txt">
            <div class="tit">Ficha de Produção — Corte</div>
            <div class="setor" style="color:${cor};border-color:${cor}">${ocEscPrint(setor.nome || 'Setor')}</div>
          </div>
        </div>
        <div class="meta">
          <div><span>Pedido(s)</span><strong>${ocEscPrint(peds.join(', '))}</strong></div>
          <div><span>Modo</span>${ocEscPrint(modoLabel)}</div>
          <div><span>Peças</span>${totalPecas}</div>
          <div><span>Emitido</span>${ocEscPrint(dataStr)}</div>
        </div>
      </header>
      ${corpo}
      <div class="assinatura">
        <div class="campo"><span>Cortado por</span></div>
        <div class="campo"><span>Conferido por</span></div>
        <div class="campo"><span>Data / Hora</span></div>
      </div>
    </section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Ordem de Corte — ${ocEscPrint(peds.join(', '))}</title>
<style>
  @font-face { font-family:'Manrope'; font-weight:400; font-display:swap; src:url('${fonte('400')}') format('woff2'); }
  @font-face { font-family:'Manrope'; font-weight:600; font-display:swap; src:url('${fonte('600')}') format('woff2'); }
  @font-face { font-family:'Manrope'; font-weight:700; font-display:swap; src:url('${fonte('700')}') format('woff2'); }
  @font-face { font-family:'Manrope'; font-weight:800; font-display:swap; src:url('${fonte('800')}') format('woff2'); }
  * { box-sizing: border-box; }
  body { font-family:'Manrope','Helvetica Neue',Arial,sans-serif; color:#1D1D1B; margin:0; font-size:12px; }
  .ficha { padding:14mm 12mm; }
  .ficha + .ficha { page-break-before: always; }
  .ficha-head { display:flex; justify-content:space-between; align-items:flex-end;
    border-bottom:3px solid #C1212D; padding-bottom:10px; margin-bottom:16px; position:relative; }
  .ficha-head::after { content:''; position:absolute; left:0; right:0; bottom:-6px; height:3px; background:#C6B784; }
  .brand { display:flex; align-items:center; gap:14px; }
  .logo { height:46px; width:auto; }
  .brand-txt .tit { font-size:13px; font-weight:700; color:#606060; letter-spacing:.02em; }
  .brand-txt .setor { font-size:24px; font-weight:800; text-transform:uppercase; letter-spacing:.03em;
    border-left:7px solid; padding-left:10px; line-height:1.05; margin-top:2px; }
  .meta { text-align:right; font-size:11px; color:#606060; }
  .meta div { margin-bottom:2px; }
  .meta span { display:inline-block; min-width:64px; text-transform:uppercase; font-size:9px; letter-spacing:.04em; color:#9CA3AF; }
  .meta strong { color:#1D1D1B; }
  table { width:100%; border-collapse:collapse; margin:0 0 6px; }
  th, td { border:1px solid #D2D0C9; padding:6px 8px; text-align:left; }
  th { background:#1D1D1B; color:#fff; font-size:10px; text-transform:uppercase; letter-spacing:.03em; }
  td { font-size:12px; }
  tr:nth-child(even) td { background:#FAF7EE; }
  td strong { color:#A11823; }
  .nota { font-size:10px; color:#606060; margin:8px 0 4px; }
  .vazio { font-size:11px; color:#999; }
  .assinatura { display:flex; gap:24px; margin-top:28px; }
  .assinatura .campo { flex:1; border-top:1px solid #1D1D1B; padding-top:5px; }
  .assinatura .campo span { font-size:10px; text-transform:uppercase; letter-spacing:.04em; color:#606060; }
  .rodape { margin-top:14px; font-size:9px; color:#9CA3AF; text-align:center; }
  @media print { button { display:none; } .ficha { padding:0; } }
  @page { size:A4; margin:12mm; }
</style></head>
<body>
  ${fichas}
  <div class="rodape">Documento gerado pelo PCP · Persianas Paraná — confira as medidas antes de cortar.</div>
  <script>window.onload = function(){
    var go = function(){ setTimeout(function(){ window.print(); }, 300); };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go); } else { go(); }
  };<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { toast('Permita pop-ups para gerar o PDF de impressão.'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function ocEscPrint(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// tabela genérica (rolôs e demais)
function ocTabelaPadrao(linhas) {
  return `<table>
    <thead><tr><th>Pedido</th><th>Produto</th><th>Peça</th><th>Medida</th><th>Corte</th><th>Medida calc.</th><th>Unid.</th></tr></thead>
    <tbody>${linhas.map(l=>`<tr>
      <td>${ocEscPrint(l.pedido)}</td>
      <td>${ocEscPrint(l.produto)}</td>
      <td style="text-align:center">${l.peca_numero != null ? '#'+ocEscPrint(String(l.peca_numero)) : '—'}</td>
      <td>${ocEscPrint(ocMedidaTexto(l))}</td>
      <td><strong>${ocEscPrint(l.corte)}</strong></td>
      <td><strong>${l.valor != null && l.valor !== '' ? ocEscPrint(String(l.valor)) : '—'}</strong></td>
      <td>${ocEscPrint(l.unidade || '')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function ocMedidaTexto(l) {
  const l1 = l.largura != null && l.largura !== '' ? l.largura : null;
  const a1 = l.altura != null && l.altura !== '' ? l.altura : null;
  if (l1 != null && a1 != null) return `${l1} × ${a1}`;
  if (l1 != null) return `L ${l1}`;
  if (a1 != null) return `A ${a1}`;
  return '—';
}

// tabela específica para horizontais (PH25/PH50): agrupa por peça e mostra
// furos / lâminas / cordas / cadarço a partir dos nomes dos cortes que vierem
function ocTabelaHorizontal(linhas) {
  // agrupa linhas por (pedido + peça)
  const grupos = {};
  linhas.forEach(l => {
    const k = l.pedido + '#' + (l.peca_numero != null ? l.peca_numero : '?');
    if (!grupos[k]) grupos[k] = { pedido: l.pedido, peca: l.peca_numero, produto: l.produto, largura: l.largura, altura: l.altura, cortes: {} };
    const g = grupos[k];
    if (g.largura == null && l.largura != null) g.largura = l.largura;
    if (g.altura == null && l.altura != null) g.altura = l.altura;
    // nome do corte (normalizado) -> valor
    g.cortes[String(l.corte || '').trim()] = (l.valor != null && l.valor !== '') ? l.valor : '';
  });

  // descobre o conjunto de nomes de corte presentes (preserva ordem de aparição)
  const nomesCorte = [];
  linhas.forEach(l => { const n = String(l.corte || '').trim(); if (n && !nomesCorte.includes(n)) nomesCorte.push(n); });

  const cabeçalhoCortes = nomesCorte.map(n => `<th>${ocEscPrint(n)}</th>`).join('');
  const corpo = Object.values(grupos).map(g => `<tr>
    <td>${ocEscPrint(g.pedido)}</td>
    <td>${ocEscPrint(g.produto)}</td>
    <td style="text-align:center">${g.peca != null ? '#'+ocEscPrint(String(g.peca)) : '—'}</td>
    <td>${g.largura != null && g.largura !== '' ? ocEscPrint(String(g.largura)) : '—'}</td>
    <td>${g.altura != null && g.altura !== '' ? ocEscPrint(String(g.altura)) : '—'}</td>
    ${nomesCorte.map(n => `<td><strong>${g.cortes[n] != null && g.cortes[n] !== '' ? ocEscPrint(String(g.cortes[n])) : '—'}</strong></td>`).join('')}
  </tr>`).join('');

  return `<div style="font-size:10px;color:#606060;margin:4px 0">Horizontais (PH 25 / PH 50) — largura, altura, furos, lâminas, cordas e cadarço por peça:</div>
  <table>
    <thead><tr><th>Pedido</th><th>Produto</th><th>Peça</th><th>Largura</th><th>Altura</th>${cabeçalhoCortes}</tr></thead>
    <tbody>${corpo}</tbody>
  </table>`;
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
    aplicarPermissoes();
    if (!podeVer(currentPage)) goTo(primeiraAbaVisivel());
  } catch (e) {
    // 401 já redirecionou para o login; demais erros ficam visíveis
    console.error(e);
  }
})();