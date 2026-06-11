/**
 * Instalador: aplica o schema e cria o usuário administrador.
 *
 * Não interativo (recomendado em deploy):
 *   FABRICA_ADMIN_USER=admin FABRICA_ADMIN_PASSWORD=... npm run install-app
 * Interativo: npm run install-app  (pergunta usuário/senha)
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { migrate, pool, q } from '../src/db.js';
import { createUser } from '../src/auth.js';
import { seedEstrutura, seedItens } from '../src/seed.js';

await migrate();
console.log('Schema aplicado.');

const nProdutos = await seedEstrutura();
if (nProdutos) console.log(`Estrutura do produto: ${nProdutos} produtos carregados.`);
const nItens = await seedItens();
if (nItens) console.log(`Fila de produção: ${nItens} itens carregados da planilha.`);

const { rows } = await q('SELECT COUNT(*)::int AS c FROM users');
if (rows[0].c > 0) {
  console.log('Já existem usuários — pulando criação do admin.');
  await pool.end();
  process.exit(0);
}

let user = process.env.FABRICA_ADMIN_USER;
let pass = process.env.FABRICA_ADMIN_PASSWORD;
let name = process.env.FABRICA_ADMIN_NAME;

if (!user || !pass) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  user = user || (await rl.question('Usuário admin: ')).trim();
  name = name || (await rl.question('Nome completo: ')).trim();
  pass = pass || (await rl.question('Senha (mínimo 8 caracteres): ')).trim();
  rl.close();
}

try {
  const id = await createUser(user, pass, name || user, 'admin');
  console.log(`Usuário admin '${user}' criado (id ${id}, role admin).`);
} catch (e) {
  console.error('Erro ao criar admin:', e.message);
  process.exitCode = 1;
}
await pool.end();
