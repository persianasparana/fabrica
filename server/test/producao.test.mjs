/**
 * PRODUÇÃO POR ETAPAS do pedido (27/11/2026) — sem banco, sem rede.
 * `producao.js` junta a fila do PCP, o plano de corte por peça e a lista de materiais do Núcleo nos
 * documentos separados que o cliente pediu: corte do TECIDO (pedido inteiro, por largura de rolo → rolo →
 * faixa), corte dos PERFIS (pedido inteiro, por perfil, com o plano de barras) e MONTAGEM (por parte),
 * mais o quadro das partes e a lista de compra. A peça tem a mesma identificação nos três.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ordenarNomes, SEM_PARTE, PEDIDO_INTEIRO, parteDoItem, comodoDoItem, pedidoPorPartes, resumoDasPartes,
  nomeEVezes, encaixarBarras, compraEmRolos, montarProducao,
} from '../src/producao.js';

// ── fixtures ───────────────────────────────────────────────────────────────────
const SETORES = [{ id: 1, nome: 'Corte', ordem: 10 }, { id: 2, nome: 'Montagem', ordem: 20 }, { id: 4, nome: 'Embalagem', ordem: 40 }];

const ITENS = [
  { id: 10, produto: 'Cortina Rolô', colecao: 'SHEER X', cor_tecido: 'OFF', cor_perfil: 'Branco', acionamento: 'Manual', ambiente: 'Sala - 01', grupo_pedido: 'PARTE 2', observacoes: 'lado esquerdo', atributos: { acabamento: 'Com bandô' }, qnt: 2 },
  { id: 11, produto: 'Cortina Rolô', colecao: 'SHEER X', cor_tecido: 'OFF', ambiente: 'PARTE 10', grupo_pedido: 'PARTE 10', qnt: 1 },
  { id: 12, produto: 'Romana', colecao: 'LINHO', cor_tecido: 'CRU', ambiente: 'Cozinha', grupo_pedido: null, qnt: 1 },
  { id: 13, produto: 'Toldo', ambiente: null, grupo_pedido: null, qnt: 1 },
];
const T = '2026-11-27T10:00:00Z';
const PECAS = [
  { id: 101, item_id: 10, numero: 2, cod_barras: 'PP10-2', largura: 120, altura: 100, conclusao: '2026-11-27', gaveta_id: null, etapas: [{ setor_id: 1, inicio: T, fim: T }, { setor_id: 2, inicio: T, fim: null }] },
  { id: 100, item_id: 10, numero: 1, cod_barras: 'PP10-1', largura: 120, altura: 100, conclusao: '2026-11-27', gaveta_id: 5, etapas: [{ setor_id: 1, inicio: T, fim: T }, { setor_id: 2, inicio: T, fim: T }] },
  { id: 102, item_id: 11, numero: 1, cod_barras: 'PP11-1', largura: 200, altura: 150, conclusao: null, gaveta_id: null },
  { id: 103, item_id: 12, numero: 1, cod_barras: null, largura: 90, altura: 140, conclusao: null, gaveta_id: null },
  { id: 104, item_id: 13, numero: 1, cod_barras: 'PP13-1', largura: 300, altura: 200, conclusao: null, gaveta_id: null },
];

/** as linhas do plano de corte de uma rolô (cm), como o Núcleo devolve */
const linhasRolo = (L, H, alturaDoTecido, regra) => [
  { comp: 'Tubo 32mm', medida: L - 2.8, base: 'L', delta: -2.8 },
  { comp: 'Perfil lateral (×2)', medida: H - 5, base: 'H', delta: -5 },
  { comp: 'Tecido largura', medida: L - 3, base: 'L', delta: -3 },
  { comp: 'Tecido altura', medida: alturaDoTecido, base: regra ? '2H' : 'H', delta: 15, ...(regra ? { regra } : {}) },
  { comp: 'Corrente', medida: null, formula: '2*H' },
];
const pecaDoPlano = (id, L, H, alturaDoTecido, regra, modo = 'manual') => ({
  peca_id: id, produto_nome: 'Rolô Soft Sheer 32mm', variante: 'soft_sheer', tubo_efetivo: 32, modo,
  plano: { nome: 'Soft Sheer', linhas: linhasRolo(L, H, alturaDoTecido, regra) }, aviso: null,
});
const PLANO = {
  ambientes: [
    { ambiente: 'PARTE 2', pecas: [pecaDoPlano(100, 120, 100, 215, 'sheer_dobro'), pecaDoPlano(101, 120, 100, 215, 'sheer_dobro')] },
    // Núcleo anterior à v14.101: a altura do tecido sheer ainda vem "altura + 15"
    { ambiente: 'PARTE 10', pecas: [pecaDoPlano(102, 200, 150, 165, null, 'motor')] },
    { ambiente: 'Cozinha', pecas: [{ peca_id: 103, produto_nome: 'Romana', plano: null, aviso: 'Sem plano de corte cadastrado' }] },
  ],
  avisos: ['Peça nº 1 (Romana): Sem plano de corte cadastrado'],
};

