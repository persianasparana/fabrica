/**
 * Sistema de Gestão de Não Conformidades - Persianas Paraná
 * Aplicação principal (frontend SPA-lite).
 *
 * Comunica com a API REST em /api/* via fetch.
 * Boas práticas: módulo IIFE, sem variáveis globais expostas, CSRF, escape de HTML.
 */
(function () {
  'use strict';

  // ============================================================================
  // CONSTANTES
  // ============================================================================

  const SETORES = [
    { v: 'Comercial', i: '💼' },
    { v: 'Fábrica', i: '🏭' },
    { v: 'Instalação', i: '🔧' },
    { v: 'Produto', i: '📦' },
    { v: 'Fornecedor', i: '🚚' },
    { v: 'Logística', i: '📋' },
    { v: 'PCP', i: '📊' },
    { v: 'Expedição', i: '📤' },
    { v: 'Compras/Almox', i: '🏪' },
  ];

  const TEMAS_TREINAMENTO = {
    'Comercial': [
      'Levantamento técnico completo na venda',
      'Checklist de restrições de acesso ao condomínio',
      'Alinhamento de expectativas com o cliente',
      'Conferência de acessórios especiais no pedido',
      'Comunicação pós-venda e agendamento',
    ],
    'Fábrica': [
      'Leitura e interpretação da ordem de produção',
      'Conferência de acessórios e itens complementares',
      'Qualidade de acabamento e padrão de produto',
      'Sinalização de pedidos com itens especiais',
    ],
    'Instalação': [
      'Conferência de material antes de sair para o cliente',
      'Comunicação com cliente sobre restrições e horários',
      'Protocolo de instalação e checklist de entrega',
      'Relatório de ocorrências em campo',
    ],
    'PCP': [
      'Verificação de pedidos com acessórios especiais',
      'Conferência de itens complementares na ordem',
      'Comunicação de pendências entre setores',
      'Planejamento de produção com itens críticos',
    ],
    'Expedição': [
      'Conferência completa de material antes do carregamento',
      'Checklist de saída por pedido',
      'Separação e conferência de acessórios específicos',
    ],
    'Logística': [
      'Verificação de carga completa antes da entrega',
      'Comunicação de divergências antes da instalação',
      'Protocolo de retorno e reentrega',
    ],
    'Fornecedor': [
      'Qualificação e avaliação de fornecedores',
      'Controle de qualidade no recebimento',
      'Gestão de não conformidades de fornecedor',
    ],
    'Produto': [
      'Padrões de qualidade do produto',
      'Ficha técnica e especificações',
      'Controle de qualidade na produção',
    ],
    'Compras/Almox': [
      'Controle de estoque de acessórios e insumos',
      'Gestão de compras de itens críticos',
      'Recebimento e conferência de materiais',
    ],
  };

  const CHART_COLORS = ['#C0392B', '#EF9F27', '#D85A30', '#639922', '#7F77DD',
                        '#D4537E', '#2471A3', '#117A65', '#7D6608'];

  // ============================================================================
  // ESTADO
  // ============================================================================

  const state = {
    user: null,
    csrfToken: '',
    ncs: [],
    selSetores: [],
    selOrigens: [],
    selImpacto: null,
    filtroAtual: 'todos',
    charts: {},
  };

  // ============================================================================
  // UTILITÁRIOS
  // ============================================================================

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

  // Escape de HTML para prevenir XSS
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function fmtData(s) {
    if (!s) return '';
    const p = s.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
  }

  function notify(msg, isOk) {
    const el = $('#notif');
    el.textContent = msg;
    el.className = 'notif show ' + (isOk ? 'ok' : 'err');
    setTimeout(() => { el.className = 'notif'; }, 3500);
  }

  // ============================================================================
  // API
  // ============================================================================

  async function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = opts.headers || {};

    if (opts.method && opts.method !== 'GET') {
      opts.headers['X-CSRF-Token'] = state.csrfToken;
      if (opts.body && typeof opts.body !== 'string') {
        opts.body = JSON.stringify(opts.body);
        opts.headers['Content-Type'] = 'application/json';
      }
    }

    const res = await fetch('api/' + path, opts);

    if (res.status === 401) {
      window.location.href = 'login.html';
      throw new Error('Não autenticado');
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Erro na requisição');
    }
    return data;
  }

  async function carregarSessao() {
    const data = await api('auth.php');
    state.user = data.user;
    state.csrfToken = data.csrf_token;
    $('#user-name').textContent = data.user.full_name || data.user.username;
  }

  async function carregarNCs() {
    const data = await api('ncs.php');
    state.ncs = data.data || [];
  }

  // ============================================================================
  // RENDER: FORMULÁRIO DE SELEÇÃO (chips)
  // ============================================================================

  function montarChips(containerId, lista, tipo) {
    const c = $('#' + containerId);
    c.innerHTML = lista.map(function (item) {
      const v = typeof item === 'string' ? item : item.v;
      const ico = typeof item === 'object' && item.i ? `<span class="ico">${item.i}</span>` : '';
      return `<button type="button" class="chip" data-v="${escapeHtml(v)}" data-tipo="${tipo}">${ico}${escapeHtml(v)}</button>`;
    }).join('');
  }

  function montarChipsImpacto() {
    const c = $('#g-imp');
    c.innerHTML = `
      <button type="button" class="chip imp-baixo" data-v="Baixo" data-tipo="impacto">🟢 Baixo</button>
      <button type="button" class="chip imp-medio" data-v="Médio" data-tipo="impacto">🟡 Médio</button>
      <button type="button" class="chip imp-alto" data-v="Alto" data-tipo="impacto">🔴 Alto</button>
    `;
  }

  function handleChipClick(e) {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    const v = btn.dataset.v;
    const tipo = btn.dataset.tipo;

    if (tipo === 'setor' || tipo === 'origem') {
      const arr = tipo === 'setor' ? state.selSetores : state.selOrigens;
      const idx = arr.indexOf(v);
      if (idx >= 0) {
        arr.splice(idx, 1);
        btn.classList.remove('on');
      } else {
        arr.push(v);
        btn.classList.add('on');
      }
    } else if (tipo === 'impacto') {
      const grp = btn.parentElement;
      grp.querySelectorAll('.chip').forEach(b => b.classList.remove('on'));
      if (state.selImpacto === v) {
        state.selImpacto = null;
      } else {
        state.selImpacto = v;
        btn.classList.add('on');
      }
    }
  }

  // ============================================================================
  // ABAS
  // ============================================================================

  function trocarAba(panel) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.panel === panel));
    $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'p-' + panel));

    if (panel === 'his') renderHistorico();
    if (panel === 'plan') renderPlanos();
    if (panel === 'kpi') renderKpis();
    if (panel === 'trei') renderTreinamentos();
  }

  // ============================================================================
  // RENDER: HISTÓRICO
  // ============================================================================

  function renderHistorico() {
    const filtrar = state.filtroAtual;
    let lista = state.ncs;

    if (filtrar !== 'todos') {
      if (filtrar === 'Alto') {
        lista = lista.filter(n => n.impacto === 'Alto');
      } else {
        lista = lista.filter(n => n.status === filtrar);
      }
    }

    const el = $('#list-his');
    if (!lista.length) {
      el.innerHTML = '<div class="empty">Nenhuma NC encontrada.<br>Ajuste o filtro ou registre uma nova.</div>';
      return;
    }

    el.innerHTML = lista.map(renderCard).join('');

    // Anexa handlers
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleCardAction);
    });
  }

  function renderCard(nc) {
    const impCls = nc.impacto === 'Alto' ? 'b-alto' : nc.impacto === 'Baixo' ? 'b-baixo' : 'b-medio';
    const stCls = nc.status === 'Aberta' ? 'b-aberta' : nc.status === 'Encerrada' ? 'b-encerrada' : 'b-andamento';
    const setoresArr = Array.isArray(nc.setores) ? nc.setores : [];
    const origensArr = Array.isArray(nc.origens) ? nc.origens : [];

    const tagsSet = setoresArr.map(s => `<span class="tag tag-setor">${escapeHtml(s)}</span>`).join('');
    const tagsOri = origensArr.map(o => `<span class="tag tag-origem">Origem: ${escapeHtml(o)}</span>`).join('');

    const causa = nc.causa_raiz ? `<div class="card-aside"><strong>Causa raiz</strong>${escapeHtml(nc.causa_raiz)}</div>` : '';
    const acao = nc.acao_imediata ? `<div class="card-aside"><strong>Ação imediata</strong>${escapeHtml(nc.acao_imediata)}</div>` : '';

    const meta = [];
    if (nc.responsavel) meta.push(`Resp: ${escapeHtml(nc.responsavel)}`);
    if (nc.prazo) meta.push(`Prazo: ${fmtData(nc.prazo)}`);
    const metaStr = meta.length ? `<span class="meta">${meta.join(' · ')}</span>` : '';

    const titulo = nc.pedido ? `Pedido ${escapeHtml(nc.pedido)}` : fmtData(nc.data_ocorrencia);

    return `
      <article class="card" data-id="${nc.id}">
        <div class="card-hdr">
          <div>
            <div class="card-title">${titulo}</div>
            <div class="card-sub">${fmtData(nc.data_ocorrencia)}</div>
          </div>
          <div class="badges">
            <span class="badge ${impCls}">${escapeHtml(nc.impacto)}</span>
            <span class="badge ${stCls}">${escapeHtml(nc.status)}</span>
          </div>
        </div>
        <div class="card-body">${escapeHtml(nc.descricao)}</div>
        ${causa}
        ${acao}
        <div class="tags">${tagsSet}${tagsOri}</div>
        <div class="card-foot">
          ${metaStr}
          <div class="actions">
            <button class="btn-secondary" data-action="status" data-id="${nc.id}">Atualizar status</button>
            <button class="btn-secondary" data-action="delete" data-id="${nc.id}">Excluir</button>
          </div>
        </div>
      </article>
    `;
  }

  async function handleCardAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id, 10);

    if (action === 'delete') {
      if (!confirm('Excluir esta NC permanentemente?')) return;
      try {
        await api('ncs.php?id=' + id, { method: 'DELETE' });
        state.ncs = state.ncs.filter(n => n.id !== id);
        notify('NC excluída', true);
        renderHistorico();
      } catch (err) {
        notify(err.message, false);
      }
    } else if (action === 'status') {
      const opcoes = { '1': 'Aberta', '2': 'Em andamento', '3': 'Encerrada' };
      const escolha = prompt('Novo status:\n1 - Aberta\n2 - Em andamento\n3 - Encerrada\n\nDigite 1, 2 ou 3:');
      if (!opcoes[escolha]) return;
      try {
        await api('ncs.php?id=' + id, {
          method: 'PUT',
          body: { status: opcoes[escolha] },
        });
        const nc = state.ncs.find(n => n.id === id);
        if (nc) nc.status = opcoes[escolha];
        notify('Status atualizado', true);
        renderHistorico();
      } catch (err) {
        notify(err.message, false);
      }
    }
  }

  // ============================================================================
  // RENDER: PLANOS DE AÇÃO
  // ============================================================================

  function renderPlanos() {
    const lista = state.ncs.filter(n => n.status !== 'Encerrada');
    const el = $('#list-plan');
    if (!lista.length) {
      el.innerHTML = '<div class="empty">Nenhum plano de ação pendente.</div>';
      return;
    }
    el.innerHTML = lista.map(renderCard).join('');
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', handleCardAction);
    });
  }

  // ============================================================================
  // RENDER: KPIs
  // ============================================================================

  async function renderKpis() {
    let kpis;
    try {
      kpis = await api('kpis.php');
    } catch (err) {
      notify(err.message, false);
      return;
    }

    $('#k-total').textContent = kpis.total;
    $('#k-aber').textContent = kpis.abertas;
    $('#k-enc').textContent = kpis.encerradas;
    $('#k-tax').textContent = kpis.taxa_resolucao + '%';

    // Gráfico: NCs por origem
    const origens = Object.keys(kpis.origens || {});
    const valores = origens.map(o => kpis.origens[o]);
    desenharGrafico('c-ori', 'bar', origens, [{
      data: valores,
      backgroundColor: origens.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
      borderRadius: 4,
    }], {
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true, ticks: { stepSize: 1, color: '#888' }, grid: { color: 'rgba(0,0,0,0.05)' } },
        y: { ticks: { color: '#555' }, grid: { display: false } },
      },
    });

    // Ajusta altura dinamicamente
    const wrap = $('#c-ori').parentElement;
    wrap.style.height = Math.max(origens.length * 36 + 60, 120) + 'px';

    // Gráfico: Evolução
    const evo = (kpis.evolucao || []);
    const evoLabels = evo.map(r => fmtData(r.data_ocorrencia));
    const evoValues = evo.map(r => r.c);
    desenharGrafico('c-evo', 'line', evoLabels, [{
      data: evoValues,
      borderColor: '#C0392B',
      backgroundColor: 'rgba(192,57,43,0.08)',
      tension: 0.3,
      pointBackgroundColor: '#C0392B',
      fill: true,
    }], {
      scales: {
        x: { ticks: { color: '#888' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#888' } },
      },
    });

    // Gráfico: Distribuição por impacto
    const imp = kpis.impacto || {};
    desenharGrafico('c-imp', 'doughnut', ['Alto', 'Médio', 'Baixo'], [{
      data: [imp.Alto || 0, imp['Médio'] || 0, imp.Baixo || 0],
      backgroundColor: ['#C0392B', '#EF9F27', '#639922'],
      borderWidth: 0,
    }], { cutout: '65%' });

    $('#leg-imp').innerHTML = [
      ['Alto', '#C0392B', imp.Alto || 0],
      ['Médio', '#EF9F27', imp['Médio'] || 0],
      ['Baixo', '#639922', imp.Baixo || 0],
    ].map(([nome, cor, val]) =>
      `<span class="legend-item"><span class="legend-swatch" style="background:${cor}"></span>${nome}: <strong>${val}</strong></span>`
    ).join('');
  }

  function desenharGrafico(id, type, labels, datasets, opts) {
    if (state.charts[id]) state.charts[id].destroy();
    const ctx = document.getElementById(id);
    if (!ctx) return;
    state.charts[id] = new Chart(ctx, {
      type,
      data: { labels, datasets },
      options: Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }, opts || {}),
    });
  }

  // ============================================================================
  // RENDER: TREINAMENTOS
  // ============================================================================

  function renderTreinamentos() {
    const cnts = {};
    SETORES.forEach(s => { cnts[s.v] = 0; });
    state.ncs.forEach(nc => {
      const origs = Array.isArray(nc.origens) ? nc.origens : [];
      origs.forEach(o => { if (cnts[o] !== undefined) cnts[o]++; });
    });

    const sorted = Object.keys(cnts).filter(s => cnts[s] > 0).sort((a, b) => cnts[b] - cnts[a]);

    const el = $('#list-trei');
    if (!sorted.length) {
      el.innerHTML = '<div class="empty">Nenhuma NC registrada ainda.<br>Registre não conformidades para gerar sugestões.</div>';
      return;
    }

    el.innerHTML = sorted.map(setor => {
      const temas = (TEMAS_TREINAMENTO[setor] || []).slice(0, 4);
      return `
        <div class="trein-card">
          <div class="trein-setor">${escapeHtml(setor)}</div>
          <div class="trein-count">${cnts[setor]} NC${cnts[setor] > 1 ? 's' : ''} registrada${cnts[setor] > 1 ? 's' : ''} como origem</div>
          <div class="trein-temas">
            ${temas.map(t => `<div class="trein-tema">${escapeHtml(t)}</div>`).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================================================
  // SUBMIT DO FORMULÁRIO
  // ============================================================================

  async function handleSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      data_ocorrencia: form.elements['data_ocorrencia'].value,
      pedido: form.elements['pedido'].value.trim() || null,
      descricao: form.elements['descricao'].value.trim(),
      causa_raiz: form.elements['causa_raiz'].value.trim() || null,
      acao_imediata: form.elements['acao_imediata'].value.trim() || null,
      responsavel: form.elements['responsavel'].value.trim() || null,
      prazo: form.elements['prazo'].value || null,
      status: form.elements['status'].value,
      impacto: state.selImpacto || 'Médio',
      setores: state.selSetores.slice(),
      origens: state.selOrigens.slice(),
    };

    if (!data.data_ocorrencia || !data.descricao) {
      notify('Preencha data e descrição', false);
      return;
    }

    const btn = $('#btn-save');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    try {
      await api('ncs.php', { method: 'POST', body: data });
      notify('NC registrada com sucesso', true);
      resetarFormulario();
      await carregarNCs();
      trocarAba('his');
    } catch (err) {
      notify(err.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Salvar não conformidade';
    }
  }

  function resetarFormulario() {
    $('#nc-form').reset();
    $('#f-data').value = new Date().toISOString().split('T')[0];
    state.selSetores = [];
    state.selOrigens = [];
    state.selImpacto = null;
    $$('.chip.on').forEach(c => c.classList.remove('on'));
  }

  // ============================================================================
  // INICIALIZAÇÃO
  // ============================================================================

  async function init() {
    try {
      await carregarSessao();
    } catch (err) {
      window.location.href = 'login.html';
      return;
    }

    montarChips('g-set', SETORES, 'setor');
    montarChips('g-ori', SETORES.map(s => s.v), 'origem');
    montarChipsImpacto();

    $('#g-set').addEventListener('click', handleChipClick);
    $('#g-ori').addEventListener('click', handleChipClick);
    $('#g-imp').addEventListener('click', handleChipClick);

    $$('.tab').forEach(t => {
      t.addEventListener('click', () => trocarAba(t.dataset.panel));
    });

    $('#fc-his').addEventListener('click', e => {
      const b = e.target.closest('.fchip');
      if (!b) return;
      $$('#fc-his .fchip').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.filtroAtual = b.dataset.f;
      renderHistorico();
    });

    $('#nc-form').addEventListener('submit', handleSubmit);

    $('#btn-logout').addEventListener('click', async () => {
      try {
        await api('auth.php', { method: 'DELETE' });
      } catch (e) { /* ignora */ }
      window.location.href = 'login.html';
    });

    $('#f-data').value = new Date().toISOString().split('T')[0];

    await carregarNCs();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
