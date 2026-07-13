/**
 * Preenche a metragem da BARRA (m) nos cortes de PERFIL da Estrutura do Produto,
 * conforme as planilhas de PLANEJAMENTO DE CORTE (SAÍDA DE PERFIS usa barras de
 * 6 m: BARRAS = ARREDONDAR.PARA.CIMA(metros ÷ 6)).
 *
 * - Só marca cortes que PARECEM perfil de barra (tubo, trilho, base, box, guia,
 *   bandô, perfil, rolete, vareta, eixo, vias) e que ainda NÃO têm barra.
 * - NÃO toca em tecido, m², lâmina, corda, furo, cadarço, espaçamento, modelo,
 *   garra, corrente (não são cortados de barra).
 * - Idempotente: rodar de novo não muda nada (só preenche onde falta).
 * - Cada modelo pode ter barra diferente: este script aplica o padrão 6 m das
 *   planilhas; exceções são ajustadas depois na aba Estrutura do Produto
 *   (coluna "barra (m)" do editor de cortes).
 *
 * Uso: node bin/preencher-barras.js            (aplica)
 *      node bin/preencher-barras.js --dry-run  (só mostra o que faria)
 */
import 'dotenv/config';
import { pool } from '../src/db.js';

const BARRA_PADRAO = 6; // metros — divisor usado em TODAS as SAÍDAS DE PERFIS das planilhas

const PERFIL = /(tubo|trilho|base|box|guia|band[oô]|perfil|rolete|vareta|eixo|via(s)?\b|tampa)/i;
const NAO_BARRA = /(tecido|m²|m2\b|l[âa]mina|corda|furo|cadar[çc]o|espa[çc]amento|modelo|garra|corrente|bast[ãa]o|área|area)/i;

const dry = process.argv.includes('--dry-run');
const { rows } = await pool.query(
  `SELECT id, chave, nome, familia, cortes FROM pcp_produtos WHERE ativo = TRUE ORDER BY familia, nome`
);

let produtosAlterados = 0, cortesMarcados = 0;
const marcados = [], pulados = new Set();

for (const p of rows) {
  const cortes = Array.isArray(p.cortes) ? p.cortes : [];
  let mudou = false;
  for (const c of cortes) {
    const nome = String(c.nome || '');
    if (c.barra != null && Number(c.barra) > 0) continue;          // já tem: não mexe
    if (NAO_BARRA.test(nome)) { pulados.add(nome + ' (não é barra)'); continue; }
    if (!PERFIL.test(nome)) { pulados.add(nome + ' (não reconhecido como perfil — revisar manualmente)'); continue; }
    c.barra = BARRA_PADRAO;
    mudou = true;
    cortesMarcados++;
    marcados.push(`${p.familia} · ${p.nome} → ${nome} = ${BARRA_PADRAO} m`);
  }
  if (mudou && !dry) {
    await pool.query(
      `UPDATE pcp_produtos SET cortes = $2::jsonb, updated_at = now() WHERE id = $1`,
      [p.id, JSON.stringify(cortes)]
    );
  }
  if (mudou) produtosAlterados++;
}

console.log(dry ? '── DRY-RUN (nada gravado) ──' : '── APLICADO ──');
console.log(`${cortesMarcados} corte(s) marcados com barra de ${BARRA_PADRAO} m em ${produtosAlterados} produto(s):\n`);
for (const m of marcados) console.log('  ✓ ' + m);
if (pulados.size) {
  console.log('\nNão marcados (confira se algum deveria ter barra):');
  for (const s of [...pulados].sort()) console.log('  · ' + s);
}
console.log('\nExceções de metragem (modelo com barra ≠ 6 m): ajuste na aba Estrutura do Produto → editar → coluna "barra (m)".');
await pool.end();