const materiaisRolo = (parafusos) => [
  { tipo: 'componente', sku: 'tubo32', descricao: 'TUBO 32', un: 'M', qtd: 1.172 },
  { tipo: 'componente', sku: 'paraf', descricao: 'PARAFUSO', un: 'PÇ', qtd: parafusos },
  { tipo: 'tecido', sku: 't1', descricao: 'SHEER X 2,20', un: 'M', qtd: 2.15 },
];
const planoTecido = (comRolos) => ({
  pedido: 'PED-1', colecao: 'SHEER X', cor: 'OFF', pecas: 3,
  ambientes: [
    { ambiente: 'Sala', largura_rolo: 2.2, pecas: 2, origem: 'peca', blocos: ['PARTE 2'] },
    { ambiente: 'PARTE 10', largura_rolo: 2.9, pecas: 1, origem: 'ambiente', blocos: ['PARTE 10'] },
  ],
  ambientes_parecidos: [],
  larguras: [
    { largura_rolo: 2.9, tecido_sku: 't2', comprimento: 3.15, pecas: 1, ambientes: ['PARTE 10'], ...(comRolos ? { metros_bobina: 30, metros_bobina_origem: 'padrao', bobinas: 1, ponta_m: 26.85 } : {}) },
    { largura_rolo: 2.2, tecido_sku: 't1', comprimento: 4.3, pecas: 2, ambientes: ['Sala'], ...(comRolos ? { metros_bobina: 3, metros_bobina_origem: 'cadastro', bobinas: 2, ponta_m: 1.7 } : {}) },
  ],
  rolos: [
    {
      largura_rolo: 2.9, comprimento: 3.15, ...(comRolos ? { metros_bobina: 30, metros_bobina_origem: 'padrao', bobinas: [{ n: 1, faixas: 1, metros: 3.15, ponta: 26.85 }] } : {}),
      shelves: [{ comprimento: 3.15, ...(comRolos ? { bobina: 1 } : {}), pecas: [{ ref: '11:102', largura: 2.1, altura: 3.15, rotacionado: false, ambiente: 'PARTE 10', comodo: 'PARTE 10' }] }],
    },
    {
      largura_rolo: 2.2, comprimento: 4.3, ...(comRolos ? { metros_bobina: 3, metros_bobina_origem: 'cadastro', bobinas: [{ n: 1, faixas: 1, metros: 2.15, ponta: 0.85 }, { n: 2, faixas: 1, metros: 2.15, ponta: 0.85 }] } : {}),
      shelves: [
        { comprimento: 2.15, ...(comRolos ? { bobina: 1 } : {}), pecas: [{ ref: '10:100', largura: 1.3, altura: 2.15, rotacionado: false }] },
        { comprimento: 2.15, ...(comRolos ? { bobina: 2 } : {}), pecas: [{ ref: '10:101', largura: 1.3, altura: 2.15, rotacionado: false }] },
      ],
    },
  ],
  fora_do_rolo: [],
});
const lista = (comRolos = true) => ({
  habilitado: true,
  avisos: ['aviso da lista de materiais'],
  data: {
    pecas: [
      { ref: '10:100', ok: true, colecao: 'SHEER X', cor: 'OFF', largura_rolo: 2.2, tecido_m: 2.15, materiais: materiaisRolo(4) },
      { ref: '10:101', ok: true, colecao: 'SHEER X', cor: 'OFF', largura_rolo: 2.2, tecido_m: 2.15, materiais: materiaisRolo(4) },
      { ref: '11:102', ok: true, colecao: 'SHEER X', cor: 'OFF', largura_rolo: 2.9, tecido_m: 3.15, materiais: [{ tipo: 'componente', sku: 'paraf', descricao: 'PARAFUSO', un: 'PÇ', qtd: 6 }] },
      { ref: '12:103', ok: true, colecao: 'LINHO', cor: 'CRU', largura_rolo: 2, tecido_m: 1.6, materiais: [{ tipo: 'componente', sku: 'vareta', descricao: 'VARETA', un: 'M', qtd: 3.6 }, { tipo: 'tecido', sku: 't9', descricao: 'LINHO 2,00', un: 'M', qtd: 1.6 }] },
      { ref: '13:104', ok: false, error: 'produto_nao_encontrado', motivo: 'Produto não encontrado no Núcleo', materiais: [] },
    ],
    perfis: [
      { componente: 'Tubo 32mm', barra_m: 5.8, barra_origem: 'cadastro', barras: 1 },
      { componente: 'Perfil lateral', barra_m: 6, barra_origem: 'padrao', barras: 9 },
    ],
    plano_tecido: [planoTecido(comRolos)],
  },
});

// a fixture é tratada como pedido POR PARTES (como se o PCP tivesse forçado); a regra automática tem os seus testes
const montar = (extra = {}) => montarProducao({ pedido: 'PED-1', itens: ITENS, pecas: PECAS, plano: PLANO, lista: lista(), setores: SETORES, porPartes: true, ...extra });
const pecaDe = (d, id) => d.pecas.find((p) => p.id === id);

// ── nomes ──────────────────────────────────────────────────────────────────────
test('ordenarNomes: PARTE 2 antes de PARTE 10; o que não tem nome fica por último', () => {
  assert.deepEqual(ordenarNomes(['PARTE 10', SEM_PARTE, 'parte 2', 'Cozinha', '', 'PARTE 1']), ['Cozinha', 'PARTE 1', 'parte 2', 'PARTE 10', SEM_PARTE, '']);
});

test('parte = o grupo do pedido; sem grupo, o ambiente; sem nada, "(sem ambiente)"', () => {
  assert.equal(parteDoItem({ grupo_pedido: ' PARTE 3 ', ambiente: 'Sala' }), 'PARTE 3');
  assert.equal(parteDoItem({ grupo_pedido: null, ambiente: 'Sala' }), 'Sala');
  assert.equal(parteDoItem({}), SEM_PARTE);
  assert.equal(parteDoItem(null), SEM_PARTE);
});

