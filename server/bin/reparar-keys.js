/**
 * Repara as KEYS dos cortes na Estrutura do Produto (banco), sem perder edições.
 *
 * Bug corrigido em 13/07/2026: o editor da Estrutura descartava o campo `key`
 * dos cortes ao salvar. As fórmulas dos horizontais referenciam cortes pela key
 * (furos, modelo, esp_furo, furo_central...) — sem a key, a Ordem de Corte cai
 * em "Variável desconhecida: furos". Este script devolve a key (e a unidade)
 * casando cada corte PELO NOME com o produto correspondente do seed
 * (data/estrutura-produtos.json), preservando setor_id/barra/fórmulas editadas.
 *
 * Idempotente. Uso:
 *   node bin/reparar-keys.js            (aplica)
 *   node bin/reparar-keys.js --dry-run  (só mostra)
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'estrutura-produtos.json'), 'utf8'));
const dry = process.argv.includes('--dry-run');

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// índice do seed: chave do produto -> (nome normalizado do corte -> {key, unidade})
const porChave = new Map();
for (const p of seed.produtos) {
  const m = new Map();
  for (const c of (p.cortes || [])) if (c.key) m.set(norm(c.nome), { key: c.key, unidade: c.unidade || null });
  porChave.set(p.chave, m);
}

const { rows } = await pool.query(`SELECT id, chave, nome, cortes FROM pcp_produtos WHERE ativo = TRUE`);
let produtos = 0, keys = 0;
const semPar = [];

for (const p of rows) {
  const mapa = porChave.get(p.chave);
  if (!mapa || !mapa.size) continue;
  const cortes = Array.isArray(p.cortes) ? p.cortes : [];
  let mudou = false;
  for (const c of cortes) {
    if (c.key) continue;                       // já tem
    const ref = mapa.get(norm(c.nome));
    if (!ref) { if (String(c.formula || '').match(/[a-z_]{3,}/i)) semPar.push(`${p.nome} → ${c.nome}`); continue; }
    c.key = ref.key;
    if (ref.unidade && c.unidade == null) c.unidade = ref.unidade;
    mudou = true; keys++;
  }
  if (mudou) {
    produtos++;
    console.log(`✓ ${p.chave} (${p.nome}): keys restauradas`);
    if (!dry) await pool.query(`UPDATE pcp_produtos SET cortes = $2::jsonb, updated_at = now() WHERE id = $1`, [p.id, JSON.stringify(cortes)]);
  }
}

console.log(`\n${dry ? 'DRY-RUN — ' : ''}${keys} key(s) restauradas em ${produtos} produto(s).`);
if (semPar.length) {
  console.log('Cortes sem par no seed (confira manualmente se a fórmula referencia outro corte):');
  for (const s of [...new Set(semPar)]) console.log('  · ' + s);
}
await pool.end();
