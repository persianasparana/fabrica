/**
 * Motor de cálculo de cortes — avalia fórmulas parametrizáveis por produto.
 *
 * Cada corte de um produto tem uma fórmula (texto) sobre as variáveis de
 * entrada da peça (largura, altura, qtd) e pode referenciar OUTROS cortes do
 * mesmo produto pela sua "key" (ex.: gomos = altura/(qtd_varetas+1)+1).
 *
 * Sintaxe suportada (pt-BR e inglês):
 *   + - * / ( )   comparações: > >= < <= = <>
 *   SE(cond; v_se; v_senao)        | IF(cond, v, v)
 *   E(a; b; ...)  OU(a; b; ...)  NAO(x)   | AND OR NOT
 *   ARREDACIMA(x[; casas])  ARREDABAIXO(...)  ARRED(...)  | ROUNDUP ROUNDDOWN ROUND
 *   MIN  MAX  ABS  INT  MOD
 * Vírgula e ponto-e-vírgula são aceitos como separador de argumentos.
 * Booleanos valem 1 (verdadeiro) / 0 (falso).
 *
 * Sem eval(): tokenizer + parser recursivo próprios (seguro).
 */

const FUNCS = {
  SE: (c, a, b) => (c ? a : (b === undefined ? 0 : b)),
  IF: (c, a, b) => (c ? a : (b === undefined ? 0 : b)),
  E: (...xs) => (xs.every((x) => x) ? 1 : 0),
  AND: (...xs) => (xs.every((x) => x) ? 1 : 0),
  OU: (...xs) => (xs.some((x) => x) ? 1 : 0),
  OR: (...xs) => (xs.some((x) => x) ? 1 : 0),
  NAO: (x) => (x ? 0 : 1),
  NOT: (x) => (x ? 0 : 1),
  ARREDACIMA: (x, d = 0) => { const f = 10 ** d; return Math.ceil(x * f - 1e-9) / f; },
  ROUNDUP: (x, d = 0) => { const f = 10 ** d; return Math.ceil(x * f - 1e-9) / f; },
  ARREDABAIXO: (x, d = 0) => { const f = 10 ** d; return Math.floor(x * f + 1e-9) / f; },
  ROUNDDOWN: (x, d = 0) => { const f = 10 ** d; return Math.floor(x * f + 1e-9) / f; },
  ARRED: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  ROUND: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  MIN: (...xs) => Math.min(...xs),
  MAX: (...xs) => Math.max(...xs),
  ABS: (x) => Math.abs(x),
  INT: (x) => Math.trunc(x),
  MOD: (a, b) => a % b,
};

function tokenize(s) {
  const toks = [];
  const re = /\s*(>=|<=|<>|[-+*/(),;><=]|\d+(?:\.\d+)?|[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)\s*/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new Error(`Caractere inesperado em "${s.slice(i)}"`);
    toks.push(m[1]);
    i = re.lastIndex;
  }
  return toks;
}