test('cômodo = o ambiente escrito na peça, só quando não é o próprio nome da parte', () => {
  assert.equal(comodoDoItem({ grupo_pedido: 'PARTE 3', ambiente: 'Sala - 01' }), 'Sala - 01');
  assert.equal(comodoDoItem({ grupo_pedido: 'PARTE 3', ambiente: 'parte 3' }), null);
  assert.equal(comodoDoItem({ grupo_pedido: null, ambiente: 'Sala' }), null);
  assert.equal(comodoDoItem({ grupo_pedido: 'PARTE 3', ambiente: '' }), null);
});

// ── pedido por partes × pedido comum ───────────────────────────────────────────
test('por partes (automático): dois grupos ou mais E o cômodo escrito em pelo menos metade das peças', () => {
  // o pedido do relato: blocos "PARTE n" e o cômodo na peça
  const porPartes = [
    { id: 1, grupo_pedido: 'PARTE 1', ambiente: 'Recepção - 01', qnt: 3 },
    { id: 2, grupo_pedido: 'PARTE 1', ambiente: 'Sala de Jogos', qnt: 2 },
    { id: 3, grupo_pedido: 'PARTE 2', ambiente: 'PARTE 2', qnt: 1 },
  ];
  assert.deepEqual(pedidoPorPartes(porPartes), { ativo: true, automatico: true, forcado: null });
  // pedido comum: o bloco É o cômodo
  const comum = [
    { id: 1, grupo_pedido: 'Sala', ambiente: 'Sala', qnt: 2 },
    { id: 2, grupo_pedido: 'Quarto', ambiente: 'Quarto', qnt: 1 },
    { id: 3, grupo_pedido: 'Cozinha', ambiente: 'Cozinha - janela da pia', qnt: 1 },
  ];
  assert.deepEqual(pedidoPorPartes(comum), { ativo: false, automatico: false, forcado: null });
  // um grupo só não é "por partes", mesmo com o cômodo escrito
  assert.equal(pedidoPorPartes([{ id: 1, grupo_pedido: 'Casa', ambiente: 'Sala', qnt: 4 }]).ativo, false);
  // sem grupo (pedido liberado antes de o grupo existir) e sem nada
  assert.equal(pedidoPorPartes([{ id: 1, grupo_pedido: null, ambiente: 'Sala', qnt: 1 }, { id: 2, grupo_pedido: null, ambiente: 'Quarto', qnt: 1 }]).ativo, false);
  assert.equal(pedidoPorPartes([]).ativo, false);
  assert.equal(pedidoPorPartes(null).ativo, false);
});

test('por partes: cada item pesa pelo nº de peças dele (as peças da fila, quando informadas)', () => {
  const itens = [
    { id: 1, grupo_pedido: 'PARTE 1', ambiente: 'Recepção', qnt: 1 },
    { id: 2, grupo_pedido: 'PARTE 2', ambiente: 'PARTE 2', qnt: 1 },
  ];
  assert.equal(pedidoPorPartes(itens).ativo, true, 'metade das peças com o cômodo escrito');
  const pecas = [{ item_id: 1 }, { item_id: 2 }, { item_id: 2 }, { item_id: 2 }];
  assert.equal(pedidoPorPartes(itens, pecas).ativo, false, '1 de 4 peças não chega à metade');
  // `pecas` do item (integração) vale no lugar de qnt
  assert.equal(pedidoPorPartes([{ ...itens[0], pecas: 5 }, { ...itens[1], pecas: 1 }]).ativo, true);
});

test('por partes: o que o PCP forçou vence o automático, e o automático continua informado', () => {
  const comum = [{ id: 1, grupo_pedido: 'Sala', ambiente: 'Sala' }, { id: 2, grupo_pedido: 'Quarto', ambiente: 'Quarto' }];
  assert.deepEqual(pedidoPorPartes(comum, null, true), { ativo: true, automatico: false, forcado: true });
  const porPartes = [{ id: 1, grupo_pedido: 'PARTE 1', ambiente: 'Sala' }, { id: 2, grupo_pedido: 'PARTE 2', ambiente: 'Copa' }];
  assert.deepEqual(pedidoPorPartes(porPartes, null, false), { ativo: false, automatico: true, forcado: false });
  assert.deepEqual(pedidoPorPartes(porPartes, null, 'sim'), { ativo: true, automatico: true, forcado: null }, 'valor estranho = automático');
});

test('pedido comum: a parte é o pedido inteiro e o cômodo é o ambiente do item', () => {
  assert.equal(parteDoItem({ grupo_pedido: 'Sala', ambiente: 'Sala' }, false), PEDIDO_INTEIRO);
  assert.equal(comodoDoItem({ grupo_pedido: 'Sala', ambiente: 'Sala' }, false), 'Sala');
  assert.equal(comodoDoItem({ grupo_pedido: 'Sala', ambiente: 'Sala - janela 1' }, false), 'Sala - janela 1');
  assert.equal(comodoDoItem({ grupo_pedido: 'Sala', ambiente: null }, false), 'Sala');
  assert.equal(comodoDoItem({}, false), null);
});

