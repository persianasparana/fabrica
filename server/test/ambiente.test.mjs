/**
 * AMBIENTE da peça vinda do Comercial (26/11/2026) — sem banco, sem rede.
 * Nos pedidos montados com ambientes o nome vem de `pedido.ambientes[]` pelo `ambienteId` do item;
 * a coluna de texto `ambiente` do item é legada (nula nesses pedidos). É a MESMA regra do Comercial
 * (`nomeDoAmbiente`, v2.87.0) — o plano de corte do tecido do Núcleo (v14.98: uma largura de rolo por
 * ambiente) depende de o PCP mandar o ambiente certo de cada peça.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ambienteDoItemComercial, ambienteDaPecaComercial, ambienteParaONucleo, ambienteParaReler, mesmoTexto, corposDaPeca,
} from '../src/nucleo-spec.js';
import { ambienteParaCompletar } from '../src/completar-ambiente.js';
import { pool } from '../src/db.js';

test.after(async () => { await pool.end(); });

const AMBIENTES = [
  { id: 'a1', nome: 'SALA 1', ordem: 0 },
  { id: 'a2', nome: '  Recepção  ', ordem: 1 },
  { id: 'a3', nome: '   ', ordem: 2 },
];

test('pedido montado com ambientes: o nome vem de ambientes[] pelo ambienteId', () => {
  assert.equal(ambienteDoItemComercial({ ambienteId: 'a1', ambiente: null }, AMBIENTES), 'SALA 1');
  assert.equal(ambienteDoItemComercial({ ambienteId: 'a2' }, AMBIENTES), 'Recepção');
});

test('o ambiente do pedido vence o texto legado da peça', () => {
  assert.equal(ambienteDoItemComercial({ ambienteId: 'a1', ambiente: 'NOME VELHO' }, AMBIENTES), 'SALA 1');
});

test('sem ambienteId (orçamento antigo): vale o texto da peça', () => {
  assert.equal(ambienteDoItemComercial({ ambienteId: null, ambiente: ' COZINHA ' }, AMBIENTES), 'COZINHA');
  assert.equal(ambienteDoItemComercial({ ambiente: 'HALL' }, undefined), 'HALL');
});

test('ambienteId que não existe mais / ambiente sem nome: cai no texto; sem texto → null', () => {
  assert.equal(ambienteDoItemComercial({ ambienteId: 'sumiu', ambiente: 'HALL' }, AMBIENTES), 'HALL');
  assert.equal(ambienteDoItemComercial({ ambienteId: 'sumiu', ambiente: null }, AMBIENTES), null);
  assert.equal(ambienteDoItemComercial({ ambienteId: 'a3' }, AMBIENTES), null);
  assert.equal(ambienteDoItemComercial({ ambiente: '   ' }, AMBIENTES), null);
  assert.equal(ambienteDoItemComercial({}, AMBIENTES), null);
  assert.equal(ambienteDoItemComercial(null, AMBIENTES), null);
});

test('id numérico × texto: compara como texto', () => {
  assert.equal(ambienteDoItemComercial({ ambienteId: 7 }, [{ id: '7', nome: 'Suíte' }]), 'Suíte');
});

test('completar a fila: só preenche o que está VAZIO', () => {
  const item = { id: 'i1', ambienteId: 'a1', ambiente: null };
  assert.deepEqual(ambienteParaCompletar(null, item, AMBIENTES), { ambiente: 'SALA 1' });
  assert.deepEqual(ambienteParaCompletar('   ', item, AMBIENTES), { ambiente: 'SALA 1' });
  // o que alguém digitou no modal "Ver" da fila nunca é trocado
  assert.deepEqual(ambienteParaCompletar('Sala (digitado no PCP)', item, AMBIENTES), { motivo: 'ja_tem' });
});

test('completar a fila: sem o que gravar → diz o motivo', () => {
  assert.deepEqual(ambienteParaCompletar(null, undefined, AMBIENTES), { motivo: 'item_nao_esta_no_pedido' });
  assert.deepEqual(ambienteParaCompletar(null, { id: 'i2', ambienteId: null, ambiente: null }, AMBIENTES), { motivo: 'sem_ambiente_no_comercial' });
  assert.deepEqual(ambienteParaCompletar(null, { id: 'i3', ambienteId: 'a3' }, AMBIENTES), { motivo: 'sem_ambiente_no_comercial' });
});

test('completar a fila: o nome cabe na coluna (120)', () => {
  const longo = 'A'.repeat(200);
  const r = ambienteParaCompletar('', { ambienteId: 'x' }, [{ id: 'x', nome: longo }]);
  assert.equal(r.ambiente.length, 120);
});

// ─── 27/11/2026 — o CÔMODO é o Ambiente escrito na peça; o bloco do pedido vira grupo ───────────
// Pedido do cliente (proposta 2026/1348: 350 peças lançadas em 8 "PARTES", com o cômodo escrito no
// Ambiente de cada peça). Decisão: se a peça tem o Ambiente preenchido, ele é o cômodo.

const PARTES = [{ id: 'p1', nome: 'PARTE 1' }, { id: 'p2', nome: ' PARTE  2 ' }];

test('liberação: o texto da peça é o ambiente; o bloco do pedido vai para o grupo', () => {
  assert.deepEqual(
    ambienteDaPecaComercial({ ambienteId: 'p1', ambiente: ' Térreo - Portaria  Recepção - 01 ' }, PARTES),
    { ambiente: 'Térreo - Portaria Recepção - 01', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca' },
  );
  // o número da janela NÃO é tirado aqui: quem decide o que é o mesmo cômodo é o Núcleo
  assert.equal(ambienteDaPecaComercial({ ambienteId: 'p2', ambiente: 'Sala - 02' }, PARTES).ambiente, 'Sala - 02');
  assert.equal(ambienteDaPecaComercial({ ambienteId: 'p2', ambiente: 'Sala - 02' }, PARTES).grupo_pedido, 'PARTE 2');
});

test('liberação: peça sem o campo → o ambiente do pedido, como antes', () => {
  assert.deepEqual(ambienteDaPecaComercial({ ambienteId: 'p1', ambiente: null }, PARTES), { ambiente: 'PARTE 1', grupo_pedido: 'PARTE 1', ambiente_origem: 'bloco' });
  assert.deepEqual(ambienteDaPecaComercial({ ambienteId: 'p1', ambiente: '   ' }, PARTES), { ambiente: 'PARTE 1', grupo_pedido: 'PARTE 1', ambiente_origem: 'bloco' });
  // o vendedor repetiu o nome do bloco na peça: é o bloco (não um cômodo escrito)
  assert.deepEqual(ambienteDaPecaComercial({ ambienteId: 'p1', ambiente: 'parte 1' }, PARTES), { ambiente: 'PARTE 1', grupo_pedido: 'PARTE 1', ambiente_origem: 'bloco' });
});

test('liberação: pedido sem blocos → o texto da peça, sem grupo; sem nada → tudo nulo', () => {
  assert.deepEqual(ambienteDaPecaComercial({ ambienteId: null, ambiente: 'Cozinha' }, []), { ambiente: 'Cozinha', grupo_pedido: null, ambiente_origem: 'peca' });
  assert.deepEqual(ambienteDaPecaComercial({ ambienteId: 'sumiu', ambiente: 'Hall' }, PARTES), { ambiente: 'Hall', grupo_pedido: null, ambiente_origem: 'peca' });
  assert.deepEqual(ambienteDaPecaComercial({}, PARTES), { ambiente: null, grupo_pedido: null, ambiente_origem: null });
  assert.deepEqual(ambienteDaPecaComercial(null, PARTES), { ambiente: null, grupo_pedido: null, ambiente_origem: null });
});

test('mesmoTexto: caixa, acento e espaço não separam', () => {
  assert.equal(mesmoTexto(' Recepção ', 'RECEPCAO'), true);
  assert.equal(mesmoTexto('Sala 1', 'Sala 2'), false);
  assert.equal(mesmoTexto(null, ''), true);
});

test('o que vai ao Núcleo: o grupo em `ambiente` e o cômodo escrito em `ambiente_peca`', () => {
  assert.deepEqual(
    ambienteParaONucleo({ ambiente: 'Térreo - Recepção - 01', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca' }),
    { ambiente: 'PARTE 1', ambiente_peca: 'Térreo - Recepção - 01' },
  );
  // ambiente = o próprio bloco: só `ambiente` (o Núcleo não tira número de nome de bloco)
  assert.deepEqual(ambienteParaONucleo({ ambiente: 'Suíte - 2', grupo_pedido: 'Suíte - 2', ambiente_origem: 'bloco' }), { ambiente: 'Suíte - 2' });
  // cômodo escrito na peça e pedido sem blocos: o texto vai nos DOIS (Núcleo anterior segue pelo `ambiente`)
  assert.deepEqual(ambienteParaONucleo({ ambiente: 'Sala - 01', grupo_pedido: null, ambiente_origem: 'peca' }), { ambiente: 'Sala - 01', ambiente_peca: 'Sala - 01' });
  // item liberado antes desta entrega e ainda não relido: como até hoje
  assert.deepEqual(ambienteParaONucleo({ ambiente: 'PARTE 3', grupo_pedido: null, ambiente_origem: null }), { ambiente: 'PARTE 3' });
  assert.deepEqual(ambienteParaONucleo({ ambiente: null, grupo_pedido: null, ambiente_origem: null }), {});
  assert.deepEqual(ambienteParaONucleo({ ambiente: '  ', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca' }), { ambiente: 'PARTE 1' });
});

test('o corpo da peça leva os dois campos (e a reserva também)', () => {
  const item = { id: 7, produto_sku: 'soft', colecao: 'AM 3059', ambiente: 'Recepção - 01', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca', atributos: {}, spec_nucleo: { tecido_sku: 't0', cotacao: { produto: '__auto' } } };
  const amb = ambienteParaONucleo(item);
  const { corpo, reserva } = corposDaPeca(item, { id: 70, largura: 120, altura: 160 }, { ref: '7:70', ambiente: amb.ambiente, ambientePeca: amb.ambiente_peca });
  assert.equal(corpo.ambiente, 'PARTE 1');
  assert.equal(corpo.ambiente_peca, 'Recepção - 01');
  assert.ok(reserva, 'a peça cotada no automático tem a reserva com os códigos gravados');
  assert.equal(reserva.ambiente, 'PARTE 1');
  assert.equal(reserva.ambiente_peca, 'Recepção - 01');
  // sem o campo novo o corpo não ganha a chave (JSON igual ao de antes)
  const antigo = corposDaPeca({ ...item, ambiente_origem: null }, { id: 70, largura: 120, altura: 160 }, { ref: '7:70', ambiente: 'PARTE 1' }).corpo;
  assert.equal('ambiente_peca' in JSON.parse(JSON.stringify(antigo)), false);
});

test('reler a fila: o nome do bloco gravado pela liberação de 26/11 dá lugar ao cômodo da peça', () => {
  const doComercial = { id: 'i1', ambienteId: 'p1', ambiente: 'Térreo - Recepção - 01' };
  assert.deepEqual(
    ambienteParaReler({ ambiente: 'PARTE 1', grupo_pedido: null, ambiente_origem: null }, doComercial, PARTES),
    { ambiente: 'Térreo - Recepção - 01', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca', trocou: true },
  );
  // vazio: idem
  assert.equal(ambienteParaReler({ ambiente: null, ambiente_origem: null }, doComercial, PARTES).ambiente, 'Térreo - Recepção - 01');
  // peça sem texto: o bloco fica e só ganha a marca
  assert.deepEqual(
    ambienteParaReler({ ambiente: 'PARTE 1', ambiente_origem: null }, { id: 'i2', ambienteId: 'p1', ambiente: null }, PARTES),
    { ambiente: 'PARTE 1', grupo_pedido: 'PARTE 1', ambiente_origem: 'bloco', trocou: false },
  );
});

test('reler a fila: o que alguém digitou no PCP nunca é trocado', () => {
  const doComercial = { id: 'i1', ambienteId: 'p1', ambiente: 'Térreo - Recepção - 01' };
  assert.deepEqual(
    ambienteParaReler({ ambiente: 'Recepção (digitado no PCP)', ambiente_origem: null }, doComercial, PARTES),
    { ambiente: 'Recepção (digitado no PCP)', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca', trocou: false },
  );
  // liberação anterior a 26/11 (gravava o texto cru da peça): fica, marcado como da peça
  assert.deepEqual(
    ambienteParaReler({ ambiente: 'Térreo - Recepção - 01', ambiente_origem: null }, doComercial, PARTES),
    { ambiente: 'Térreo - Recepção - 01', grupo_pedido: 'PARTE 1', ambiente_origem: 'peca', trocou: false },
  );
});

test('reler a fila: já relido / sem o que gravar → diz o motivo; o texto cabe na coluna', () => {
  assert.deepEqual(ambienteParaReler({ ambiente: 'X', ambiente_origem: 'peca' }, { id: 'i1', ambienteId: 'p1' }, PARTES), { motivo: 'ja_tem' });
  assert.deepEqual(ambienteParaReler({ ambiente: 'X', ambiente_origem: 'bloco' }, { id: 'i1', ambienteId: 'p1' }, PARTES), { motivo: 'ja_tem' });
  assert.deepEqual(ambienteParaReler({ ambiente: null, ambiente_origem: null }, undefined, PARTES), { motivo: 'item_nao_esta_no_pedido' });
  assert.deepEqual(ambienteParaReler({ ambiente: null, ambiente_origem: null }, { id: 'i2', ambienteId: null, ambiente: null }, PARTES), { motivo: 'sem_ambiente_no_comercial' });
  const longo = 'C'.repeat(200);
  const r = ambienteParaReler({ ambiente: '', ambiente_origem: null }, { id: 'i3', ambienteId: 'p1', ambiente: longo }, PARTES);
  assert.equal(r.ambiente.length, 120);
  assert.equal(r.ambiente_origem, 'peca');
});
