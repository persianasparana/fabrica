/**
 * AMBIENTE da peça vinda do Comercial (26/11/2026) — sem banco, sem rede.
 * Nos pedidos montados com ambientes o nome vem de `pedido.ambientes[]` pelo `ambienteId` do item;
 * a coluna de texto `ambiente` do item é legada (nula nesses pedidos). É a MESMA regra do Comercial
 * (`nomeDoAmbiente`, v2.87.0) — o plano de corte do tecido do Núcleo (v14.98: uma largura de rolo por
 * ambiente) depende de o PCP mandar o ambiente certo de cada peça.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ambienteDoItemComercial } from '../src/nucleo-spec.js';
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
