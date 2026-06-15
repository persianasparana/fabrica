/**
 * Atualiza os cortes dos produtos HORIZONTAIS já existentes no banco com a
 * parametrização correta (m², lâminas, furos, espaçamento, cordas, cadarço),
 * lendo de data/estrutura-produtos.json. Idempotente — pode rodar várias vezes.
 *
 * Uso: node bin/atualizar-horizontais.js
 *
 * Só toca nos 5 horizontais (por chave); não cria nem duplica produtos.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, '..', 'data', 'estrutura-produtos.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const CHAVES = ['ph-25mm', 'ph-50mm-aluminio', 'ph-50mm-mad-sintetica', 'ph-50mm-mad-natural', 'ph-50mm-pvc'];

let atualizados = 0, ausentes = [];
for (const chave of CHAVES) {
  const p = seed.produtos.find((x) => x.chave === chave);
  if (!p) { ausentes.push(chave + ' (não está no seed)'); continue; }
  const r = await pool.query(
    `UPDATE pcp_produtos
        SET cortes = $2::jsonb,
            unidade = COALESCE($3, unidade),
            calculo_extra_fonte = $4,
            updated_at = now()
      WHERE chave = $1`,
    [chave, JSON.stringify(p.cortes || []), p.unidade || 'm', p.calculo_extra_fonte || null]
  );
  if (r.rowCount > 0) { atualizados++; console.log(`✓ ${chave}: ${(p.cortes || []).length} cortes`); }
  else ausentes.push(chave + ' (não existe no banco)');
}

console.log(`\n${atualizados} horizontais atualizados.`);
if (ausentes.length) console.log('Não encontrados:', ausentes.join('; '));
await pool.end();