test('pedido comum nos documentos: UMA parte, os ambientes como cômodos, nada de "pronta" por cômodo', () => {
  const itens = [
    { id: 10, produto: 'Cortina Rolô', grupo_pedido: 'Sala', ambiente: 'Sala', qnt: 2 },
    { id: 11, produto: 'Cortina Rolô', grupo_pedido: 'Quarto', ambiente: 'Quarto', qnt: 1 },
  ];
  const pecas = [
    { id: 100, item_id: 10, numero: 1, cod_barras: 'PP10-1', largura: 120, altura: 100, conclusao: '2026-11-27', gaveta_id: null },
    { id: 101, item_id: 10, numero: 2, cod_barras: 'PP10-2', largura: 120, altura: 100, conclusao: '2026-11-27', gaveta_id: null },
    { id: 102, item_id: 11, numero: 1, cod_barras: 'PP11-1', largura: 200, altura: 150, conclusao: null, gaveta_id: null },
  ];
  const d = montarProducao({ pedido: 'PED-2', itens, pecas, plano: null, lista: null, setores: SETORES });
  assert.deepEqual(d.por_partes, { ativo: false, automatico: false, forcado: null });
  assert.deepEqual(d.partes.map((p) => [p.parte, p.pecas]), [[PEDIDO_INTEIRO, 3]]);
  assert.deepEqual(d.partes[0].comodos, [{ comodo: 'Sala', pecas: [100, 101] }, { comodo: 'Quarto', pecas: [102] }]);
  assert.deepEqual([d.resumo.partes, d.resumo.partes_prontas, d.partes[0].andamento.pronta], [1, 0, false], 'a Sala inteira embalada não fecha nada: falta o Quarto');
  assert.deepEqual(d.pecas.map((p) => [p.parte, p.comodo]), [[PEDIDO_INTEIRO, 'Sala'], [PEDIDO_INTEIRO, 'Sala'], [PEDIDO_INTEIRO, 'Quarto']]);
  // o PCP força "por partes": os blocos viram as partes
  const f = montarProducao({ pedido: 'PED-2', itens, pecas, plano: null, lista: null, setores: SETORES, porPartes: true });
  assert.deepEqual(f.partes.map((p) => [p.parte, p.pecas, p.andamento.pronta]), [['Quarto', 1, false], ['Sala', 2, true]]);
  assert.deepEqual(f.por_partes, { ativo: true, automatico: false, forcado: true });
});

test('resumo das partes para a integração: só no pedido por partes; a parte fecha com TODAS as peças', () => {
  const itens = [
    { id: 1, grupo_pedido: 'PARTE 2', ambiente: 'Recepção', pecas: 3, concluidas: 3, guardadas: 3 },
    { id: 2, grupo_pedido: 'PARTE 10', ambiente: 'Copa', pecas: 2, concluidas: 2, guardadas: 1 },
    { id: 3, grupo_pedido: 'PARTE 10', ambiente: 'Sala', pecas: 1, concluidas: 0, guardadas: 0 },
  ];
  assert.deepEqual(resumoDasPartes(itens), {
    por_partes: true,
    partes: [
      { parte: 'PARTE 2', total_pecas: 3, pecas_concluidas: 3, pecas_guardadas: 3, concluida: true, na_expedicao: true },
      { parte: 'PARTE 10', total_pecas: 3, pecas_concluidas: 2, pecas_guardadas: 1, concluida: false, na_expedicao: false },
    ],
  });
  assert.deepEqual(resumoDasPartes(itens, false), { por_partes: false, partes: [] }, 'o PCP disse que é um pedido só');
  const comum = [{ id: 1, grupo_pedido: 'Sala', ambiente: 'Sala', pecas: 2, concluidas: 2, guardadas: 0 }, { id: 2, grupo_pedido: 'Quarto', ambiente: 'Quarto', pecas: 1, concluidas: 0, guardadas: 0 }];
  assert.deepEqual(resumoDasPartes(comum), { por_partes: false, partes: [] });
  assert.equal(resumoDasPartes(comum, true).partes.length, 2);
});

test('nomeEVezes lê o "(×2)" do rótulo do corte', () => {
  assert.deepEqual(nomeEVezes('Perfil lateral (×2)'), { nome: 'Perfil lateral', vezes: 2 });
  assert.deepEqual(nomeEVezes('Guia (x 3)'), { nome: 'Guia', vezes: 3 });
  assert.deepEqual(nomeEVezes('Tubo 32mm'), { nome: 'Tubo 32mm', vezes: 1 });
});

// ── barras ─────────────────────────────────────────────────────────────────────
/** a conta de barras do Núcleo (`motor.empacotarBarras`), copiada para servir de referência */
function barrasDoNucleo(cortes, barraCm) {
  const a = barraCm || 600;
  const lista = (cortes || []).map(Number).filter((x) => x > 0);
  const sobras = [];
  lista.filter((l) => l <= a).sort((x, y) => y - x).forEach((l) => {
    const i = sobras.findIndex((s) => s >= l);
    if (i >= 0) sobras[i] -= l; else sobras.push(a - l);
  });
  lista.filter((l) => l > a).forEach((l) => {
    let resto = l;
    while (resto > a) { sobras.push(0); resto -= a; }
    const i = sobras.findIndex((s) => s >= resto);
    if (i >= 0) sobras[i] -= resto; else sobras.push(a - resto);
  });
  return { nBarras: sobras.length, sobraCm: sobras.reduce((s, x) => s + x, 0), metrosCm: lista.reduce((s, x) => s + x, 0) };
}

