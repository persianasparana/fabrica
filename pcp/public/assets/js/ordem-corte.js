/**
 * Ordem de Corte — página imprimível por pedido.
 * Uso: ordem-corte.html?pedido=6715
 * Carrega o pedido + estrutura, calcula materiais (ordem-corte-calc.js) e
 * renderiza um documento pronto para impressão (A4).
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function num(v, casas) {
    return Number(v).toLocaleString('pt-BR', {
      minimumFractionDigits: casas != null ? casas : 2,
      maximumFractionDigits: casas != null ? casas : 2,
    });
  }
  function medida(v) {
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  function fmtData(s) {
    if (!s) return '—';
    const [a, m, d] = s.split('-');
    return `${d}/${m}/${a}`;
  }

  async function api(path) {
    const res = await fetch('../api/' + path, { credentials: 'same-origin' });
    if (res.status === 401) {
      window.location.href = 'login.html';
      throw new Error('Não autenticado');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  function ambienteDe(item) {
    // convenção das importações: "Cor 34 | Ambiente | 0,985 x 2,37 m | peça i/n"
    const partes = String(item.observacoes || '').split('|').map((s) => s.trim());
    return partes.length >= 2 ? partes.slice(0, 2).join(' · ') : (item.observacoes || '');
  }

  function renderPlano(corte) {
    if (!corte.plano) return '';
    const p = corte.plano;
    const linhas = p.barras.map((b, i) => `
      <div class="barra-linha">
        <span class="barra-num">Barra ${i + 1}</span>
        <span class="barra-cortes">${b.cortes.map((c) => num(c.comprimento)).join('  |  ')}</span>
        <span class="barra-sobra">sobra ${num(b.sobra)} m</span>
      </div>`).join('');
    const invalidos = p.cortesInvalidos.length
      ? `<div class="alerta">⚠ ${p.cortesInvalidos.length} corte(s) maior(es) que a barra de ${num(p.comprimentoBarra)} m: ${p.cortesInvalidos.map((c) => num(c.comprimento) + ' m').join(', ')} — tratar à parte (emenda/encomenda).</div>`
      : '';
    return `
      <div class="quebra">
        <h3>${esc(corte.nome)} — plano das barras de ${num(p.comprimentoBarra)} m</h3>
        <div class="aproveitamento">
          <span class="badge-barras">${p.numBarras} barra(s)</span>
          &nbsp;corte total ${num(p.totalCorte)} m · comprado ${num(p.totalComprado)} m ·
          sobra ${num(p.sobraTotal)} m · aproveitamento ${num(p.aproveitamento * 100, 1)}%
        </div>
        ${linhas}
        ${invalidos}
      </div>`;
  }

  function render(pedido, dados, calcRes) {
    const emitida = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const itens = dados.itens;
    const dataCliente = itens[0] ? itens[0].data_cliente : null;
    const totalPecas = itens.reduce((a, i) => a + (Number(i.qnt) || 1), 0);
    const especiais = itens.filter((i) => i.especial).length;

    const grupos = calcRes.grupos.map((g) => {
      const resumo = `
        <table class="quebra">
          <thead><tr>
            <th>Material (corte)</th><th>Fórmula</th><th class="num">Nº cortes</th>
            <th class="num">Total (m)</th><th class="num">Barras</th><th class="num">Sobra (m)</th>
          </tr></thead>
          <tbody>
            ${g.cortes.map((c) => `
              <tr>
                <td class="destaque">${esc(c.nome)}</td>
                <td>${esc(c.formula)} <span style="color:#999">[${esc(c.dim)}]</span></td>
                <td class="num">${c.numCortes.toLocaleString('pt-BR')}</td>
                <td class="num destaque">${num(c.totalMetros)}</td>
                <td class="num">${c.plano ? `<span class="badge-barras">${c.plano.numBarras} × ${num(c.barra)} m</span>` : '—'}</td>
                <td class="num">${c.plano ? num(c.plano.sobraTotal) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;

      const componentes = g.componentes.length ? `
        <h3>Componentes (separação de estoque)</h3>
        <table class="quebra">
          <thead><tr><th>Componente</th><th class="num">Quantidade total</th><th>Obs</th></tr></thead>
          <tbody>
            ${g.componentes.map((c) => `
              <tr>
                <td>${esc(c.nome)}</td>
                <td class="num destaque">${Number.isInteger(c.total) ? c.total.toLocaleString('pt-BR') : num(c.total, 1)}</td>
                <td>${esc(c.obs)}</td>
              </tr>`).join('')}
          </tbody>
        </table>` : '';

      return `
        <h2>${esc(g.produto.nome)} — ${g.numPecas} peça(s) <span style="float:right;font-size:10px;color:#888">medidas em ${g.produto.unidade === 'm' ? 'metros' : 'centímetros'}</span></h2>
        ${resumo}
        ${g.cortes.map(renderPlano).join('')}
        ${componentes}`;
    }).join('');

    const avisos = [];
    if (calcRes.semMedida.length)
      avisos.push(`⚠ ${calcRes.semMedida.length} item(ns) sem largura/altura — não entraram no cálculo. Informe as medidas no detalhe do item (Fila → Ver).`);
    if (calcRes.semEstrutura.length)
      avisos.push(`⚠ ${calcRes.semEstrutura.length} item(ns) sem produto da Estrutura vinculado — não entraram no cálculo.`);

    const listaPecas = `
      <h2>Peças do pedido</h2>
      <table>
        <thead><tr><th style="width:34px">#</th><th>Medida (L × A)</th><th>Identificação</th><th style="width:120px">Etiqueta</th></tr></thead>
        <tbody>
          ${itens.map((i, ix) => `
            <tr>
              <td>${ix + 1}</td>
              <td class="destaque">${i.largura != null && i.altura != null ? `${medida(i.largura)} × ${medida(i.altura)}` : '<span style="color:#C1212D">sem medida</span>'}</td>
              <td>${esc(ambienteDe(i))}${i.especial ? ' <b style="color:#C1212D">★ ESPECIAL</b>' : ''}</td>
              <td>${esc((i.pecas && i.pecas[0] && i.pecas[0].cod_barras) || '—')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;

    $('#conteudo').innerHTML = `
      <div class="doc-header">
        <img src="assets/brand/logos/logo-preto.png" alt="Persianas Paraná">
        <div class="titulo">
          <h1>ORDEM DE CORTE — PEDIDO ${esc(pedido)}</h1>
          <div class="sub">Emitida em ${emitida}</div>
        </div>
      </div>
      <div class="meta">
        <div><b>Pedido</b><span>${esc(pedido)}</span></div>
        <div><b>Peças</b><span>${totalPecas}</span></div>
        <div><b>Data do cliente</b><span>${fmtData(dataCliente)}</span></div>
        ${especiais ? `<div><b>Especiais</b><span style="color:#C1212D">★ ${especiais}</span></div>` : ''}
      </div>
      ${avisos.map((a) => `<div class="alerta">${a}</div>`).join('')}
      ${grupos || '<div class="alerta">Nenhum item com medidas e produto da Estrutura — nada a calcular.</div>'}
      ${listaPecas}
      <div class="rodape">
        <span>PCP — Persianas Paraná · Ordem de corte gerada automaticamente a partir da Estrutura do Produto</span>
        <span>Pedido ${esc(pedido)}</span>
      </div>`;

    document.title = `Ordem de Corte — Pedido ${pedido}`;
  }

  (async () => {
    const pedido = new URLSearchParams(window.location.search).get('pedido');
    if (!pedido) {
      $('#conteudo').innerHTML = '<div class="alerta">Informe o pedido na URL: <code>ordem-corte.html?pedido=6715</code></div>';
      return;
    }
    try {
      await api('auth/session');
      const [dados, estrutura] = await Promise.all([
        api('pcp/pedido?pedido=' + encodeURIComponent(pedido)),
        api('pcp/estrutura'),
      ]);
      const porId = new Map((estrutura.data || []).map((p) => [Number(p.id), p]));
      const calcRes = OrdemCorteCalc.calcularOrdemCorte(dados.itens || [], porId);
      render(pedido, dados, calcRes);
    } catch (e) {
      if (e.message !== 'Não autenticado')
        $('#conteudo').innerHTML = `<div class="alerta">Erro: ${esc(e.message)}</div>`;
    }
  })();
})();