// Parser recursivo. escopo = { var: valor }. Retorna número.
function parse(toks, escopo) {
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const norm = (x) => (typeof x === 'boolean' ? (x ? 1 : 0) : x);

  function parseExpr() { return parseCmp(); }
  function parseCmp() {
    let a = parseAdd();
    const op = peek();
    if (['>', '<', '>=', '<=', '=', '<>'].includes(op)) {
      next();
      const b = parseAdd();
      switch (op) {
        case '>': return a > b ? 1 : 0;
        case '<': return a < b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '=': return a === b ? 1 : 0;
        case '<>': return a !== b ? 1 : 0;
      }
    }
    return a;
  }
  function parseAdd() {
    let a = parseMul();
    while (peek() === '+' || peek() === '-') { const op = next(); const b = parseMul(); a = op === '+' ? a + b : a - b; }
    return a;
  }
  function parseMul() {
    let a = parseUnary();
    while (peek() === '*' || peek() === '/') { const op = next(); const b = parseUnary(); a = op === '*' ? a * b : a / b; }
    return a;
  }
  function parseUnary() {
    if (peek() === '-') { next(); return -parseUnary(); }
    if (peek() === '+') { next(); return parseUnary(); }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = next();
    if (t === '(') { const v = parseExpr(); if (next() !== ')') throw new Error('Esperado )'); return v; }
    if (/^\d/.test(t)) return parseFloat(t);
    if (/^[A-Za-zÀ-ÿ_]/.test(t)) {
      if (peek() === '(') {
        next(); // (
        const args = [];
        if (peek() !== ')') {
          args.push(norm(parseExpr()));
          while (peek() === ',' || peek() === ';') { next(); args.push(norm(parseExpr())); }
        }
        if (next() !== ')') throw new Error('Esperado ) em função ' + t);
        const fn = FUNCS[t.toUpperCase()];
        if (!fn) throw new Error('Função desconhecida: ' + t);
        return norm(fn(...args));
      }
      // variável
      const key = t.toLowerCase();
      if (!(key in escopo)) throw new Error('Variável desconhecida: ' + t);
      const v = escopo[key];
      if (v === null || v === undefined || Number.isNaN(Number(v))) throw new Error('Variável sem valor: ' + t);
      return Number(v);
    }
    throw new Error('Token inesperado: ' + t);
  }

  const r = parseExpr();
  if (p < toks.length) throw new Error('Sobra de tokens após a expressão: ' + toks.slice(p).join(' '));
  return r;
}

/** Avalia uma fórmula única com um escopo de variáveis. */
function avaliarFormula(formula, escopo) {
  if (formula == null || String(formula).trim() === '') return 0;
  let f = String(formula).trim();
  if (f.startsWith('=')) f = f.slice(1); // tolera fórmula colada do Excel
  return parse(tokenize(f), escopo);
}

/** Normaliza um nome de corte em uma key utilizável como variável. */
function keyDe(corte) {
  if (corte.key) return String(corte.key).toLowerCase();
  return String(corte.nome || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
}

/**
 * Calcula todos os cortes de um produto para uma peça.
 * @param cortes  array [{ nome, key?, formula, setor_id?, unidade?, qtd? }]
 * @param medidas { largura, altura, qtd, ... } variáveis de entrada
 * @returns array [{ nome, key, setor_id, unidade, qtd, valor }]
 * Resolve referências entre cortes (um corte pode usar a key de outro).
 */
function calcularCortes(cortes, medidas) {
  const base = {};
  for (const [k, v] of Object.entries(medidas || {})) base[k.toLowerCase()] = v;
  const porKey = {};
  for (const c of cortes || []) porKey[keyDe(c)] = c;

  const resolvidos = {};
  const visitando = new Set();
  function resolver(key) {
    if (key in resolvidos) return resolvidos[key];
    if (key in base) return base[key];
    const c = porKey[key];
    if (!c) throw new Error('Referência desconhecida: ' + key);
    if (visitando.has(key)) throw new Error('Referência circular em: ' + key);
    visitando.add(key);
    // escopo = medidas + proxy que resolve outros cortes sob demanda
    const escopo = Object.assign({}, base);
    for (const k of Object.keys(porKey)) {
      if (k === key || k in escopo) continue;
      Object.defineProperty(escopo, k, { get: () => resolver(k), enumerable: true, configurable: true });
    }
    const valor = avaliarFormula(c.formula, escopo);
    visitando.delete(key);
    resolvidos[key] = valor;
    return valor;
  }

  return (cortes || []).map((c) => {
    const key = keyDe(c);
    return {
      nome: c.nome,
      key,
      setor_id: c.setor_id != null ? Number(c.setor_id) : null,
      unidade: c.unidade || 'cm',
      qtd: c.qtd != null ? Number(c.qtd) : 1,
      valor: resolver(key),
    };
  });
}

export { avaliarFormula, calcularCortes, keyDe, FUNCS };
