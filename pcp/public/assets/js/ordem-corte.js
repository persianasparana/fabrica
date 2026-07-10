/**
 * Ordem de Corte — página imprimível por pedido.
 * Uso: ordem-corte.html?pedido=6715
 * Carrega o pedido + estrutura, calcula materiais (ordem-corte-calc.js) e
 * renderiza um documento pronto para impressão (A4), com:
 *   - resumo de materiais por produto;
 *   - plano das barras em DESENHO (proporcional) e/ou TEXTO;
 *   - resumo de compra (barras a comprar por material);
 *   - lista de peças + exportação CSV.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  // Estado da página (permite recálculo ao vivo ao trocar o comprimento da barra).
  const estado = { pedido: null, dados: null, porId: null, barra: null, modo: 'desenho' };

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

  // ── Plano em TEXTO (uma linha por barra) ────────────────────────────────────
  function renderPlanoTexto(p) {
    const linhas = p.barras.map((b, i) => `
      <div class="barra-linha">
        <span class="barra-num">Barra ${i + 1}</span>
        <span class="barra-cortes">${b.resumo.map((g) => (g.qtd > 1 ? `${g.qtd}× ` : '') + num(g.comprimento)).join('  |  ')}</span>
        <span class="barra-sobra">sobra ${num(b.sobra)} m</span>
      </div>`).join('');
    return `<div class="plano-texto">${linhas}</div>`;
  }

  // ── Plano em DESENHO (barras proporcionais, uma por padrão) ──────────────────
  function renderPlanoDesenho(p) {
    const barra = p.comprimentoBarra;
    const blocos = p.padroes.map((pad) => {
      // expande os grupos em segmentos individuais (mantém a ordem decrescente do FFD)
      const segs = [];
      for (const g of pad.layout) {
        for (let k = 0; k < g.qtd; k++) {
          const pct = Math.max(0, (g.comprimento / barra) * 100);
          const rot = g.rotulos && g.rotulos.length ? ` — ${g.rotulos.join(', ')}` : '';
          segs.push(`<div class="seg" style="width:${pct.toFixed(4)}%" title="${esc(num(g.comprimento))} m${esc(rot)}"><span>${num(g.comprimento)}</span></div>`);
        }
      }
      const sobraPct = Math.max(0, (pad.sobra / barra) * 100);
      const sobraSeg = pad.sobra > 0.0005
        ? `<div class="barra-viz__sobra" style="width:${sobraPct.toFixed(4)}%" title="sobra ${esc(num(pad.sobra))} m"><span>sobra ${num(pad.sobra)}</span></div>`
        : '';
      const aprov = barra ? (pad.usado / barra) * 100 : 0;
      const rotulo = pad.vezes > 1 ? `${pad.vezes}× barras iguais` : '1 barra';
      return `
        <div class="barra-viz quebra">
          <div class="barra-viz__cab">
            <span class="barra-viz__tag">${rotulo}</span>
            <span>usa ${num(pad.usado)} m · sobra ${num(pad.sobra)} m · aproveita ${num(aprov, 1)}%</span>
          </div>
          <div class="barra-viz__track">${segs.join('')}${sobraSeg}</div>
        </div>`;
    }).join('');
    return `<div class="plano-desenho">${blocos}</div>`;
  }

  function renderPlano(corte) {
    if (!corte.plano) return '';
    const p = corte.plano;
    const invalidos = p.cortesInvalidos.length
      ? `<div class="alerta">⚠ ${p.cortesInvalidos.length} corte(s) maior(es) que a barra de ${num(p.comprimentoBarra)} m: ${p.cortesInvalidos.map((c) => num(c.comprimento) + ' m').join(', ')} — tratar à parte (emenda/encomenda).</div>`
      : '';
    return `
      <div class="quebra plano">
        <h3>${esc(corte.nome)} — plano das barras de ${num(p.comprimentoBarra)} m</h3>
        <div class="aproveitamento">
          <span class="badge-barras">${p.numBarras} barra(s)</span>
          &nbsp;corte total ${num(p.totalCorte)} m · comprado ${num(p.totalComprado)} m ·
          sobra ${num(p.sobraTotal)} m · aproveitamento ${num(p.aproveitamento * 100, 1)}%
        </div>
        ${renderPlanoDesenho(p)}
        ${renderPlanoTexto(p)}
        ${invalidos}
      </div>`;
  }

  // ── Resumo de compra (barras por material, somando todos os produtos) ────────
  function renderCompras(compras) {
    if (!compras.linhas.length) return '';
    return `
      <h2>Resumo de compra — barras por material</h2>
      <table class="quebra">
        <thead><tr>
          <th>Material</th><th class="num">Barra (m)</th><th class="num">Nº barras</th>
          <th class="num">Corte (m)</th><th class="num">Comprado (m)</th>
          <th class="num">Sobra (m)</th><th class="num">Aproveit.</th>
        </tr></thead>
        <tbody>
          ${compras.linhas.map((l) => `
            <tr>
              <td class="destaque">${esc(l.nome)}</td>
              <td class="num">${num(l.barra)}</td>
              <td class="num destaque">${l.numBarras.toLocaleString('pt-BR')}</td>
              <td class="num">${num(l.totalCorte)}</td>
              <td class="num">${num(l.totalComprado)}</td>
              <td class="num">${num(l.sobraTotal)}</td>
              <td class="num">${num(l.aproveitamento * 100, 1)}%</td>
            </tr>`).join('')}
        </tbody>
        <tfoot><tr>
          <td class="destaque">Total</td><td></td>
          <td class="num destaque">${compras.totalBarras.toLocaleString('pt-BR')}</td>
          <td colspan="4"></td>
        </tr></tfoot>
      </table>`;
  }

  function render() {
    const { pedido, dados } = estado;
    const calcRes = OrdemCorteCalc.calcularOrdemCorte(dados.itens || [], estado.porId, { barraPadrao: estado.barra });
    const compras = OrdemCorteCalc.resumoCompras(calcRes);
    estado.calcRes = calcRes;
    estado.compras = compras;

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
                <td class="num">${c.plano ? `<span class="badge-barras">${c.plano.numBarras} × ${num(c.plano.comprimentoBarra)} m</span>` : '—'}</td>
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
          <div class="sub">Emitida em ${emitida} · barras de ${num(estado.barra)} m</div>
        </div>
      </div>
      <div class="meta">
        <div><b>Pedido</b><span>${esc(pedido)}</span></div>
        <div><b>Peças</b><span>${totalPecas}</span></div>
        <div><b>Data do cliente</b><span>${fmtData(dataCliente)}</span></div>
        ${especiais ? `<div><b>Especiais</b><span style="color:#C1212D">★ ${especiais}</span></div>` : ''}
      </div>
      ${avisos.map((a) => `<div class="alerta">${a}</div>`).join('')}
      ${renderCompras(compras)}
      ${grupos || '<div class="alerta">Nenhum item com medidas e produto da Estrutura — nada a calcular.</div>'}
      ${listaPecas}
      <div class="rodape">
        <span>PCP — Persianas Paraná · Ordem de corte gerada automaticamente a partir da Estrutura do Produto</span>
        <span>Pedido ${esc(pedido)}</span>
      </div>`;

    document.body.dataset.modo = estado.modo;
    document.title = `Ordem de Corte — Pedido ${pedido}`;
  }

  // ── Exportação CSV (resumo de compra + cortes por material) ──────────────────
  function exportarCSV() {
    if (!estado.calcRes) return;
    const sep = ';';
    const linha = (arr) => arr.map((v) => {
      const s = String(v == null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(sep);
    const n = (v, c) => num(v, c).replace(/\./g, '');   // sem separador de milhar para o CSV

    const out = [];
    out.push(linha([`Ordem de Corte — Pedido ${estado.pedido}`]));
    out.push(linha([`Barra padrão (m)`, n(estado.barra)]));
    out.push([]);
    out.push(linha(['RESUMO DE COMPRA']));
    out.push(linha(['Material', 'Barra (m)', 'Nº barras', 'Corte (m)', 'Comprado (m)', 'Sobra (m)', 'Aproveitamento (%)']));
    for (const l of estado.compras.linhas)
      out.push(linha([l.nome, n(l.barra), l.numBarras, n(l.totalCorte), n(l.totalComprado), n(l.sobraTotal), n(l.aproveitamento * 100, 1)]));
    out.push(linha(['Total', '', estado.compras.totalBarras]));
    out.push([]);
    out.push(linha(['CORTES POR MATERIAL']));
    out.push(linha(['Produto', 'Material', 'Fórmula', 'Nº cortes', 'Total (m)', 'Barras', 'Sobra (m)']));
    for (const g of estado.calcRes.grupos)
      for (const c of g.cortes)
        out.push(linha([g.produto.nome, c.nome, c.formula, c.numCortes, n(c.totalMetros),
          c.plano ? c.plano.numBarras : '', c.plano ? n(c.plano.sobraTotal) : '']));

    const csv = '﻿' + out.join('\n');   // BOM p/ Excel abrir com acento certo
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ordem-corte-${estado.pedido}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function ligarControles() {
    const inBarra = $('#barra');
    const selModo = $('#modo');
    if (inBarra) {
      inBarra.value = num(estado.barra).replace(/\./g, '');   // ex.: "4,90"
      inBarra.addEventListener('change', () => {
        const v = parseFloat(String(inBarra.value).replace(',', '.'));
        if (v > 0) { estado.barra = v; render(); }
        else inBarra.value = num(estado.barra).replace(/\./g, '');
      });
    }
    if (selModo) {
      selModo.value = estado.modo;
      selModo.addEventListener('change', () => { estado.modo = selModo.value; document.body.dataset.modo = estado.modo; });
    }
    const btnCsv = $('#exportar');
    if (btnCsv) btnCsv.addEventListener('click', exportarCSV);
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
      estado.pedido = pedido;
      estado.dados = dados;
      estado.porId = porId;
      estado.barra = OrdemCorteCalc.barraPadraoSugerida(porId);
      ligarControles();
      render();
    } catch (e) {
      if (e.message !== 'Não autenticado')
        $('#conteudo').innerHTML = `<div class="alerta">Erro: ${esc(e.message)}</div>`;
    }
  })();
})();
