/**
 * Plano de corte de barras — otimização + desenho, sem framework e sem CDN.
 *
 * Recebe as LINHAS da Ordem de Corte (a mesma resposta de /pcp/ordem-corte/preview:
 * { corte, valor, unidade, qtd, barra, pedido, peca_numero }) e, para os cortes que
 * têm "barra" (metragem da barra em metros) definida na Estrutura, distribui os
 * comprimentos em barras (First-Fit Decreasing) e devolve HTML de desenho + resumo
 * de compra + CSV. Usado na pré-visualização (tela) e no documento de impressão.
 */
(function (root) {
  'use strict';

  const num = (v, casas) => Number(v).toLocaleString('pt-BR', {
    minimumFractionDigits: casas != null ? casas : 2,
    maximumFractionDigits: casas != null ? casas : 2,
  });
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function metros(v, unidade) {
    const u = String(unidade || 'cm').toLowerCase();
    if (u === 'm') return v;
    if (u === 'mm') return v / 1000;
    return v / 100; // cm (padrão)
  }

  // ── Agrupa cortes idênticos (mesmo comprimento, arredondado a mm) ──
  function agruparCortes(cortes) {
    const m = new Map();
    for (const c of cortes) {
      const chave = c.comprimento.toFixed(3);
      if (!m.has(chave)) m.set(chave, { comprimento: c.comprimento, qtd: 0, rotulos: [] });
      const g = m.get(chave);
      g.qtd += 1;
      if (c.rotulo && g.rotulos.indexOf(c.rotulo) === -1) g.rotulos.push(c.rotulo);
    }
    return [...m.values()].sort((a, b) => b.comprimento - a.comprimento);
  }

  // ── Otimização de barras (First-Fit Decreasing) ──
  function planejarBarras(cortes, comprimentoBarra) {
    const EPS = 1e-9;
    const invalidos = cortes.filter((c) => c.comprimento > comprimentoBarra + EPS);
    const validos = cortes
      .filter((c) => c.comprimento <= comprimentoBarra + EPS)
      .slice().sort((a, b) => b.comprimento - a.comprimento);

    const barras = [];
    for (const c of validos) {
      let alvo = null;
      for (const b of barras) if (b.restante + EPS >= c.comprimento) { alvo = b; break; }
      if (!alvo) { alvo = { cortes: [], restante: comprimentoBarra }; barras.push(alvo); }
      alvo.cortes.push(c);
      alvo.restante -= c.comprimento;
    }
    const barrasOut = barras.map((b) => ({
      resumo: agruparCortes(b.cortes),
      usado: Math.max(0, comprimentoBarra - b.restante),
      sobra: Math.max(0, b.restante),
    }));
    const padMap = new Map();
    for (const b of barrasOut) {
      const assin = b.resumo.map((g) => `${g.comprimento.toFixed(3)}x${g.qtd}`).join('|');
      if (!padMap.has(assin)) padMap.set(assin, { layout: b.resumo, usado: b.usado, sobra: b.sobra, vezes: 0 });
      padMap.get(assin).vezes += 1;
    }
    const padroes = [...padMap.values()].sort((a, b) => b.vezes - a.vezes || b.usado - a.usado);
    const totalCorte = validos.reduce((a, c) => a + c.comprimento, 0);
    return {
      comprimentoBarra, padroes,
      numBarras: barras.length,
      totalCorte,
      totalComprado: barras.length * comprimentoBarra,
      sobraTotal: Math.max(0, barras.length * comprimentoBarra - totalCorte),
      aproveitamento: barras.length ? totalCorte / (barras.length * comprimentoBarra) : 0,
      cortesInvalidos: invalidos,
    };
  }

  // ── Monta os planos a partir das linhas de um setor ──
  // opts.barraOverride: se > 0, sobrepõe a metragem de barra de todos os cortes.
  function planoDeLinhas(linhas, opts) {
    opts = opts || {};
    const over = opts.barraOverride > 0 ? Number(opts.barraOverride) : null;
    const grupos = new Map();
    for (const l of (linhas || [])) {
      const barraCfg = l.barra > 0 ? Number(l.barra) : null;
      const barra = over || barraCfg;
      if (!barra) continue;                         // sem barra → não é material de barra
      const valor = Number(l.valor);
      if (!(valor > 0)) continue;
      const comp = metros(valor, l.unidade);
      if (!(comp > 0)) continue;
      const key = l.corte;
      if (!grupos.has(key)) grupos.set(key, { corte: l.corte, barra, cortes: [] });
      const g = grupos.get(key);
      g.barra = barra;
      const qtd = Math.max(1, Math.round(Number(l.qtd) || 1));
      const rot = (l.pedido != null ? '#' + l.pedido : '') + (l.peca_numero != null ? '·p' + l.peca_numero : '');
      for (let k = 0; k < qtd; k++) g.cortes.push({ comprimento: comp, rotulo: rot });
    }
    const out = [];
    for (const g of grupos.values()) out.push({ corte: g.corte, barra: g.barra, plano: planejarBarras(g.cortes, g.barra) });
    out.sort((a, b) => b.plano.numBarras - a.plano.numBarras || a.corte.localeCompare(b.corte));
    return out;
  }

  // ── Desenho (HTML) de um conjunto de planos (de um setor) ──
  function desenhoHTML(planos) {
    if (!planos || !planos.length) return '';
    const blocos = planos.map((pl) => {
      const p = pl.plano;
      const barra = p.comprimentoBarra;
      const barrasViz = p.padroes.map((pad) => {
        const segs = [];
        for (const g of pad.layout) {
          for (let k = 0; k < g.qtd; k++) {
            const pct = Math.max(0, (g.comprimento / barra) * 100);
            segs.push(`<div class="ocp-seg" style="width:${pct.toFixed(4)}%" title="${esc(num(g.comprimento))} m"><span>${num(g.comprimento)}</span></div>`);
          }
        }
        const sobraPct = Math.max(0, (pad.sobra / barra) * 100);
        const sobraSeg = pad.sobra > 0.0005
          ? `<div class="ocp-sobra" style="width:${sobraPct.toFixed(4)}%"><span>sobra ${num(pad.sobra)}</span></div>` : '';
        const rotulo = pad.vezes > 1 ? `${pad.vezes}× barras iguais` : '1 barra';
        const aprov = barra ? (pad.usado / barra) * 100 : 0;
        return `<div class="ocp-barra">
          <div class="ocp-barra-cab"><span class="ocp-tag">${rotulo}</span><span>usa ${num(pad.usado)} m · sobra ${num(pad.sobra)} m · ${num(aprov, 1)}%</span></div>
          <div class="ocp-track">${segs.join('')}${sobraSeg}</div>
        </div>`;
      }).join('');
      const inval = p.cortesInvalidos.length
        ? `<div class="ocp-aviso">⚠ ${p.cortesInvalidos.length} corte(s) maior(es) que a barra de ${num(barra)} m — tratar à parte.</div>` : '';
      return `<div class="ocp-corte">
        <div class="ocp-corte-tit">${esc(pl.corte)} — barras de ${num(barra)} m
          <span class="ocp-corte-res">${p.numBarras} barra(s) · sobra ${num(p.sobraTotal)} m · aproveitamento ${num(p.aproveitamento * 100, 1)}%</span>
        </div>
        ${barrasViz}${inval}
      </div>`;
    }).join('');
    return `<div class="ocp-plano"><div class="ocp-plano-tit">✂ Plano de corte das barras</div>${blocos}</div>`;
  }

  // ── Resumo de compra: barras por material (soma vários setores) ──
  function consolidarCompras(planosFlat) {
    const m = new Map();
    for (const pl of planosFlat) {
      const p = pl.plano;
      if (!p.numBarras) continue;
      const chave = `${pl.corte}@@${p.comprimentoBarra}`;
      if (!m.has(chave)) m.set(chave, { corte: pl.corte, barra: p.comprimentoBarra, numBarras: 0, totalCorte: 0, totalComprado: 0, sobraTotal: 0 });
      const r = m.get(chave);
      r.numBarras += p.numBarras; r.totalCorte += p.totalCorte;
      r.totalComprado += p.totalComprado; r.sobraTotal += p.sobraTotal;
    }
    const linhas = [...m.values()]
      .map((r) => Object.assign(r, { aproveitamento: r.totalComprado ? r.totalCorte / r.totalComprado : 0 }))
      .sort((a, b) => b.numBarras - a.numBarras || a.corte.localeCompare(b.corte));
    return { linhas, totalBarras: linhas.reduce((a, r) => a + r.numBarras, 0) };
  }

  function resumoComprasHTML(planosFlat) {
    const c = consolidarCompras(planosFlat);
    if (!c.linhas.length) return '';
    return `<div class="ocp-compras">
      <div class="ocp-plano-tit">🛒 Resumo de compra — barras por material</div>
      <table class="ocp-tabela">
        <thead><tr><th>Material</th><th class="n">Barra (m)</th><th class="n">Nº barras</th><th class="n">Corte (m)</th><th class="n">Comprado (m)</th><th class="n">Sobra (m)</th><th class="n">Aproveit.</th></tr></thead>
        <tbody>${c.linhas.map((l) => `<tr>
          <td><b>${esc(l.corte)}</b></td><td class="n">${num(l.barra)}</td><td class="n"><b>${l.numBarras}</b></td>
          <td class="n">${num(l.totalCorte)}</td><td class="n">${num(l.totalComprado)}</td><td class="n">${num(l.sobraTotal)}</td><td class="n">${num(l.aproveitamento * 100, 1)}%</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Total</b></td><td></td><td class="n"><b>${c.totalBarras}</b></td><td colspan="4"></td></tr></tfoot>
      </table>
    </div>`;
  }

  // ── CSV do resumo de compra ──
  function csvCompras(planosFlat, pedidos) {
    const c = consolidarCompras(planosFlat);
    const sep = ';';
    const n = (v, casas) => num(v, casas).replace(/\./g, '');
    const linha = (arr) => arr.map((v) => {
      const s = String(v == null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(sep);
    const out = [];
    out.push(linha(['Ordem de Corte — resumo de compra', (pedidos || []).join(' ')]));
    out.push(linha(['Material', 'Barra (m)', 'Nº barras', 'Corte (m)', 'Comprado (m)', 'Sobra (m)', 'Aproveitamento (%)']));
    for (const l of c.linhas) out.push(linha([l.corte, n(l.barra), l.numBarras, n(l.totalCorte), n(l.totalComprado), n(l.sobraTotal), n(l.aproveitamento * 100, 1)]));
    out.push(linha(['Total', '', c.totalBarras]));
    return '﻿' + out.join('\n');
  }

  // ── CSS do desenho (injetado na tela e no documento de impressão) ──
  const CSS = `
.ocp-plano{margin-top:10px}
.ocp-plano-tit{font-size:12px;font-weight:800;letter-spacing:.02em;margin:12px 0 6px}
.ocp-corte{margin-bottom:10px}
.ocp-corte-tit{font-size:12px;font-weight:700;margin:6px 0 4px}
.ocp-corte-res{font-weight:500;color:#606060;font-size:10px}
.ocp-barra{margin:5px 0 8px}
.ocp-barra-cab{display:flex;justify-content:space-between;align-items:baseline;font-size:10px;color:#606060;margin-bottom:2px}
.ocp-tag{display:inline-block;background:#1D1D1B;color:#C6B784;border-radius:999px;padding:1px 9px;font-weight:800;font-size:10px}
.ocp-track{display:flex;height:30px;border:1px solid #1D1D1B;border-radius:4px;overflow:hidden;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ocp-track .ocp-seg{display:flex;align-items:center;justify-content:center;min-width:0;font-size:9px;font-weight:800;color:#fff;overflow:hidden;border-right:1px solid rgba(255,255,255,.65);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ocp-track .ocp-seg span{padding:0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ocp-track .ocp-seg:nth-child(odd){background:#1D1D1B}
.ocp-track .ocp-seg:nth-child(even){background:#8a6d24}
.ocp-sobra{display:flex;align-items:center;justify-content:center;min-width:0;font-size:9px;font-weight:700;color:#606060;overflow:hidden;background:repeating-linear-gradient(45deg,#efeee9,#efeee9 4px,#e2e0d8 4px,#e2e0d8 8px);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ocp-aviso{background:#FFF6E5;border:1px solid #E9B44C;border-radius:6px;padding:6px 10px;font-size:10px;margin:6px 0}
.ocp-compras{margin-top:12px}
.ocp-tabela{width:100%;border-collapse:collapse;font-size:11px}
.ocp-tabela th{background:#1D1D1B;color:#fff;text-align:left;padding:5px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.03em}
.ocp-tabela td{border:1px solid #D2D0C9;padding:5px 8px}
.ocp-tabela .n{text-align:right;white-space:nowrap}
`;

  const api = { agruparCortes, planejarBarras, planoDeLinhas, desenhoHTML, resumoComprasHTML, consolidarCompras, csvCompras, CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OCPlano = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
