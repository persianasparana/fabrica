/**
 * Relê o AMBIENTE das peças JÁ NA FILA em cada pedido do Comercial.
 *
 * Para que serve:
 *  · 26/11/2026 — nos pedidos montados com ambientes o nome do ambiente vem de
 *    `pedido.ambientes[]` (pelo `ambienteId` do item) e a liberação lia a coluna de texto
 *    legada: as peças ficaram SEM ambiente no PCP;
 *  · 27/11/2026 — quando o vendedor usa os ambientes do pedido como agrupamento ("PARTE 1…8")
 *    e escreve o cômodo no Ambiente da própria peça, o cômodo é o da PEÇA: ele passa a ser o
 *    `ambiente` do item (Ficha, etiqueta e o plano de corte do tecido — Núcleo v14.100, uma
 *    largura de rolo por CÔMODO) e o bloco do pedido vai para `grupo_pedido`.
 * Este script busca os dois no Comercial e grava nos itens liberados antes.
 *
 * Seguro: só leitura no Comercial; no PCP o `ambiente` só é trocado quando está vazio ou é o
 * nome do bloco do pedido (o que a própria liberação gravou) — o que alguém digitou no modal
 * "Ver" fica. Item já relido não entra de novo (rodar outra vez não muda nada).
 *
 * Uso (em server/):
 *   node bin/completar-ambiente.js                → relê os itens ABERTOS ainda não relidos
 *   node bin/completar-ambiente.js --simular      → só mostra o que faria
 *   node bin/completar-ambiente.js --pedido PED-2026/0123 [--pedido …]
 *   node bin/completar-ambiente.js --concluidos   → inclui itens já concluídos
 *   node bin/completar-ambiente.js --detalhe      → lista item a item o que mudou
 */
import 'dotenv/config';
import { pool } from '../src/db.js';
import { completarAmbiente } from '../src/completar-ambiente.js';

const args = process.argv.slice(2);
const pedidos = [];
for (let i = 0; i < args.length; i += 1) if (args[i] === '--pedido' && args[i + 1]) pedidos.push(String(args[i + 1]).trim());
const simular = args.includes('--simular');

const ROTULO = {
  trocado: 'o ambiente passou a ser o cômodo escrito na peça (ou o nome do bloco, onde estava vazio)',
  marcado: 'o ambiente já estava certo — ganharam o grupo do pedido e a origem',
  sem_ambiente_no_comercial: 'o item não tem ambiente no pedido do Comercial (orçamento montado sem ambientes) — segue sem',
  comercial_nao_respondeu: 'o Comercial não respondeu (rode de novo com ele no ar)',
  pedido_sem_id_do_comercial: 'pedido sem o id do Comercial em pcp_pedido_info (liberado antes de 20/07 ou entrada manual)',
  item_nao_esta_no_pedido: 'item não está mais no pedido do Comercial',
};

let rc = 0;
try {
  const r = await completarAmbiente({ pedidos: pedidos.length ? pedidos : null, incluirConcluidos: args.includes('--concluidos'), simular });
  console.log(`${simular ? '[SIMULAÇÃO] ' : ''}Itens ainda não relidos no Comercial: ${r.pendentes} (em ${r.pedidos} pedido(s))`);
  for (const [m, n] of Object.entries(r.por_motivo)) console.log(`  ${String(n).padStart(5)}  ${ROTULO[m] || m}`);
  for (const e of r.erros) console.log(`  ⚠ ${e.pedido}: ${e.erro}`);
  if (args.includes('--detalhe')) {
    const trocados = r.detalhes.filter((x) => x.acao === 'trocado');
    for (const d of trocados.slice(0, 200)) console.log(`    ${d.pedido} · item ${d.item_id}: «${d.antes || '(vazio)'}» → «${d.ambiente}»${d.grupo_pedido && d.grupo_pedido !== d.ambiente ? ` (grupo «${d.grupo_pedido}»)` : ''}`);
    if (trocados.length > 200) console.log(`    … e mais ${trocados.length - 200} (use --pedido para ver um pedido só)`);
  }
  if (!r.pendentes) console.log('  nada a reler — todos os itens abertos vindos do Comercial já têm o ambiente conferido.');
  else if (simular) console.log('\nNada foi gravado. Para gravar, rode sem --simular.');
  else if (r.completados) console.log(`\n${r.completados} item(ns) relido(s); em ${r.trocados} o ambiente mudou. A Ficha, a etiqueta e o plano de corte do tecido já usam o cômodo da peça.`);
  else console.log('\nNenhum item alterado.');
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
