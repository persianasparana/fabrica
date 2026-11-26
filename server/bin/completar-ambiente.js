/**
 * Completa o AMBIENTE das peças JÁ NA FILA, relendo cada pedido no Comercial.
 *
 * Para que serve: nos pedidos montados com ambientes o nome do ambiente vem de
 * `pedido.ambientes[]` (pelo `ambienteId` do item) e a liberação, até 26/11/2026,
 * lia a coluna de texto legada — as peças ficaram SEM ambiente no PCP. Sem ele a
 * Ficha e a etiqueta não mostram o cômodo e o plano de corte do tecido (Núcleo
 * v14.98: uma largura de rolo por ambiente) trata o pedido inteiro como um
 * ambiente só. Este script busca o nome no Comercial e o grava, só onde falta.
 *
 * Seguro: só leitura no Comercial; no PCP só preenche `ambiente` onde ele está
 * vazio (rodar de novo não muda nada; o que alguém digitou no modal "Ver" fica).
 *
 * Uso (em server/):
 *   node bin/completar-ambiente.js                → completa os itens ABERTOS
 *   node bin/completar-ambiente.js --simular      → só mostra o que faria
 *   node bin/completar-ambiente.js --pedido PED-2026/0123 [--pedido …]
 *   node bin/completar-ambiente.js --concluidos   → inclui itens já concluídos
 */
import 'dotenv/config';
import { pool } from '../src/db.js';
import { completarAmbiente } from '../src/completar-ambiente.js';

const args = process.argv.slice(2);
const pedidos = [];
for (let i = 0; i < args.length; i += 1) if (args[i] === '--pedido' && args[i + 1]) pedidos.push(String(args[i + 1]).trim());
const simular = args.includes('--simular');

const ROTULO = {
  completado: 'completados',
  sem_ambiente_no_comercial: 'o item não tem ambiente no pedido do Comercial (orçamento montado sem ambientes) — segue sem',
  comercial_nao_respondeu: 'o Comercial não respondeu (rode de novo com ele no ar)',
  pedido_sem_id_do_comercial: 'pedido sem o id do Comercial em pcp_pedido_info (liberado antes de 20/07 ou entrada manual)',
  item_nao_esta_no_pedido: 'item não está mais no pedido do Comercial',
};

let rc = 0;
try {
  const r = await completarAmbiente({ pedidos: pedidos.length ? pedidos : null, incluirConcluidos: args.includes('--concluidos'), simular });
  console.log(`${simular ? '[SIMULAÇÃO] ' : ''}Itens sem ambiente: ${r.pendentes} (em ${r.pedidos} pedido(s))`);
  for (const [m, n] of Object.entries(r.por_motivo)) console.log(`  ${String(n).padStart(5)}  ${ROTULO[m] || m}`);
  for (const e of r.erros) console.log(`  ⚠ ${e.pedido}: ${e.erro}`);
  if (!r.pendentes) console.log('  nada a completar — todos os itens abertos vindos do Comercial já têm ambiente.');
  else if (simular) console.log('\nNada foi gravado. Para gravar, rode sem --simular.');
  else if (r.completados) console.log(`\n${r.completados} item(ns) completado(s). A Ficha, a etiqueta e o plano de corte do tecido já usam o ambiente.`);
  else console.log('\nNenhum item completado.');
  // pendência que DEPENDE de outra ação (Comercial fora, pedido sem id) = saída 2 (o deploy avisa, não aborta);
  // item que simplesmente não tem ambiente no Comercial não é pendência
  const dependem = (r.por_motivo.comercial_nao_respondeu || 0) + (r.por_motivo.pedido_sem_id_do_comercial || 0);
  if (dependem) rc = 2;
} catch (e) {
  console.error('ERRO:', e.message);
  rc = 1;
}
await pool.end();
process.exit(rc);