test('encaixarBarras: do maior para o menor, na primeira barra em que cabe', () => {
  const e = encaixarBarras([{ cm: 200, id: 4 }, { cm: 400, id: 1 }, { cm: 300, id: 2 }, { cm: 300, id: 3 }, { cm: 0, id: 9 }, { cm: -5, id: 9 }], 600);
  assert.equal(e.n_barras, 2);
  assert.deepEqual(e.barras.map((b) => b.cortes.map((c) => c.id)), [[1, 4], [2, 3]]);
  assert.deepEqual(e.barras.map((b) => [b.n, b.usado_cm, b.sobra_cm]), [[1, 600, 0], [2, 600, 0]]);
  assert.equal(e.metros_cm, 1200);
  assert.equal(e.sobra_cm, 0);
});

test('encaixarBarras: corte maior que a barra ocupa barras inteiras (emenda) e o resto entra onde couber', () => {
  const e = encaixarBarras([{ cm: 1500, id: 1 }, { cm: 250, id: 2 }], 600);
  assert.equal(e.n_barras, 3);
  // a barra 1 é a do corte que cabe; as duas seguintes são inteiras do corte grande; o resto (300) volta para a 1
  assert.deepEqual(e.barras.map((b) => b.cortes.map((c) => [c.id, c.emenda || 0, c.cm_na_barra || c.cm])), [[[2, 0, 250], [1, 3, 300]], [[1, 1, 600]], [[1, 2, 600]]]);
  assert.equal(e.barras[0].sobra_cm, 50);
});

test('encaixarBarras: barra inválida vale 6 m; lista vazia não quebra', () => {
  assert.equal(encaixarBarras([{ cm: 350 }, { cm: 350 }], 0).n_barras, 2);
  assert.deepEqual(encaixarBarras([], 600), { barras: [], n_barras: 0, sobra_cm: 0, metros_cm: 0 });
  assert.equal(encaixarBarras(null, 600).n_barras, 0);
});

test('encaixarBarras conta as MESMAS barras que o Núcleo (é ele que diz quantas comprar)', () => {
  // gerador determinístico — nada de Math.random num teste
  let semente = 20261127;
  const prox = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  for (let caso = 0; caso < 300; caso += 1) {
    const barra = [580, 600, 300][caso % 3];
    const n = 1 + Math.floor(prox() * 60);
    const cortes = Array.from({ length: n }, () => Math.round((20 + prox() * (caso % 7 === 0 ? 900 : 320)) * 10) / 10);
    const meu = encaixarBarras(cortes.map((cm, i) => ({ cm, id: i })), barra);
    const ref = barrasDoNucleo(cortes, barra);
    assert.equal(meu.n_barras, ref.nBarras, `caso ${caso}: barras`);
    assert.ok(Math.abs(meu.sobra_cm - ref.sobraCm) < 0.2, `caso ${caso}: sobra`);
    // nenhum corte se perde e nenhuma barra passa do comprimento
    const noPlano = meu.barras.reduce((s, b) => s + b.cortes.reduce((t, c) => t + (c.cm_na_barra != null ? c.cm_na_barra : c.cm), 0), 0);
    assert.ok(Math.abs(noPlano - ref.metrosCm) < 0.2, `caso ${caso}: metros`);
    for (const b of meu.barras) assert.ok(b.usado_cm <= barra + 0.05, `caso ${caso}: barra ${b.n} passa do comprimento`);
  }
});

// ── o documento ────────────────────────────────────────────────────────────────
test('a peça tem a mesma identificação nos três documentos', () => {
  const d = montar();
  assert.deepEqual(d.pecas.map((p) => p.id), [100, 101, 102, 103, 104], 'ordem: item, número da peça');
  const p = pecaDe(d, 100);
  assert.equal(p.etiqueta, 'PP10-1');
  assert.equal(p.item_seq, 1);
  assert.equal(p.numero, 1);
  assert.equal(p.parte, 'PARTE 2');
  assert.equal(p.comodo, 'Sala - 01');
  assert.equal(p.produto, 'Cortina Rolô');
  assert.equal(p.produto_nome, 'Rolô Soft Sheer 32mm');
  assert.equal(p.tubo, 32);
  assert.equal(p.acabamento, 'Com bandô');
  assert.equal(p.cor_perfil, 'Branco');
  assert.equal(p.observacoes, 'lado esquerdo');
  assert.deepEqual([p.largura_cm, p.altura_cm], [120, 100]);
  assert.equal(pecaDe(d, 103).etiqueta, null, 'peça sem etiqueta: a página mostra item · peça');
  assert.equal(pecaDe(d, 102).comodo, null, 'texto da peça igual ao nome da parte não é cômodo');
  assert.equal(pecaDe(d, 104).parte, SEM_PARTE);
  // nada de material nem de etapa por peça na resposta (ficam nos agregados)
  for (const x of d.pecas) { assert.equal('materiais' in x, false); assert.equal('etapas' in x, false); }
});

