/**
 * Completa a especificação das peças JÁ NA FILA com "como a peça foi cotada"
 * (`spec_nucleo.cotacao`), relendo cada pedido no Comercial (v2.140.1+).
 *
 * Para que serve: a lista de materiais do PCP passou a pedir a peça ao Núcleo
 * COMO A VENDA COTOU (seleção automática, somente tecido, tubo equiparado).
 * Peças liberadas antes disso não têm essa informação — sem ela a lista segue
 * pela estrutura gravada na venda (tubo 47 na peça da linha "tubo 53"; troca de
 * tela listada como peça inteira). Este script busca a informação no Comercial
 * e a ACRESCENTA à spec, só onde falta.
 *
 * Seguro: só leitura no Comercial; no PCP só acrescenta a chave `cotacao` onde
 * ela não existe (rodar de novo não muda nada). Não apaga nem altera medidas,
 * produto, coleção ou fila.
 *
 * Uso (em server/):
 *   node bin/completar-spec-nucleo.js                → completa os itens ABERTOS
 *   node bin/completar-spec-nucleo.js --simular      → só mostra o que faria
 *   node bin/completar-spec-nucleo.js --pedido PED-2026/0123 [--pedido …]
 *   node bin/completar-spec-nucleo.js --concluidos   → inclui itens já concluídos
 */
import 'dotenv/config';
import { pool } from '../src/db.js';
import { completarSpecNucleo } from '../src/completar-spec.js';

const args = process.argv.slice(2);
const pedidos = [];
for (let i = 0; i < args.length; i += 1) if (args[i] === '--pedido' && args[i + 1]) pedidos.push(String(args[i + 1]).trim());
const simular = args.includes('--simular');

const ROTULO = {
  completado: 'completados',
  comercial_sem_o_campo: 'o Comercial ainda não manda `nucleoCotacao` (precisa da v2.140.1 — aplique-a e rode de novo)',
  comercial_nao_respondeu: 'o Comercial não respondeu (rode de novo com ele no ar)',
  pedido_nao_esta_no_comercial: 'o pedido não existe mais no Comercial (nada a fazer)',
  pedido_sem_id_do_comercial: 'pedido sem o id do Comercial em pcp_pedido_info (liberado antes de 20/07 ou entrada manual)',
  item_nao_esta_no_pedido: 'item não está mais no pedido do Comercial',
  tipo_mudou_no_comercial: 'o tipo de peça mudou no Comercial depois da liberação (fica a estrutura gravada)',
};

let rc = 0;
try {
  const r = await completarSpecNucleo({ pedidos: pedidos.length ? pedidos : null, incluirConcluidos: args.includes('--concluidos'), simular });
  console.log(`${simular ? '[SIMULAÇÃO] ' : ''}Itens sem "como a peça foi cotada": ${r.pendentes} (em ${r.pedidos} pedido(s))`);
  for (const [m, n] of Object.entries(r.por_motivo)) console.log(`  ${String(n).padStart(5)}  ${ROTULO[m] || m}`);
  for (const e of r.erros.filter((x) => !x.definitivo)) console.log(`  ⚠ ${e.pedido}: ${e.erro}`);
  if (!r.pendentes) console.log('  nada a completar — todos os itens abertos já trazem a informação.');
  else if (simular) console.log('\nNada foi gravado. Para gravar, rode sem --simular.');
  else if (r.completados) console.log(`\n${r.completados} item(ns) completado(s). A lista de materiais (Ficha / Necessidade) já usa a informação.`);
  else console.log('\nNenhum item completado.');
  // pendência que DEPENDE de outra ação = saída 2 (o deploy avisa, não aborta)
  const semSaida = (r.por_motivo.pedido_nao_esta_no_comercial || 0) + (r.por_motivo.item_nao_esta_no_pedido || 0) + (r.por_motivo.tipo_mudou_no_comercial || 0);
  if (r.pendentes - r.completados - semSaida > 0) rc = 2;
} catch (e) {
  console.error('ERRO:', e.message);
  rc = 1;
}
await pool.end();
process.exit(rc);
