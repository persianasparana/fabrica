/**
 * Gestão de usuários (somente admin): /api/users/*
 *
 * A base de usuários é compartilhada entre PCP e Qualidade. Não há DELETE:
 * usuários são desativados (active = FALSE) para preservar o histórico de
 * auditoria. Todas as escritas exigem CSRF e ficam no audit_log.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { q } from '../db.js';
import { requireAdmin, requireCsrf, audit, clientIp } from '../auth.js';
import { ah } from '../util.js';

const r = Router();

const ROLES = ['admin', 'user'];
// id::int — o driver pg devolve BIGSERIAL como string; o frontend compara com
// o id numérico da sessão (currentUser.id)
const PUBLIC_FIELDS =
  'id::int AS id, username, full_name, role, active, created_at, last_login';

r.use(requireAdmin);

// GET /api/users — lista todos (ativos e inativos)
r.get(
  '/',
  ah(async (req, res) => {
    const { rows } = await q(
      `SELECT ${PUBLIC_FIELDS} FROM users ORDER BY active DESC, username ASC`
    );
    res.json({ data: rows });
  })
);

// POST /api/users — cria usuário
r.post(
  '/',
  requireCsrf,
  ah(async (req, res) => {
    const { username, password, full_name, role } = req.body || {};
    const uname = String(username || '').trim().toLowerCase();
    const fname = String(full_name || '').trim();

    if (!/^[a-z0-9._-]{3,64}$/.test(uname)) {
      return res.status(400).json({
        error:
          'Usuário inválido: use 3 a 64 caracteres (letras minúsculas, números, ponto, hífen ou underline)',
      });
    }
    if (!fname) {
      return res.status(400).json({ error: 'Nome completo é obrigatório' });
    }
    if (!password || String(password).length < 8) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
    }
    if (role && !ROLES.includes(role)) {
      return res.status(400).json({ error: 'Papel inválido (use admin ou user)' });
    }

    const dupe = await q('SELECT 1 FROM users WHERE username = $1', [uname]);
    if (dupe.rows.length) {
      return res.status(409).json({ error: 'Já existe um usuário com esse nome' });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const { rows } = await q(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC_FIELDS}`,
      [uname, hash, fname, role || 'user']
    );

    await audit(req.session.user.id, 'admin', 'user_create', {
      entityType: 'user',
      entityId: String(rows[0].id),
      ip: clientIp(req),
    });
    res.status(201).json({ data: rows[0] });
  })
);

// PATCH /api/users/:id — atualiza nome, papel, ativo e/ou redefine senha
r.patch(
  '/:id',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Id inválido' });
    }

    const atual = await q(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [id]);
    if (!atual.rows.length) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const { full_name, role, active, password } = req.body || {};
    const self = req.session.user.id === id;

    // Guardas anti-bloqueio: o admin não pode rebaixar nem desativar a si mesmo
    if (self && role !== undefined && role !== 'admin') {
      return res.status(400).json({ error: 'Você não pode remover seu próprio papel de admin' });
    }
    if (self && active === false) {
      return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário' });
    }

    const sets = [];
    const vals = [];
    const add = (sql, v) => {
      vals.push(v);
      sets.push(`${sql} = $${vals.length}`);
    };

    if (full_name !== undefined) {
      const fname = String(full_name).trim();
      if (!fname) return res.status(400).json({ error: 'Nome completo é obrigatório' });
      add('full_name', fname);
    }
    if (role !== undefined) {
      if (!ROLES.includes(role)) {
        return res.status(400).json({ error: 'Papel inválido (use admin ou user)' });
      }
      add('role', role);
    }
    if (active !== undefined) {
      add('active', Boolean(active));
    }
    if (password !== undefined && password !== '') {
      if (String(password).length < 8) {
        return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres' });
      }
      add('password_hash', await bcrypt.hash(String(password), 10));
    }

    if (!sets.length) {
      return res.status(400).json({ error: 'Nada para atualizar' });
    }

    vals.push(id);
    const { rows } = await q(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}
       RETURNING ${PUBLIC_FIELDS}`,
      vals
    );

    await audit(req.session.user.id, 'admin', 'user_update', {
      entityType: 'user',
      entityId: String(id),
      ip: clientIp(req),
    });
    res.json({ data: rows[0] });
  })
);

export default r;