test('corte do tecido: pedido inteiro, por largura de rolo → rolo → faixa, com a peça de cada faixa', () => {
  const d = montar();
  assert.equal(d.tecido.length, 1);
  const t = d.tecido[0];
  assert.deepEqual([t.colecao, t.cor, t.metros, t.n_rolos], ['SHEER X', 'OFF', 7.45, 3]);
  assert.deepEqual(t.larguras.map((l) => l.largura_rolo), [2.2, 2.9], 'da largura menor para a maior');
  const l22 = t.larguras[0];
  assert.deepEqual([l22.metros, l22.n_rolos, l22.metros_rolo, l22.metros_rolo_origem, l22.ponta_m, l22.faixas, l22.pecas, l22.rolo_a_rolo], [4.3, 2, 3, 'cadastro', 1.7, 2, 2, true]);
  assert.deepEqual(l22.rolos.map((r) => [r.n, r.usado_m, r.ponta_m, r.faixas.map((f) => [f.n, f.comprimento_m, f.pecas.map((x) => x.id)])]),
    [[1, 2.15, 0.85, [[1, 2.15, [100]]]], [2, 2.15, 0.85, [[2, 2.15, [101]]]]]);
  // a peça sabe de qual rolo e de qual faixa sai — é o que a Montagem imprime
  assert.deepEqual([pecaDe(d, 101).tecido.rolo_m, pecaDe(d, 101).tecido.rolo_n, pecaDe(d, 101).tecido.rolos_da_largura, pecaDe(d, 101).tecido.faixa_n], [2.2, 2, 2, 2]);
  assert.deepEqual(t.comodos.map((c) => [c.comodo, c.largura_rolo, c.partes]), [['Sala', 2.2, ['PARTE 2']], ['PARTE 10', 2.9, ['PARTE 10']]]);
});

test('altura de corte do tecido: vale a do plano de corte; se ele ainda não dobra o sheer, a do plano de consumo', () => {
  const d = montar();
  // Núcleo v14.101: o plano de corte já traz 2 × altura + folga do tubo
  assert.deepEqual([pecaDe(d, 100).tecido.corte_largura_cm, pecaDe(d, 100).tecido.corte_altura_cm, pecaDe(d, 100).tecido.altura_regra], [117, 215, 'sheer_dobro']);
  // Núcleo anterior: "altura + 15" (165 cm) contra 315 cm do plano que comprou o tecido → vale 315, com aviso
  assert.deepEqual([pecaDe(d, 102).tecido.corte_altura_cm, pecaDe(d, 102).tecido.altura_regra, pecaDe(d, 102).tecido.altura_plano_cm], [315, 'plano_de_consumo', 315]);
  const aviso = d.avisos.filter((a) => /Em 1 peça\(s\) a altura do tecido/.test(a.texto));
  assert.equal(aviso.length, 1);
  assert.deepEqual(aviso[0].docs, ['tecido', 'montagem'], 'imprime nos documentos de quem corta e de quem monta');
});

test('peça com tecido fora do plano de aproveitamento: cortar à parte e comprar à parte', () => {
  const d = montar();
  assert.deepEqual(d.tecido_fora_do_plano, [103]);
  assert.equal(pecaDe(d, 103).tecido.fora_do_plano, true);
  assert.deepEqual(d.compra.tecido_fora_do_plano, [{ colecao: 'LINHO', cor: 'CRU', largura_rolo: 2, metros: 1.6, pecas: 1 }]);
  assert.equal(pecaDe(d, 100).tecido.fora_do_plano, false);
});

test('corte dos perfis: pedido inteiro, por perfil, com o plano de barras e a peça de cada corte', () => {
  const d = montar();
  const tubo = d.perfis.find((x) => x.perfil === 'Tubo 32mm');
  // a barra é a do cadastro do Núcleo (5,80 m); 117,2 + 117,2 + 197,2 cabem numa só
  assert.deepEqual([tubo.barra_m, tubo.barra_origem, tubo.cortes, tubo.n_barras, tubo.barras_na_lista, tubo.metros], [5.8, 'cadastro', 3, 1, 1, 4.32]);
  assert.deepEqual(tubo.barras[0].cortes.map((c) => [c.cm, c.id]), [[197.2, 102], [117.2, 100], [117.2, 101]]);
  // "(×2)" vira dois cortes da mesma peça
  const lateral = d.perfis.find((x) => x.perfil === 'Perfil lateral');
  assert.equal(lateral.cortes, 6);
  assert.equal(lateral.n_barras, 2);
  assert.deepEqual(lateral.barras.map((b) => b.cortes.map((c) => c.cm)), [[145, 145, 95, 95, 95], [95]]);
  // o tecido não é perfil; item por fórmula fica à parte
  assert.equal(d.perfis.some((x) => /tecido/i.test(x.perfil)), false);
  assert.deepEqual(d.itens_por_formula, [{ perfil: 'Corrente', formula: '2*H', pecas: 3 }]);
  // perfil com mais barras primeiro
  assert.deepEqual(d.perfis.map((x) => x.perfil), ['Perfil lateral', 'Tubo 32mm']);
});

test('troca de tela (somente tecido): a peça não entra no corte dos perfis — só o tecido é cortado', () => {
    const l = lista();
    l.data.pecas[0].so_tecido = true; // a peça 100 foi vendida como troca de tela
    const d = montar({ lista: l });
    assert.equal(pecaDe(d, 100).so_tecido, true);
    assert.deepEqual(pecaDe(d, 100).cortes, []);
    assert.deepEqual([pecaDe(d, 100).tecido.corte_largura_cm, pecaDe(d, 100).tecido.corte_altura_cm, pecaDe(d, 100).tecido.rolo_m], [117, 215, 2.2], 'o tecido dela segue no plano');
    const tubo = d.perfis.find((x) => x.perfil === 'Tubo 32mm');
    assert.deepEqual(tubo.barras[0].cortes.map((c) => c.id), [102, 101], 'os perfis da peça 100 saíram do plano de barras');
    assert.equal(d.perfis.find((x) => x.perfil === 'Perfil lateral').cortes, 4);
    assert.deepEqual(d.itens_por_formula, [{ perfil: 'Corrente', formula: '2*H', pecas: 2 }]);
    assert.equal(pecaDe(d, 101).so_tecido, false);
});

