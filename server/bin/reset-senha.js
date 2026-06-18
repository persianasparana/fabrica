/**
 * Redefine a senha de um usuário (recuperação de acesso pelo servidor).
 *
 *   node bin/reset-senha.js <usuario> [novaSenha]
 *   npm run reset-senha -- <usuario> [novaSenha]
 *
 * Sem a senha no comando, pergunta interativamente. Também reativa o usuário
 * (active=TRUE) e limpa o bloqueio por tentativas de login.
 *
 * Dica: para descobrir os admins:
 *   node bin/reset-senha.js --listar
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool, q } from '../src/db.js';

const arg = (process.argv[2] || '').trim();

if (!arg || arg === '--help' || arg === '-h') {
  console.log('Uso: node bin/reset-senha.js <usuario> [novaSenha]   (ou --listar)');
  process.exit(arg ? 0 : 1);
}

if (arg === '--listar') {
  const { rows } = await q(
    "SELECT username, full_name, role, active FROM users ORDER BY role DESC, username"
  );
  console.log('Usuários cadastrados:');
  for (const u of rows) {
    console.log(`  ${u.username}  [${u.role}${u.active ? '' : ', inativo'}]  ${u.full_name}`);
  }
  await pool.end();
  process.exit(0);
}

const username = arg;
let senha = process.argv[3];
if (!senha) {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  senha = (await rl.question(`Nova senha para "${username}" (mínimo 8 caracteres): `)).trim();
  rl.close();
}
if (!senha || senha.length < 8) {
  console.error('Senha deve ter no mínimo 8 caracteres.');
  await pool.end();
  process.exit(1);
}

const hash = await bcrypt.hash(senha, 10);
const r = await q('UPDATE users SET password_hash = $1, active = TRUE WHERE username = $2', [hash, username]);
if (r.rowCount === 0) {
  console.error(`Usuário "${username}" não encontrado. Use --listar para ver os usuários.`);
  process.exitCode = 1;
} else {
  await q('DELETE FROM login_attempts WHERE username = $1', [username]);
  console.log(`Senha de "${username}" redefinida; usuário ativado e bloqueio de login limpo.`);
}
await pool.end();
