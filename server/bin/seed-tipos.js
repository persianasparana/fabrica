/**
 * Cadastra os tipos de entrada de pedido usados pela Persianas Paraná.
 * Idempotente: só insere o que faltar (ON CONFLICT (nome) DO NOTHING) — não
 * altera cor/ordem de tipos já existentes nem mexe em qual é o padrão.
 *
 * Cores agrupadas por categoria (paleta da marca + tons funcionais):
 *   Vendas → verde · Garantia → azul · Retrabalho → laranja · RPN → índigo ·
 *   Cancelados/Devolução → cinza · Higienização/Serviço → teal · demais → dourado/preto.
 *
 * Uso: node bin/seed-tipos.js
 */
import 'dotenv/config';
import { pool } from '../src/db.js';

// [nome, cor]; a ordem do array vira a ordem de exibição (a partir de 100).
const TIPOS = [
  ['Comodato',                    '#C6B784'],
  ['Cortesia',                    '#A89760'],
  ['Devolução',                   '#606060'],
  ['Entrega Futura',              '#3949AB'],
  ['Garantia',                    '#0D47A1'],
  ['Garantia Total',              '#1565C0'],
  ['Higienização',                '#00838F'],
  ['Orc Cancelado',               '#9CA3AF'],
  ['Pçs Manuais/Motor-Item',      '#56554F'],
  ['Pçs Manuais/Motor-Total',     '#383834'],
  ['Pçs S/Inst S/Garantia',       '#6B7280'],
  ['Pçs Toldos',                  '#2F2F2C'],
  ['Provisórias',                 '#A89760'],
  ['Recal',                       '#E65100'],
  ['Retrab. Conta Cliente',       '#EF6C00'],
  ['Retrabalho Comercial',        '#E65100'],
  ['Retrabalho Fábrica',          '#D84315'],
  ['Retrabalho Fornecedor',       '#F4511E'],
  ['Retrabalho Garantia',         '#BF360C'],
  ['Retrabalho Instalação',       '#FF7043'],
  ['Revenda',                     '#2E7D32'],
  ['RPNF',                        '#3949AB'],
  ['RPNG',                        '#303F9F'],
  ['RPNL',                        '#283593'],
  ['RPNP',                        '#1A237E'],
  ['RPNV',                        '#3F51B5'],
  ['RPNV Cancelado',              '#9CA3AF'],
  ['Serviço',                     '#00695C'],
  ['Teste de Fábrica',            '#1D1D1B'],
  ['Venda',                       '#2E7D32'],
  ['Venda Ideal',                 '#1B5E20'],
  ['Venda Ideal S/ Inst e Gar',   '#388E3C'],
  ['Venda S/Inst e Garantia',     '#43A047'],
];

let inseridos = 0;
const jaExistiam = [];
let ordem = 100;
for (const [nome, cor] of TIPOS) {
  const r = await pool.query(
    `INSERT INTO pcp_tipos (nome, cor, ordem, padrao)
     VALUES ($1, $2, $3, FALSE)
     ON CONFLICT (nome) DO NOTHING RETURNING id`,
    [nome, cor, ordem]
  );
  if (r.rowCount > 0) { inseridos++; console.log(`✓ ${nome}`); }
  else jaExistiam.push(nome);
  ordem += 10;
}

console.log(`\n${inseridos} tipos cadastrados.`);
if (jaExistiam.length) console.log(`Já existiam (mantidos): ${jaExistiam.join(', ')}`);
console.log('\nObs.: o tipo padrão e os tipos genéricos pré-existentes não foram alterados.');
console.log('Defina o padrão e remova os que não usa pela tela "Tipos de Produção".');

await pool.end();