test('plano de barras diferente da lista de materiais do Núcleo: avisa (não esconde)', () => {
  const d = montar();
  const aviso = d.avisos.find((a) => /difere da lista de materiais/.test(a.texto));
  assert.ok(aviso && /Perfil lateral \(2 × 9\)/.test(aviso.texto), JSON.stringify(aviso));
  assert.equal(/Tubo 32mm/.test(aviso.texto), false, 'o que bate não entra no aviso');
  assert.deepEqual(aviso.docs, ['perfis', 'compra']);
});

test('montagem: por parte → cômodo → peça, com os componentes de cada parte (sem o tecido)', () => {
  const d = montar();
  assert.deepEqual(d.partes.map((p) => [p.parte, p.pecas]), [['Cozinha', 1], ['PARTE 2', 2], ['PARTE 10', 1], [SEM_PARTE, 1]]);
  const p2 = d.partes.find((p) => p.parte === 'PARTE 2');
  assert.deepEqual(p2.comodos, [{ comodo: 'Sala - 01', pecas: [100, 101] }]);
  assert.deepEqual(p2.componentes, [
    { sku: 'paraf', descricao: 'PARAFUSO', un: 'PÇ', qtd: 8, pecas: 2 },
    { sku: 'tubo32', descricao: 'TUBO 32', un: 'M', qtd: 2.344, pecas: 2 },
  ]);
  assert.deepEqual(d.partes.find((p) => p.parte === 'PARTE 10').comodos, [{ comodo: null, pecas: [102] }]);
});

test('quadro das partes: andamento por setor, embaladas, na gaveta; a parte fica pronta com TODAS embaladas', () => {
  const d = montar();
  const a = d.partes.find((p) => p.parte === 'PARTE 2').andamento;
  assert.deepEqual(a.setores, [
    { setor_id: 1, setor: 'Corte', iniciadas: 2, concluidas: 2 },
    { setor_id: 2, setor: 'Montagem', iniciadas: 2, concluidas: 1 },
    { setor_id: 4, setor: 'Embalagem', iniciadas: 0, concluidas: 0 },
  ]);
  assert.deepEqual([a.embaladas, a.guardadas, a.pronta, a.na_expedicao], [2, 1, true, false]);
  const a10 = d.partes.find((p) => p.parte === 'PARTE 10').andamento;
  assert.deepEqual([a10.embaladas, a10.pronta, a10.na_expedicao], [0, false, false]);
  assert.deepEqual(d.resumo, { itens: 4, pecas: 5, partes: 4, embaladas: 2, guardadas: 1, partes_prontas: 1 });
  // todas na gaveta → na expedição
  const todasGuardadas = montar({ pecas: PECAS.map((p) => (p.item_id === 10 ? { ...p, gaveta_id: 7 } : p)) });
  assert.equal(todasGuardadas.partes.find((p) => p.parte === 'PARTE 2').andamento.na_expedicao, true);
});

test('lista de compra: tecido em ROLOS inteiros, perfis em barras, componentes somados no pedido', () => {
  const d = montar();
  assert.deepEqual(d.compra.tecido.map((t) => [t.largura_rolo, t.tecido_sku, t.metros, t.n_rolos, t.metros_rolo, t.metros_a_comprar]),
    [[2.2, 't1', 4.3, 2, 3, 6], [2.9, 't2', 3.15, 1, 30, 30]]);
  assert.deepEqual(d.compra.perfis.map((x) => [x.perfil, x.n_barras, x.barra_m]), [['Perfil lateral', 2, 6], ['Tubo 32mm', 1, 5.8]]);
  assert.deepEqual(d.compra.componentes, [
    { sku: 'paraf', descricao: 'PARAFUSO', un: 'PÇ', qtd: 14 },
    { sku: 'tubo32', descricao: 'TUBO 32', un: 'M', qtd: 2.344 },
    { sku: 'vareta', descricao: 'VARETA', un: 'M', qtd: 3.6 },
  ]);
});

test('compra do tecido em rolos inteiros: os rolos do plano; com saldo, a falta para cima em rolos', () => {
  // sem saldo do Compras: os rolos do plano (369,30 m em 13 rolos de 30 m → 390 m)
  assert.deepEqual(compraEmRolos({ metros: 369.3, bobinas: 13, metros_bobina: 30 }), { metros_rolo: 30, rolos: 13, metros: 390 });
  // com saldo: falta 269,3 m → 9 rolos (270 m); falta de 30,00 m exatos = 1 rolo; falta zero = nada
  assert.deepEqual(compraEmRolos({ metros: 369.3, bobinas: 13, metros_bobina: 30, falta: 269.3 }), { metros_rolo: 30, rolos: 9, metros: 270 });
  assert.deepEqual(compraEmRolos({ metros: 369.3, bobinas: 13, metros_bobina: 30, falta: 30 }), { metros_rolo: 30, rolos: 1, metros: 30 });
  assert.deepEqual(compraEmRolos({ metros: 369.3, bobinas: 13, metros_bobina: 30, falta: 0 }), { metros_rolo: 30, rolos: 0, metros: 0 });
  // sem os metros do rolo (Núcleo anterior ao plano rolo a rolo): os metros, como antes
  assert.deepEqual(compraEmRolos({ metros: 12.345, bobinas: null, metros_bobina: null }), { metros_rolo: null, rolos: null, metros: 12.35 });
  assert.deepEqual(compraEmRolos({ metros: 12.3, falta: 4.56 }), { metros_rolo: null, rolos: null, metros: 4.56 });
  assert.deepEqual(compraEmRolos(), { metros_rolo: null, rolos: null, metros: 0 });
});

