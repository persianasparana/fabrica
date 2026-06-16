/**
 * Limpa TODA a fila de produção atual (transição / recomeço).
 *
 * Apaga: pcp_itens (cascata → pcp_pecas → pcp_peca_etapas) e pcp_ordem_corte_log.
 * PRESERVA: pcp_produtos (estrutura/fórmulas de corte), pcp_setores, pcp_status,
 * pcp_tipos, usuários e nao_conformidades (histórico de qualidade).
 *
 * Antes de apagar, grava um backup JSON em server/backups/fila-<timestamp>.json
 * com todos os itens e peças (rede de segurança, independente de pg_dump).
 *
 * Uso:
 *   node bin/limpar-fila.js            → apenas mostra o que SERIA apagado (dry-run)
 *   node bin/limpar-fila.js --sim      → faz o backup e apaga de fato
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const CONFIRMAR = process.argv.includes('--sim');
const here = path.dirname(fileURLToPath(import.meta.url));

async function contar(tabela) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${tabela}`);
  return rows[0].c;
}

const antes = {
  itens: await contar('pcp_itens'),
  pecas: await contar('pcp_pecas'),
  etapas: await contar('pcp_peca_etapas'),
  ordens_corte: await contar('pcp_ordem_corte_log'),
};

console.log('Fila de produção atual:');
console.log(`  itens ............. ${antes.itens}`);
console.log(`  peças ............. ${antes.pecas}`);
console.log(`  etapas de peça .... ${antes.etapas}`);
console.log(`  log ordem corte ... ${antes.ordens_corte}`);

if (!CONFIRMAR) {
  console.log('\n[DRY-RUN] Nada foi apagado. Para executar de fato, rode:');
  console.log('  node bin/limpar-fila.js --sim');
  await pool.end();
  process.exit(0);
}

// 1) Backup JSON (itens + peças) antes de qualquer DELETE.
const backupDir = path.join(here, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = path.join(backupDir, `fila-${stamp}.json`);

const { rows: itens } = await pool.query('SELECT * FROM pcp_itens ORDER BY id');
const { rows: pecas } = await pool.query('SELECT * FROM pcp_pecas ORDER BY id');
const { rows: etapas } = await pool.query('SELECT * FROM pcp_peca_etapas ORDER BY id');
const { rows: ordens } = await pool.query('SELECT * FROM pcp_ordem_corte_log ORDER BY id');
fs.writeFileSync(
  backupPath,
  JSON.stringify({ gerado_em: new Date().toISOString(), itens, pecas, etapas, ordens_corte: ordens }, null, 2)
);
console.log(`\n✓ Backup salvo em ${backupPath}`);

// 2) Limpeza dentro de uma transação. TRUNCATE de pcp_itens com CASCADE também
//    zera pcp_pecas e pcp_peca_etapas (FK ON DELETE CASCADE).
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('TRUNCATE pcp_itens RESTART IDENTITY CASCADE');
  await client.query('TRUNCATE pcp_ordem_corte_log RESTART IDENTITY');
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  console.error('\n✗ Erro ao limpar — nada foi alterado:', e.message);
  client.release();
  await pool.end();
  process.exit(1);
}
client.release();

const depois = {
  itens: await contar('pcp_itens'),
  pecas: await contar('pcp_pecas'),
  etapas: await contar('pcp_peca_etapas'),
  ordens_corte: await contar('pcp_ordem_corte_log'),
};

console.log('\n✓ Fila de produção limpa. Agora:');
console.log(`  itens ............. ${depois.itens}`);
console.log(`  peças ............. ${depois.pecas}`);
console.log(`  etapas de peça .... ${depois.etapas}`);
console.log(`  log ordem corte ... ${depois.ordens_corte}`);
console.log('\nPreservados: produtos/estrutura, setores, status, tipos, usuários e não-conformidades.');
console.log(`Para reverter, o conteúdo apagado está em ${backupPath}.`);

await pool.end();
