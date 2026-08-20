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
 *
 * Preso no "Muitas tentativas falhas" (bloqueio por IP, sem trocar a senha):
 *   node bin/reset-senha.js --desbloquear
 */
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import bcrypt from 'bcryptjs';
import { pool, q } from '../src/db.js';

const arg = (process.argv[2] || '').trim();

if (!arg || arg === '--help' || arg === '-h') {
  console.log('Uso: node bin/reset-senha.js <usuario> [novaSenha]   (ou --listar | --desbloquear)');
  process.exit(arg ? 0 : 1);
}

if (arg === '--listar') {
  const { rows } = await q(
    `SELECT username, full_name, role, active,
            to_char(last_login, 'DD/MM/YYYY HH24:MI') AS ultimo
       FROM users ORDER BY role DESC, username`
  );
  console.log('Usuários cadastrados (nome é case-sensitive no cadastro):');
  for (const u of rows) {
    console.log(
      `  ${u.username}  [${u.role}${u.active ? '' : ', INATIVO'}]  ${u.full_name}`
      + `  · último acesso: ${u.ultimo || 'nunca'}`
    );
  }
  // quem está travado agora (janela de bloqueio corrente)
  const { rows: tent } = await q(
    `SELECT username, ip_address, COUNT(*)::int AS falhas,
            to_char(MAX(attempted_at), 'HH24:MI:SS') AS ultima
       FROM login_attempts
      WHERE attempted_at >= now() - interval '15 minutes'
      GROUP BY username, ip_address ORDER BY falhas DESC`
  );
  if (tent.length) {
    console.log('\nTentativas falhas nos últimos 15 min (o que alimenta o bloqueio):');
    for (const t of tent) {
      console.log(`  usuario="${t.username}" ip=${t.ip_address || '-'}  ${t.falhas} falha(s), última ${t.ultima}`);
    }
    console.log('Para liberar sem trocar a senha: node bin/reset-senha.js --desbloquear');
  } else {
    console.log('\nNenhuma tentativa falha nos últimos 15 min (ninguém bloqueado agora).');
  }
  await pool.end();
  process.exit(0);
}

if (arg === '--desbloquear') {
  const alvo = (process.argv[3] || '').trim().toLowerCase();
  const r = alvo
    ? await q('DELETE FROM login_attempts WHERE lower(username) = $1', [alvo])
    : await q('DELETE FROM login_attempts');
  console.log(
    `Bloqueio de login limpo${alvo ? ` para "${alvo}"` : ' (todas as tentativas)'}`
    + ` — ${r.rowCount} registro(s) removido(s). Pode tentar entrar de novo agora.`
  );
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

// aceita o nome em qualquer caixa (o cadastro é case-sensitive; o operador
// raramente lembra se gravou "Wellington" ou "wellington")
const { rows: achados } = await q(
  `SELECT id, username, full_name, active FROM users
    WHERE username = $1 OR lower(username) = lower($1)
    ORDER BY (username = $1) DESC`,
  [username]
);
if (achados.length === 0) {
  console.error(`Usuário "${username}" não encontrado. Use --listar para ver os usuários.`);
  process.exitCode = 1;
} else if (achados.length > 1 && achados[0].username !== username) {
  console.error(`Há mais de um usuário com esse nome variando a caixa: ${achados.map((u) => u.username).join(', ')}.`);
  console.error('Repita o comando com o nome exato.');
  process.exitCode = 1;
} else {
  const alvo = achados[0];
  const hash = await bcrypt.hash(senha, 10);
  await q('UPDATE users SET password_hash = $1, active = TRUE WHERE id = $2', [hash, alvo.id]);
  // limpa o bloqueio do usuário E os das tentativas anônimas da janela (o
  // contador por IP também barra a senha nova — ver comentário em auth.js)
  const { rowCount } = await q('DELETE FROM login_attempts WHERE lower(username) = lower($1)', [alvo.username]);
  console.log(
    `Senha de "${alvo.username}" (${alvo.full_name}) redefinida.`
    + `${alvo.active ? '' : ' A conta estava INATIVA e foi reativada.'}`
    + ` Bloqueio de login limpo (${rowCount} tentativa[s]).`
  );
  console.log(`Entre com o usuário EXATAMENTE assim: ${alvo.username}`);
}
await pool.end();