test('avisos: o da lista passa; o de cada peça fica na peça e vira UMA contagem', () => {
  const d = montar();
  assert.deepEqual(d.avisos.find((a) => a.texto === 'aviso da lista de materiais'), { texto: 'aviso da lista de materiais', docs: null }, 'aviso geral: só na Visão geral e na compra');
  assert.equal(pecaDe(d, 103).aviso, 'Sem plano de corte cadastrado');
  assert.equal(pecaDe(d, 104).aviso, 'Produto não encontrado no Núcleo');
  assert.equal(d.avisos.filter((a) => /^2 peça\(s\) com aviso do Núcleo/.test(a.texto)).length, 1);
  assert.equal(d.avisos.some((a) => /Peça nº 1 \(Romana\)/.test(a.texto)), false, 'o aviso por peça não sobe um a um');
  assert.equal(new Set(d.avisos.map((a) => a.texto)).size, d.avisos.length, 'sem aviso repetido');
});

test('Núcleo anterior ao plano rolo a rolo: as faixas saem num grupo só, sem número de rolo', () => {
  const d = montar({ lista: lista(false) });
  const l22 = d.tecido[0].larguras[0];
  assert.equal(l22.rolo_a_rolo, false);
  assert.equal(l22.n_rolos, null);
  assert.deepEqual(l22.rolos.map((r) => [r.n, r.usado_m, r.ponta_m, r.faixas.map((f) => f.n)]), [[null, 4.3, null, [1, 2]]]);
  assert.equal(d.tecido[0].n_rolos, null);
  assert.equal(pecaDe(d, 101).tecido.rolo_n, null);
  assert.equal(pecaDe(d, 101).tecido.faixa_n, 2);
  // sem os rolos, compra-se pelos metros do plano
  assert.equal(d.compra.tecido[0].metros_a_comprar, 4.3);
});

test('faixa maior que o rolo conta os rolos que pede', () => {
  const l = lista();
  const r22 = l.data.plano_tecido[0].rolos[1];
  r22.bobinas = [{ n: 1, faixas: 1, metros: 2.15, ponta: 0.85 }, { n: 2, faixas: 1, metros: 2.15, ponta: 3.85, excede: true, bobinas: 2 }];
  const d = montar({ lista: l });
  const l22 = d.tecido[0].larguras[0];
  assert.equal(l22.n_rolos, 3);
  assert.equal(l22.rolos[1].excede, true);
  assert.equal(d.compra.tecido[0].metros_a_comprar, 9);
});

test('Núcleo fora: os documentos saem vazios com o aviso do que ficou de fora — e as partes continuam', () => {
  const d = montarProducao({ pedido: 'PED-1', itens: ITENS, pecas: PECAS, plano: null, lista: { habilitado: true, motivo: 'HTTP 502', data: null, avisos: [] }, setores: SETORES, porPartes: true });
  assert.deepEqual([d.tecido.length, d.perfis.length, d.compra.tecido.length, d.compra.componentes.length], [0, 0, 0, 0]);
  assert.equal(d.partes.length, 4);
  assert.equal(d.partes.find((p) => p.parte === 'PARTE 2').andamento.pronta, true);
  assert.ok(d.avisos.some((a) => /plano de corte por peça não veio/.test(a.texto) && a.docs.includes('perfis')));
  assert.ok(d.avisos.some((a) => /lista de materiais não veio.*HTTP 502/.test(a.texto) && a.docs.includes('tecido')));
  // sem nada
  const vazio = montarProducao();
  assert.deepEqual([vazio.pedido, vazio.pecas.length, vazio.partes.length, vazio.por_partes.ativo], [null, 0, 0, false]);
  // a mesma fixture no automático: só 2 das 5 peças têm o cômodo escrito → é um pedido só
  const auto = montarProducao({ pedido: 'PED-1', itens: ITENS, pecas: PECAS, plano: PLANO, lista: lista(), setores: SETORES });
  assert.deepEqual([auto.por_partes.ativo, auto.partes.length, auto.partes[0].parte], [false, 1, PEDIDO_INTEIRO]);
});

test('peça do plano do tecido que não está mais na fila não derruba o documento', () => {
  const l = lista();
  l.data.plano_tecido[0].rolos[0].shelves[0].pecas.push({ ref: '99:999', largura: 0.5, altura: 1.2, rotacionado: true, ambiente: 'PARTE 9', ambiente_peca: 'Copa' });
  const d = montar({ lista: l });
  const faixa = d.tecido[0].larguras[1].rolos[0].faixas[0];
  assert.deepEqual(faixa.pecas, [{ id: 102 }, { id: 999, parte: 'PARTE 9', comodo: 'Copa', corte_altura_cm: 120, reservado_cm: 50, deitada: true }]);
});
