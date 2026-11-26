/**
 * Lista de materiais — partes PURAS (sem banco, sem Núcleo): a divisão do lote em blocos e a
 * mescla das respostas. 26/11/2026 — o pedido nunca é partido (o plano de corte do tecido do
 * Núcleo v14.98 é por pedido, uma largura de rolo por ambiente) e o plano de cada pedido chega
 * inteiro ao resumo.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dividirEmBlocos, mesclarRespostas, LOTE_MAX, LOTE_PEDIDO_MAX } from '../src/lista-materiais.js';
import { pool } from '../src/db.js';

test.after(async () => { await pool.end(); });

/** peça do payload: `__pedido` é não enumerável, como em montarPayloadPedidos */
const peca = (pedido, n) => {
  const c = { ref: `${pedido}:${n}`, pedido };
  Object.defineProperty(c, '__pedido', { value: pedido, enumerable: false });
  return c;
};
const pedido = (nome, n) => Array.from({ length: n }, (_, i) => peca(nome, i + 1));
const pedidosDe = (bloco) => [...new Set(bloco.map((c) => c.__pedido))];

test('lote pequeno: um bloco só, na ordem', () => {
  const payload = [...pedido('A', 3), ...pedido('B', 2)];
  const blocos = dividirEmBlocos(payload);
  assert.equal(blocos.length, 1);
  assert.deepEqual(blocos[0].map((c) => c.ref), payload.map((c) => c.ref));
});

test('vários pedidos: o bloco fecha na FRONTEIRA do pedido (nenhum pedido partido)', () => {
  const payload = [...pedido('A', 100), ...pedido('B', 100), ...pedido('C', 100), ...pedido('D', 40)];
  const blocos = dividirEmBlocos(payload);
  assert.deepEqual(blocos.map((b) => b.length), [200, 140]);
  assert.deepEqual(blocos.map(pedidosDe), [['A', 'B'], ['C', 'D']]);
});

test('pedido maior que o bloco NÃO é partido — vai inteiro, sozinho', () => {
  const payload = [...pedido('A', 100), ...pedido('GRANDE', 310), ...pedido('C', 20)];
  const blocos = dividirEmBlocos(payload);
  assert.deepEqual(blocos.map((b) => b.length), [100, 310, 20]);
  assert.deepEqual(blocos.map(pedidosDe), [['A'], ['GRANDE'], ['C']]);
  assert.ok(310 > LOTE_MAX && 310 <= LOTE_PEDIDO_MAX);
});

test('pedido único grande (Ficha de um pedido de 300 peças): UMA chamada', () => {
  const blocos = dividirEmBlocos(pedido('P', 300));
  assert.equal(blocos.length, 1);
  assert.equal(blocos[0].length, 300);
});

test('só acima do teto do Núcleo o pedido se divide', () => {
  const blocos = dividirEmBlocos([...pedido('A', 10), ...pedido('ENORME', LOTE_PEDIDO_MAX + 5)]);
  assert.deepEqual(blocos.map((b) => b.length), [10, LOTE_PEDIDO_MAX, 5]);
  // teto informado na chamada (uso em teste): pedido de 7 com teto 3 → 3 + 3 + 1
  assert.deepEqual(dividirEmBlocos(pedido('X', 7), 5, 3).map((b) => b.length), [3, 3, 1]);
});

test('peças de pedidos INTERCALADAS (duas liberações ao mesmo tempo): cada pedido fica junto', () => {
  const a = pedido('A', 150), b = pedido('B', 150);
  const payload = [];
  for (let i = 0; i < 150; i += 1) payload.push(a[i], b[i]);
  const blocos = dividirEmBlocos(payload);
  assert.deepEqual(blocos.map((x) => x.length), [150, 150]);
  assert.deepEqual(blocos.map(pedidosDe), [['A'], ['B']]);
  assert.equal(blocos.flat().length, 300);
});

test('nenhuma peça se perde nem se repete', () => {
  const payload = [...pedido('A', 249), ...pedido('B', 2), ...pedido('C', 251), ...pedido('D', 1)];
  const blocos = dividirEmBlocos(payload);
  const refs = blocos.flat().map((c) => c.ref).sort();
  assert.deepEqual(refs, payload.map((c) => c.ref).sort());
  for (const bl of blocos) for (const ped of pedidosDe(bl)) {
    assert.equal(bl.filter((c) => c.__pedido === ped).length, payload.filter((c) => c.__pedido === ped).length, `pedido ${ped} inteiro num bloco`);
  }
});

test('mescla: um bloco devolve a própria resposta (com o plano de corte)', () => {
  const d = { pecas: [], plano_tecido: [{ pedido: 'A', colecao: 'X', rolos: [] }] };
  assert.equal(mesclarRespostas([d]), d);
});

test('mescla de blocos: o plano de corte de cada pedido chega inteiro; tecido somado por rolo', () => {
  const b1 = {
    pecas: [{ ref: '1:1', ok: true }], avisos: ['a'], totais: { pecas: 1, pecas_ok: 1, pecas_erro: 0, avulsos: 0 }, parametros: { consumo_tecido_pedido: true },
    materiais: [], perfis: [], tubos: [],
    tecido: [{ colecao: 'X', cor: 'BRANCO', largura_rolo: 2, metros: 3.5, bobinas: 1, sobra: 0, pecas: 1, refs: ['1:1'] }],
    plano_tecido: [{ pedido: 'A', colecao: 'X', cor: 'BRANCO', rolos: [{ largura_rolo: 2, comprimento: 3.5, shelves: [] }] }],
  };
  const b2 = {
    pecas: [{ ref: '2:1', ok: true }], avisos: [], totais: { pecas: 1, pecas_ok: 1, pecas_erro: 0, avulsos: 0 }, parametros: { consumo_tecido_pedido: true },
    materiais: [], perfis: [], tubos: [],
    tecido: [{ colecao: 'X', cor: 'BRANCO', largura_rolo: 2, metros: 1.75, bobinas: 1, sobra: 0, pecas: 1, refs: ['2:1'] }],
    plano_tecido: [{ pedido: 'B', colecao: 'X', cor: 'BRANCO', rolos: [{ largura_rolo: 2, comprimento: 1.75, shelves: [] }] }],
  };
  const m = mesclarRespostas([b1, b2]);
  assert.deepEqual(m.plano_tecido.map((t) => t.pedido), ['A', 'B']);
  assert.equal(m.tecido.length, 1);
  assert.equal(m.tecido[0].metros, 5.25);
  assert.equal(m.totais.pecas, 2);
  // Núcleo anterior à v14.98 (sem a chave): a mescla devolve lista vazia, nunca undefined
  const semChave = (b) => { const c = { ...b }; delete c.plano_tecido; return c; };
  assert.deepEqual(mesclarRespostas([semChave(b1), semChave(b2)]).plano_tecido, []);
});
