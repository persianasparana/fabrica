/**
 * Preenche largura/altura das PEÇAS a partir das observações do item, quando a
 * observação traz a medida no formato "0,985 x 2,37 m" (padrão das importações,
 * ex.: pedido 6715/ABI). Sem medida nas peças, a Ordem de Corte calcula tudo
 * com 0 e a ficha sai vazia.
 *
 * Armazena em CENTÍMETROS (convenção do sistema — a tela "Medidas das peças"
 * também grava cm; o motor converte para a unidade do produto ao calcular).
 *
 * Só preenche peças SEM medida (não sobrescreve o que foi digitado). Idempotente.
 *
 * Uso: node bin/preencher-medidas.js --pedido 6715            (aplica)
 *      node bin/preencher-medidas.js --pedido 6715 --dry-run  (só mostra)
 */
import 'dotenv/config';
import { pool } from '../src/db.js';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const iPed = args.indexOf('--pedido');
const pedido = iPed >= 0 ? args[iPed + 1] : null;
if (!pedido) {
  console.error('Informe o pedido: node bin/preencher-medidas.js --pedido 6715 [--dry-run]');
  process.exit(1);
}

const RE = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*m\b/i;
const paraCm = (s) => Math.round(parseFloat(String(s).replace(',', '.')) * 10000) / 100; // m → cm

const { rows } = await pool.query(
  `SELECT pp.id, pp.numero, pp.largura, pp.altura, i.observacoes, i.produto
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
    WHERE i.pedido = $1 ORDER BY i.id, pp.numero`, [pedido]
);
if (!rows.length) { console.log(`Pedido ${pedido}: nenhuma peça encontrada.`); await pool.end(); process.exit(0); }

let preenchidas = 0, jaTinham = 0, semPadrao = 0;
for (const p of rows) {
  if (p.largura != null && p.altura != null) { jaTinham++; continue; }
  const m = String(p.observacoes || '').match(RE);
  if (!m) { semPadrao++; console.log(`  · sem medida na observação: "${String(p.observacoes || '').slice(0, 60)}"`); continue; }
  const largura = paraCm(m[1]);
  const altura = paraCm(m[2]);
  console.log(`  ✓ peça ${p.id} → ${largura} × ${altura} cm  (${m[1]} x ${m[2]} m)`);
  if (!dry) await pool.query(`UPDATE pcp_pecas SET largura = $2, altura = $3 WHERE id = $1`, [p.id, largura, altura]);
  preenchidas++;
}

console.log(`\n${dry ? 'DRY-RUN — ' : ''}Pedido ${pedido}: ${preenchidas} peça(s) preenchidas, ${jaTinham} já tinham medida, ${semPadrao} sem padrão na observação.`);
await pool.end();
