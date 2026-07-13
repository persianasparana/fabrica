/**
 * Completa os COMPONENTES (demais materiais/BOM) dos produtos no banco a partir
 * do seed (data/estrutura-produtos.json — conferido contra a planilha oficial
 * ESTRUTURA DE PRODUTO.xlsx em 13/07/2026).
 *
 * Só ADICIONA componentes que faltam (casando pelo nome); nunca sobrescreve
 * quantidade/obs de componente que já existe no banco (edições preservadas).
 * Idempotente.
 *
 * Uso: node bin/preencher-componentes.js            (aplica)
 *      node bin/preencher-componentes.js --dry-run  (só mostra)
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
const porChave = new Map(seed.produtos.map((p) => [p.chave, p.componentes || []]));

const { rows } = await pool.query(`SELECT id, chave, nome, componentes FROM pcp_produtos WHERE ativo = TRUE ORDER BY nome`);
let produtos = 0, adicionados = 0;

for (const p of rows) {
  const doSeed = porChave.get(p.chave);
  if (!doSeed || !doSeed.length) continue;
  const atuais = Array.isArray(p.componentes) ? p.componentes : [];
  const nomes = new Set(atuais.map((c) => norm(c.nome)));
  const faltam = doSeed.filter((c) => !nomes.has(norm(c.nome)));
  if (!faltam.length) continue;
  for (const c of faltam) console.log(`  + ${p.nome}: ${c.nome} (${c.qtdFormula || c.qtd || 1}${c.obs ? ' · ' + c.obs : ''})`);
  const novos = atuais.concat(faltam);
  if (!dry) await pool.query(`UPDATE pcp_produtos SET componentes = $2::jsonb, updated_at = now() WHERE id = $1`, [p.id, JSON.stringify(novos)]);
  produtos++;
  adicionados += faltam.length;
}

console.log(`\n${dry ? 'DRY-RUN — ' : ''}${adicionados} componente(s) adicionados em ${produtos} produto(s).`);
await pool.end();
