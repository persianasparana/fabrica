/**
 * Plano de Corte via NÚCLEO DE PRODUTOS — página imprimível por pedido.
 * Uso: plano-corte-nucleo.html?pedido=PED-2026/0002
 *
 * Réplica do documento de PLANEJAMENTO DE CORTE do motor do cliente: por
 * ambiente e por peça, a tabela Componente × Corte (cm) × Base, com a
 * variante resolvida pelo Núcleo (:3070). O operador pode trocar a variante
 * de uma peça (seletor de tela, some na impressão) — o override re-consulta
 * o Núcleo e re-renderiza.
 *
 * 09/08/2026 — este é O documento de corte (OC local aposentada): o botão
 * "Imprimir e registrar" grava no log de impressão (pcp_ordem_corte_log,
 * modo 'nucleo') e a página avisa quando o pedido já foi impresso.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  let csrfToken = '';
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
    if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Não autenticado'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  const estado = { pedido: '', overrides: {}, dados: null, status: null };

  // v09/08 — documento ÚNICO de corte (OC local aposentada): imprimir passa a
  // registrar no mesmo log de impressão de antes (controle de reimpressão).
  async function imprimirERegistrar() {
    try {
      const r = await api('pcp/ordem-corte/registrar', { method: 'POST', body: { pedidos: [estado.pedido] } });
      estado.status = { impresso: true, reimpressao: r.reimpressao };
    } catch (e) {
      // registro falhou → imprime mesmo assim, mas avisa (fail-soft)
      alert('Não consegui registrar a impressão (' + e.message + ') — o plano será impresso sem registro.');
    }
    window.print();
    render();
  }
  window.__imprimirPlano = imprimirERegistrar;

  function fmtCm(v) {
    if (v == null || !(Number(v) > 0)) return '—';
    return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  }

  // <select> de variante da peça (agrupado por grupo do Núcleo) — só de tela
  function seletorVariante(p) {
    const grupos = new Map();
    for (const v of (estado.dados.variantes || [])) {
      const g = v.grupo || 'Outros';
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(v);
    }
    if (!grupos.size) return '';
    const opts = [...grupos.entries()].map(([g, vs]) =>
      `<optgroup label="${esc(g)}">${vs.map((v) =>
        `<option value="${esc(v.id)}" ${String(p.variante) === String(v.id) ? 'selected' : ''}>${esc(v.nome)}</option>`
      ).join('')}</optgroup>`).join('');
    return `<span class="no-print" style="margin-left:8px">variante:
      <select class="variante" onchange="window.__trocarVariante(${p.peca_id}, this.value)">${opts}</select></span>`;
  }

  function linhaPlano(l) {
    const corte = l.medida != null ? Number(l.medida).toFixed(1).replace('.', ',') : '—';
    const base = l.medida != null
      ? `${l.base}${Number(l.delta) >= 0 ? '+' : ''}${l.delta}`
      : esc(l.formula || '');
    return `<tr><td>${esc(l.comp)}</td><td class="n">${corte}</td><td>${base}</td></tr>`;
  }

  function blocoPeca(p) {
    const cab = `<div class="peca-head">
      <b>${esc(p.produto_nome || p.produto || 'Peça')}</b>
      ${p.colecao ? ` · ${esc(p.colecao)}` : ''}
      · peça ${fmtCm(p.largura_cm)}×${fmtCm(p.altura_cm)} cm
      · nº ${esc(p.numero)}
      ${p.plano ? ` · <i>${esc(p.plano.nome)}</i>` : ''}
      ${p.modo === 'motor' ? ' · ⚙ motorizada' : ''}
      ${p.cod_barras ? ` <span class="cod">${esc(p.cod_barras)}</span>` : ''}
      ${seletorVariante(p)}
    </div>`;
    if (!p.plano) {
      const motivo = p.aviso ? ` <span style="color:var(--text3)">(${esc(p.aviso)})</span>` : '';
      return `${cab}<div class="sem-plano">Sem plano de corte cadastrado para esta variante.${motivo}</div>`;
    }
    return `${cab}
      <table>
        <thead><tr><th>Componente</th><th class="n" style="width:110px">Corte (cm)</th><th style="width:160px">Base</th></tr></thead>
        <tbody>${(p.plano.linhas || []).map(linhaPlano).join('')}</tbody>
      </table>`;
  }

  function render() {
    const d = estado.dados;
    const data = new Date().toLocaleDateString('pt-BR');
    const st = estado.status;
    const bannerImpresso = st && st.impresso
      ? `<div class="alerta no-print" style="border-color:#FFA000">⚠ Este pedido JÁ TEVE plano de corte impresso${st.vezes ? ` (${st.vezes}×)` : ''}${st.ultima ? ` · última: ${esc(st.ultima)}` : ''} — imprimir de novo será registrado como REIMPRESSÃO.</div>`
      : '';
    $('#conteudo').innerHTML = `
      ${bannerImpresso}
      <h1>Plano de corte (PCP) — ${esc(d.pedido)} — ${data}</h1>
      <div style="font-size:12px;color:#555">Medidas de corte em CENTÍMETROS. Corte = medida da peça + desconto/acréscimo do plano da variante. Padrão dos cortes: módulo Produtos &amp; Precificação → aba Corte (PCP).</div>
      ${(d.avisos || []).map((a) => `<div class="alerta">⚠ ${esc(a)}</div>`).join('')}
      ${(d.ambientes || []).map((amb) => `
        <h2>${esc(amb.ambiente)}</h2>
        ${(amb.pecas || []).map(blocoPeca).join('')}
      `).join('') || '<div class="alerta">Pedido sem peças.</div>'}
      <div style="margin-top:22px;padding-top:8px;border-top:1px solid var(--border);font-size:10px;color:#888;display:flex;justify-content:space-between">
        <span>PCP — Persianas Paraná · Plano de corte gerado pelo Núcleo de Produtos</span>
        <span>${esc(d.pedido)}</span>
      </div>`;
    document.title = `Plano de Corte — ${d.pedido}`;
  }

  window.__trocarVariante = async (pecaId, variante) => {
    estado.overrides[pecaId] = variante;
    try {
      estado.dados = await api('pcp/ordem-corte/plano-nucleo', {
        method: 'POST',
        body: { pedido: estado.pedido, overrides: estado.overrides },
      });
      render();
    } catch (e) {
      alert('Erro ao recalcular: ' + e.message);
    }
  };

  (async () => {
    const pedido = new URLSearchParams(window.location.search).get('pedido');
    if (!pedido) {
      $('#conteudo').innerHTML = '<div class="alerta">Informe o pedido na URL: <code>plano-corte-nucleo.html?pedido=PED-2026/0002</code></div>';
      return;
    }
    estado.pedido = pedido;
    try {
      const sess = await api('auth/session');
      csrfToken = sess.csrf_token;
      // status de impressão em paralelo (fail-soft: sem status, sem banner)
      const [dados, status] = await Promise.all([
        api('pcp/ordem-corte/plano-nucleo?pedido=' + encodeURIComponent(pedido)),
        api('pcp/ordem-corte/status?pedidos=' + encodeURIComponent(pedido)).catch(() => null),
      ]);
      estado.dados = dados;
      estado.status = status && status.data ? status.data[pedido] || null : null;
      render();
    } catch (e) {
      if (e.message !== 'Não autenticado')
        $('#conteudo').innerHTML = `<div class="alerta">Erro: ${esc(e.message)}</div>`;
    }
  })();
})();
