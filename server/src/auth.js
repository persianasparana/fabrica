/**
 * Autenticação e segurança — backend unificado fabrica.
 *
 * - Sessão por cookie (express-session) com regeneração no login
 * - Senhas com bcrypt
 * - CSRF por token de sessão (header X-CSRF-Token nas escritas)
 * - Rate limiting de login PERSISTIDO em banco (usuário + IP)
 *
 * Conformidade OWASP A04/A07.
 */
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { q } from './db.js';

const MAX_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS || 5);
const LOCKOUT_SECONDS = Number(process.env.LOCKOUT_SECONDS || 900);

export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || '';
}

async function isLockedOut(username, ip) {
  const { rows } = await q(
    `SELECT COUNT(*)::int AS c FROM login_attempts
      WHERE attempted_at >= now() - ($1 || ' seconds')::interval
        AND (username = $2 OR ip_address = $3)`,
    [String(LOCKOUT_SECONDS), username, ip]
  );
  return (rows[0]?.c ?? 0) >= MAX_ATTEMPTS;
}

async function recordFailedAttempt(username, ip) {
  await q('INSERT INTO login_attempts (username, ip_address) VALUES ($1, $2)', [username, ip]);
}

async function clearFailedAttempts(username) {
  await q('DELETE FROM login_attempts WHERE username = $1', [username]);
}

export async function audit(userId, app, action, { entityType = null, entityId = null, ip = null } = {}) {
  try {
    await q(
      `INSERT INTO audit_log (user_id, app, action, entity_type, entity_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      // entity_id é VARCHAR (ids mistos: numéricos do PCP + UUID do Comercial)
      [userId, app, action, entityType, entityId != null ? String(entityId).slice(0, 64) : null, ip]
    );
  } catch (e) {
    // Auditoria NUNCA derruba a operação principal (que já foi concluída
    // quando chegamos aqui) — bug real 15/07/2026: "Liberar produção"
    // devolvia 500 por causa do INSERT do log, com o pedido já liberado.
    console.error(`[audit] Falha ao gravar auditoria (${app}/${action}): ${e.message}`);
  }
}

/** Regenera a sessão (anti session fixation) — Promise wrapper. */
function regenerate(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Tenta autenticar. Em sucesso, popula req.session.user e retorna o usuário.
 * Lança Error('locked') se bloqueado por rate limit; retorna null em credenciais inválidas.
 */
export async function attemptLogin(req, username, password, ip) {
  username = (username || '').trim();
  if (!username || !password) return null;

  if (await isLockedOut(username, ip)) {
    const e = new Error('Muitas tentativas falhas. Tente novamente em alguns minutos.');
    e.code = 'LOCKED';
    throw e;
  }

  const { rows } = await q(
    'SELECT * FROM users WHERE username = $1 AND active = TRUE',
    [username]
  );
  const user = rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    await recordFailedAttempt(username, ip);
    return null;
  }

  await clearFailedAttempts(username);
  await regenerate(req);

  req.session.user = {
    id: Number(user.id),
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    permissoes: user.permissoes || {},
  };
  ensureCsrf(req);

  const { rows: sets } = await q('SELECT setor_id FROM usuario_setores WHERE user_id = $1', [user.id]);
  req.session.user.setores = sets.map((s) => Number(s.setor_id));

  await q('UPDATE users SET last_login = now() WHERE id = $1', [user.id]);
  await audit(Number(user.id), 'auth', 'login', { ip });

  return req.session.user;
}

export function ensureCsrf(req) {
  if (!req.session.csrf) {
    req.session.csrf = randomBytes(32).toString('hex');
  }
  return req.session.csrf;
}

/** Cria um usuário (uso administrativo / instalador). */
export async function createUser(username, password, fullName, role = 'user') {
  if (!password || password.length < 8) {
    throw new Error('Senha deve ter no mínimo 8 caracteres');
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await q(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [username, hash, fullName, role]
  );
  return Number(rows[0].id);
}

// --- Middlewares ---

export function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'Não autenticado' });
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Ação restrita a administradores' });
  }
  next();
}

const NIVEIS = { none: 0, ver: 1, editar: 2 };

/** Nível de permissão do usuário numa aba ('none'|'ver'|'editar'). Admin = editar. */
export function nivelPerm(user, aba) {
  if (!user) return 'none';
  if (user.role === 'admin') return 'editar';
  return (user.permissoes && user.permissoes[aba]) || 'none';
}

/** Middleware: exige nível mínimo numa aba (admin tem acesso total). */
export function requirePerm(aba, nivel) {
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Não autenticado' });
    if (NIVEIS[nivelPerm(req.session.user, aba)] < NIVEIS[nivel]) {
      return res.status(403).json({ error: `Sem permissão para ${nivel} em "${aba}"` });
    }
    next();
  };
}

export function requireCsrf(req, res, next) {
  const token = req.get('X-CSRF-Token') || '';
  if (!req.session?.csrf || token !== req.session.csrf) {
    return res.status(403).json({ error: 'Token CSRF inválido ou ausente' });
  }
  next();
}
