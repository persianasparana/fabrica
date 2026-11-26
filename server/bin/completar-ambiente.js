/**
 * Preenche o AMBIENTE das peças JÁ NA FILA, relendo cada pedido no Comercial.
 *
 * Para que serve: a liberação gravava o ambiente a partir de uma coluna antiga
 * do Comercial, que vem vazia nos orçamentos montados com ambientes — a Ficha
 * de Produção, a etiqueta e o Plano de Corte saíam sem ambiente. A liberação
 * foi corrigida (26/11/2026); este script acerta as peças liberadas antes.
 *
 * Seguro: só leitura no Comercial; no PCP só preenche o ambiente onde está
 * VAZIO (o que foi digitado na fila não é sobrescrito; rodar de novo não muda
 * nada). Não toca medidas, produto, coleção nem a fila.
 *
 * Uso (em server/):
 *   node bin/completar-ambiente.js                → preenche os itens ABERTOS
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
  completado: 'preenchidos',
  sem_ambiente_no_comercial: 'o item não tem ambiente no Comercial (fica vazio — é o que o pedido diz)',
  comercial_nao_respondeu: 'o Comercial não respondeu (rode de novo com ele no ar)',
  pedido_nao_esta_no_comercial: 'o pedido não existe mais no Comercial (nada a fazer)',
  pedido_sem_id_do_comercial: 'pedido sem o id do Comercial em pcp_pedido_info (liberado antes de 20/07 ou entrada manual)',
  item_nao_esta_no_pedido: 'item não está mais no pedido do Comercial',
};

let rc = 0;
try {
  const r = await completarAmbiente({ pedidos: pedidos.length ? pedidos : null, incluirConcluidos: args.includes('--concluidos'), simular });
  console.log(`${simular ? '[SIMULAÇÃO] ' : ''}Itens com o ambiente vazio: ${r.pendentes} (em ${r.pedidos} pedido(s))`);
  for (const [m, n] of Object.entries(r.por_motivo)) console.log(`  ${String(n).padStart(5)}  ${ROTULO[m] || m}`);
  for (const e of r.erros.filter((x) => !x.definitivo)) console.log(`  ⚠ ${e.pedido}: ${e.erro}`);
  if (!r.pendentes) console.log('  nada a preencher — todos os itens abertos já têm ambiente.');
  else if (simular) console.log('\nNada foi gravado. Para gravar, rode sem --simular.');
  else if (r.completados) console.log(`\n${r.completados} item(ns) com o ambiente preenchido. Ficha, etiqueta e Plano de Corte já mostram.`);
  else console.log('\nNenhum item preenchido.');
  // só o que DEPENDE de outra ação conta como pendência (saída 2: o deploy avisa, não aborta);
  // item sem ambiente no próprio Comercial não é pendência — é o dado do pedido
  const dependem = (r.por_motivo.comercial_nao_respondeu || 0) + (r.por_motivo.pedido_sem_id_do_comercial || 0);
  if (dependem > 0) rc = 2;
} catch (e) {
  console.error('ERRO:', e.message);
  rc = 1;
}
await pool.end();
process.exit(rc);
