// Teste do sequenciador PURO do planejamento de carga (P2, 06/11/2026).
// Rodar: node server/test/carga.test.mjs  (sem banco)
import assert from 'node:assert/strict';
import { sequenciar, diasUteis } from '../src/carga.js';

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('✓ ' + m); };

// 1) dias úteis: seg–sex a partir de uma sexta, 1 semana
const dias = diasUteis('2026-11-06', 1, [1, 2, 3, 4, 5]);
ok(dias.join(',') === '2026-11-06,2026-11-09,2026-11-10,2026-11-11,2026-11-12', 'dias úteis pulam o fim de semana (' + dias.join(',') + ')');

const setores = [
  { id: 10, nome: 'Corte', ordem: 10, capacidade_dia: 2 },
  { id: 20, nome: 'Montagem', ordem: 20, capacidade_dia: null },
];
const peca = (id, extra) => ({ peca_id: id, item_id: Math.ceil(id / 10), numero: id % 10 || 1, pedido: 'PED-' + Math.ceil(id / 10), produto: 'P' + id, roteiro: [10, 20], feitos: [], ...extra });

// 2) capacidade: 5 peças normais no Corte (2/dia) ocupam 3 dias; Montagem sem limite
let r = sequenciar({ inicio: '2026-11-09', semanas: 1, cfg: { dias_uteis: [1, 2, 3, 4, 5], folga_dias: 1 },
  setores, pecas: [11, 12, 21, 22, 31].map((id) => peca(id, { data_cliente: '2026-11-20' })) });
const corte = r.setores.find((s) => s.id === 10);
ok(corte.dias.map((d) => d.total).join(',') === '2,2,1,0,0', 'Corte 2/dia: 2,2,1 (' + corte.dias.map((d) => d.total).join(',') + ')');
ok(corte.dias.every((d) => !d.estourado) && corte.dias_estourados === 0, 'nada estourado dentro da capacidade');
const mont = r.setores.find((s) => s.id === 20);
ok(mont.capacidade_dia === null && mont.dias.map((d) => d.total).join(',') === '2,2,1,0,0', 'Montagem sem limite segue o dia do Corte (fila contínua)');
ok(r.totais.itens_atrasam === 0, 'ninguém atrasa com data 20/11');

// 3) prioridade: urgente com data tardia vai à frente da normal com data cedo; especial entre elas
r = sequenciar({ inicio: '2026-11-09', semanas: 1, cfg: { dias_uteis: [1, 2, 3, 4, 5], folga_dias: 1 }, setores: [{ id: 10, nome: 'Corte', ordem: 10, capacidade_dia: 1 }],
  pecas: [
    peca(11, { roteiro: [10], data_cliente: '2026-11-10', prioridade: 0 }),
    peca(21, { roteiro: [10], data_cliente: '2026-11-30', prioridade: 2 }),
    peca(31, { roteiro: [10], data_cliente: '2026-11-12', prioridade: 0, especial: true }),
    peca(41, { roteiro: [10], data_cliente: '2026-11-11', prioridade: 1 }),
  ] });
const ordem = r.setores[0].dias.map((d) => d.pecas.map((p) => p.peca_id).join('')).join(',');
ok(ordem === '21,41,31,11,', 'ordem = urgente > alta > especial > data (' + ordem + ')');
const p11 = r.pecas.find((p) => p.peca_id === 11);
ok(p11.previsao === '2026-11-12' && p11.atrasa === true && p11.data_limite === '2026-11-09', 'a normal empurrada para 12/11 atrasa (limite 10/11 − 1 = 09/11)');
ok(r.alertas.itens_atrasam.length === 1 && r.alertas.itens_atrasam[0].item_id === 2, 'alerta lista só o item que vai atrasar (alta e especial cabem no limite)');

// 4) etapa já feita não é programada; peça sem roteiro = alerta; além do horizonte
r = sequenciar({ inicio: '2026-11-09', semanas: 1, cfg: { dias_uteis: [1, 2, 3, 4, 5], folga_dias: 0 }, setores,
  pecas: [
    peca(11, { data_cliente: '2026-11-13', feitos: [10] }),
    peca(21, { roteiro: [], data_cliente: '2026-11-13' }),
    ...Array.from({ length: 12 }, (_, i) => peca(100 + i * 10 + 1, { data_cliente: '2026-11-13' })),
  ] });
ok(r.setores[0].dias[0].pecas.every((p) => p.peca_id !== 11) && r.pecas.find((p) => p.peca_id === 11).etapas.length === 1, 'peça com o Corte feito só passa pela Montagem');
const p21 = r.pecas.find((p) => p.peca_id === 21);
ok(r.alertas.sem_roteiro === 0 && r.alertas.roteiro_padrao === 1 && p21.roteiro_padrao && p21.roteiro.join(',') === '10,20', 'peça sem roteiro cadastrado passa por todos os setores (roteiro padrão) e conta no alerta');
const r0 = sequenciar({ inicio: '2026-11-09', semanas: 1, setores: [], pecas: [peca(11, { roteiro: [], data_cliente: '2026-11-13' })] });
ok(r0.alertas.sem_roteiro === 1 && r0.pecas[0].sem_roteiro && r0.pecas[0].previsao === null, 'sem setor ativo nenhum: peça fica sem roteiro');
const fora = r.pecas.filter((p) => p.alem_horizonte).length;
ok(fora === 3 && r.setores[0].alem_horizonte === 3 && r.alertas.setores_estourados.some((s) => s.id === 10), '13 peças a 2/dia em 5 dias: 3 ficam além do horizonte e o setor é alertado (' + fora + ')');
ok(r.pecas.filter((p) => p.alem_horizonte).every((p) => p.atrasa && p.previsao === null), 'peça além do horizonte atrasa sem previsão');

// 5) sem data prometida: nunca "atrasa", mas conta em sem_data
r = sequenciar({ inicio: '2026-11-09', semanas: 1, setores, pecas: [peca(11, { data_cliente: null })] });
ok(r.alertas.sem_data === 1 && r.totais.itens_atrasam === 0, 'item sem data não atrasa e aparece em sem_data');

// 6) pureza: a entrada não é mutada
const entrada = { inicio: '2026-11-09', semanas: 1, setores, pecas: [peca(11, { data_cliente: '2026-11-13' })] };
const antes = JSON.stringify(entrada);
sequenciar(entrada);
ok(JSON.stringify(entrada) === antes, 'sequenciar não muta a entrada');

console.log(`${n} checagens OK`);
