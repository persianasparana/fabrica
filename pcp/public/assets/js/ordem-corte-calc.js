/**
 * Ordem de Corte — cálculo puro (sem DOM), compartilhado com testes.
 *
 * - avaliarFormula: interpreta as fórmulas da Estrutura do Produto em texto
 *   ("L - 2.2", "(L + 30) / 4", "A + varetasRomana(A) + 10") sem eval/Function
 *   (compatível com a CSP). Variáveis: L (largura) e A (altura), na unidade do
 *   produto (cm, ou m nas PH).
 * - planejarBarras: otimização First-Fit Decreasing — distribui os cortes em
 *   barras de comprimento fixo (ex.: 4,90 m) e devolve o plano por barra.
 * - calcularOrdemCorte: agrega um pedido inteiro (itens + estrutura) em
 *   cortes/lâminas/componentes com totais e planos de barra.
 */
(function (root) {
  'use strict';

  // ── Funções nomeadas das planilhas oficiais (usadas nas fórmulas) ──────────
  const FUNCOES = {
    garrasPorLargura(L) {
      if (!L || L <= 0) return 0;
      if (L < 100) return 2;
      if (L < 150) return 3;
      if (L < 200) return 4;
      if (L < 250) return 5;
      if (L < 300) return 6;
      return Math.ceil(L / 50);
    },
    varetasRomana(A) {
      if (!A) return 0;
      if (A >= 50 && A < 60) return 2;
      if (A >= 60.1 && A <= 120) return 4;
      if (A > 120 && A <= 180) return 6;
      if (A > 180 && A <= 240) return 8;
      if (A > 240 && A <= 300) return 10;
      if (A > 300 && A <= 360.5) return 12;
      if (A > 360.5 && A <= 400) return 14;
      if (A > 400 && A <= 450) return 16;
      return 0;
    },
    varetasRomanaTeto(A) {
      if (!A) return 0;
      if (A >= 50 && A <= 86.5) return 1;
      if (A > 86.5 && A <= 164.5) return 3;
      if (A > 164.5 && A <= 242.5) return 5;
      if (A > 242.5 && A <= 320.5) return 7;
      if (A > 320.5 && A <= 398.5) return 9;
      if (A > 398.5 && A <= 450) return 11;
      return 0;
    },
    ph25NumLaminas(A) { return Math.max(0, Math.round(A * 46 + 1)); },
    ph50NumLaminas(A) { return Math.max(0, Math.round((A - 0.05) / 0.044)); },
  };

  // ── Interpretador de expressões (número, L, A, + - * /, parênteses, f(x)) ──
  function avaliarFormula(expr, L, A) {
    const s = String(expr || '');
    let i = 0;

    function pulaEspacos() { while (i < s.length && /\s/.test(s[i])) i++; }
    function erro(msg) { throw new Error(`Fórmula "${expr}": ${msg}`); }

    function primario() {
      pulaEspacos();
      if (s[i] === '(') {
        i++;
        const v = expressao();
        pulaEspacos();
        if (s[i] !== ')') erro('falta ")"');
        i++;
        return v;
      }
      if (s[i] === '-') { i++; return -primario(); }
      if (s[i] === '+') { i++; return primario(); }
      // número (aceita vírgula decimal)
      const mNum = /^\d+(?:[.,]\d+)?/.exec(s.slice(i));
      if (mNum) { i += mNum[0].length; return parseFloat(mNum[0].replace(',', '.')); }
      // identificador (variável ou função)
      const mId = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
      if (mId) {
        const nome = mId[0];
        i += nome.length;
        pulaEspacos();
        if (s[i] === '(') {
          i++;
          const arg = expressao();
          pulaEspacos();
          if (s[i] !== ')') erro(`falta ")" em ${nome}(...)`);
          i++;
          const fn = FUNCOES[nome];
          if (!fn) erro(`função desconhecida: ${nome}`);
          return fn(arg);
        }
        if (nome === 'L') { if (L == null) erro('peça sem largura'); return L; }
        if (nome === 'A') { if (A == null) erro('peça sem altura'); return A; }
        erro(`variável desconhecida: ${nome}`);
      }
      erro(`símbolo inesperado em "${s.slice(i, i + 8)}"`);
    }

    function termo() {
      let v = primario();
      for (;;) {
        pulaEspacos();
        if (s[i] === '*') { i++; v *= primario(); }
        else if (s[i] === '/') { i++; v /= primario(); }
        else return v;
      }
    }

    function expressao() {
      let v = termo();
      for (;;) {
        pulaEspacos();
        if (s[i] === '+') { i++; v += termo(); }
        else if (s[i] === '-') { i++; v -= termo(); }
        else return v;
      }
    }

    const v = expressao();
    pulaEspacos();
    if (i < s.length) erro(`sobra não interpretada: "${s.slice(i)}"`);
    if (!Number.isFinite(v)) erro('resultado não numérico');
    return v;
  }

  // ── Otimização de barras (First-Fit Decreasing) ─────────────────────────────
  // cortes: [{comprimento, rotulo}] · devolve { barras:[{cortes,sobra}], ... }
  function planejarBarras(cortes, comprimentoBarra) {
    const EPS = 1e-9;
    const invalidos = cortes.filter((c) => c.comprimento > comprimentoBarra + EPS);
    const validos = cortes
      .filter((c) => c.comprimento <= comprimentoBarra + EPS)
      .slice()
      .sort((a, b) => b.comprimento - a.comprimento);

    const barras = [];
    for (const c of validos) {
      let alvo = null;
      for (const b of barras) {
        if (b.restante + EPS >= c.comprimento) { alvo = b; break; }
      }
      if (!alvo) { alvo = { cortes: [], restante: comprimentoBarra }; barras.push(alvo); }
      alvo.cortes.push(c);
      alvo.restante -= c.comprimento;
    }
    const totalCorte = validos.reduce((a, c) => a + c.comprimento, 0);
    return {
      comprimentoBarra,
      barras: barras.map((b) => ({ cortes: b.cortes, sobra: Math.max(0, b.restante) })),
      numBarras: barras.length,
      totalCorte,
      totalComprado: barras.length * comprimentoBarra,
      sobraTotal: Math.max(0, barras.length * comprimentoBarra - totalCorte),
      aproveitamento: barras.length ? totalCorte / (barras.length * comprimentoBarra) : 0,
      cortesInvalidos: invalidos,
    };
  }

  // ── Agregação do pedido ─────────────────────────────────────────────────────
  // itens: itens do pedido (mesma resposta da API). estruturaPorId: Map id->produto.
  function calcularOrdemCorte(itens, estruturaPorId) {
    const grupos = new Map(); // produto_id|nome -> grupo
    const semMedida = [];
    const semEstrutura = [];

    for (const item of itens) {
      const prod = item.produto_id != null ? estruturaPorId.get(Number(item.produto_id)) : null;
      if (!prod) { semEstrutura.push(item); continue; }
      const chaveG = String(item.produto_id);
      if (!grupos.has(chaveG)) grupos.set(chaveG, { produto: prod, pecas: [] });
      const L = item.largura != null ? Number(item.largura) : null;
      const A = item.altura != null ? Number(item.altura) : null;
      const qnt = Number(item.qnt) || 1;
      if (L == null || A == null) { semMedida.push(item); continue; }
      for (let k = 0; k < qnt; k++) grupos.get(chaveG).pecas.push({ item, L, A });
    }

    const resultado = [];
    for (const g of grupos.values()) {
      const unidade = g.produto.unidade === 'm' ? 'm' : 'cm';
      const paraMetros = (v) => (unidade === 'm' ? v : v / 100);
      const cortes = [];
      for (const c of g.produto.cortes || []) {
        const linhas = [];
        let erros = 0;
        for (const p of g.pecas) {
          try {
            const comprimento = avaliarFormula(c.formula, p.L, p.A);
            let qtd = c.qtd && c.qtd > 1 ? c.qtd : 1;
            if (c.qtdFormula) qtd = Math.max(0, Math.round(avaliarFormula(c.qtdFormula, p.L, p.A)));
            if (qtd > 0 && comprimento > 0)
              linhas.push({ comprimento, qtd, rotulo: `${p.L} x ${p.A}` });
          } catch (e) { erros++; }
        }
        const numCortes = linhas.reduce((a, l) => a + l.qtd, 0);
        const totalUnidade = linhas.reduce((a, l) => a + l.comprimento * l.qtd, 0);
        const corte = {
          nome: c.nome,
          dim: c.dim || 'L',
          formula: c.formula,
          barra: c.barra != null ? Number(c.barra) : null,
          numCortes,
          totalUnidade,           // na unidade do produto
          totalMetros: paraMetros(totalUnidade),
          unidade,
          erros,
        };
        if (corte.barra && numCortes > 0) {
          const individuais = [];
          for (const l of linhas)
            for (let k = 0; k < l.qtd; k++)
              individuais.push({ comprimento: paraMetros(l.comprimento), rotulo: l.rotulo });
          corte.plano = planejarBarras(individuais, corte.barra);
        }
        cortes.push(corte);
      }

      const componentes = [];
      for (const c of g.produto.componentes || []) {
        let total = 0;
        let erros = 0;
        for (const p of g.pecas) {
          try {
            total += c.qtdFormula
              ? Math.max(0, Math.round(avaliarFormula(c.qtdFormula, p.L, p.A)))
              : Number(c.qtd != null ? c.qtd : 1);
          } catch (e) { erros++; }
        }
        componentes.push({ nome: c.nome, total, obs: c.obs || '', erros });
      }

      resultado.push({ produto: g.produto, numPecas: g.pecas.length, cortes, componentes });
    }

    return { grupos: resultado, semMedida, semEstrutura };
  }

  const api = { FUNCOES, avaliarFormula, planejarBarras, calcularOrdemCorte };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OrdemCorteCalc = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
