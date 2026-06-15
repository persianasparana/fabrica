/**
 * Administração do PCP — setores de produção e usuários (com permissões).
 * Montado em /api/pcp. Leitura de setores é liberada (alimenta seletores);
 * as escritas e toda a gestão de usuários exigem admin.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth, requireAdmin, requireCsrf, audit } from '../auth.js';
import { q, pool } from '../db.js';
import { ah, HttpError } from '../util.js';

const r = Router();
r.use(requireAuth);

const COR_RE = /^#[0-9a-fA-F]{6}$/;
const NIVEIS = ['none', 'ver', 'editar'];
// Abas governadas pela matriz de permissões (as de admin não entram aqui)
export const ABAS = ['painel', 'fila', 'alertas', 'busca', 'pedido', 'indicadores', 'bipagem', 'estrutura', 'novo'];

// ─── Setores de produção ─────────────────────────────────────────────────────

r.get(
  '/setores',
  ah(async (req, res) => {
    const { rows } = await q(`
      SELECT s.id, s.nome, s.cor, s.ordem, s.status_id, s.ordem_corte,
             st.nome AS status_nome, st.cor AS status_cor, st.final AS status_final
      FROM pcp_setores s
      LEFT JOIN pcp_status st ON st.id = s.status_id
      WHERE s.ativo = TRUE ORDER BY s.ordem, s.nome
    `);
    res.json({ data: rows });
  })
);

r.post(
  '/setores',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const nome = String(req.body?.nome || '').trim();
    const cor = String(req.body?.cor || '#606060').trim();
    const ordem = Number.isFinite(Number(req.body?.ordem)) ? Number(req.body.ordem) : 0;
    const status_id = req.body?.status_id != null && req.body.status_id !== '' ? Number(req.body.status_id) : null;
    if (!nome) throw new HttpError(422, 'Nome do setor é obrigatório');
    if (nome.length > 60) throw new HttpError(422, 'Nome muito longo (máx. 60)');
    if (!COR_RE.test(cor)) throw new HttpError(422, 'Cor inválida (use #RRGGBB)');
    if (status_id) await assertStatusExiste(status_id);
    const { rows } = await q(
      `INSERT INTO pcp_setores (nome, cor, ordem, status_id, ordem_corte) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (nome) DO NOTHING RETURNING id`,
      [nome, cor, ordem, status_id, req.body?.ordem_corte === true]
    );
    if (!rows[0]) throw new HttpError(409, 'Já existe um setor com esse nome');
    await audit(req.session.user.id, 'pcp', 'setor.create', { entityType: 'pcp_setor', entityId: Number(rows[0].id) });
    res.status(201).json({ id: Number(rows[0].id) });
  })
);

r.put(
  '/setores',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    if (d.cor != null && !COR_RE.test(String(d.cor))) throw new HttpError(422, 'Cor inválida');
    if (d.nome != null && (!String(d.nome).trim() || String(d.nome).length > 60)) throw new HttpError(422, 'Nome inválido');
    const limparStatus = d.status_id === null;
    const status_id = d.status_id != null && d.status_id !== '' ? Number(d.status_id) : null;
    if (status_id) await assertStatusExiste(status_id);
    let result;
    try {
      result = await q(
        `UPDATE pcp_setores SET
           nome = COALESCE($2, nome), cor = COALESCE($3, cor), ordem = COALESCE($4, ordem),
           status_id = CASE WHEN $5 THEN NULL ELSE COALESCE($6::bigint, status_id) END,
           ordem_corte = COALESCE($7, ordem_corte)
         WHERE id = $1`,
        [
          id, d.nome != null ? String(d.nome).trim() : null, d.cor != null ? String(d.cor) : null,
          d.ordem != null && Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : null,
          limparStatus, status_id,
          typeof d.ordem_corte === 'boolean' ? d.ordem_corte : null,
        ]
      );
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Já existe um setor com esse nome');
      throw e;
    }
    if (result.rowCount === 0) throw new HttpError(404, 'Setor não encontrado');
    await audit(req.session.user.id, 'pcp', 'setor.update', { entityType: 'pcp_setor', entityId: id });
    res.json({ ok: true });
  })
);

r.delete(
  '/setores',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const result = await q('DELETE FROM pcp_setores WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Setor não encontrado');
    await audit(req.session.user.id, 'pcp', 'setor.delete', { entityType: 'pcp_setor', entityId: id });
    res.json({ ok: true });
  })
);

async function assertStatusExiste(id) {
  const { rows } = await q('SELECT 1 FROM pcp_status WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(422, 'Status associado inexistente');
}

// ─── Usuários (admin) ────────────────────────────────────────────────────────

function sanePermissoes(p) {
  const out = {};
  if (p && typeof p === 'object') {
    for (const aba of ABAS) {
      const v = p[aba];
      if (NIVEIS.includes(v) && v !== 'none') out[aba] = v;
    }
  }
  return out;
}

const USER_COLS = `
  u.id, u.username, u.full_name, u.role, u.active, u.permissoes,
  to_char(u.last_login, 'YYYY-MM-DD HH24:MI') AS last_login,
  COALESCE((SELECT array_agg(setor_id) FROM usuario_setores WHERE user_id = u.id), '{}') AS setores`;

r.get(
  '/usuarios',
  requireAdmin,
  ah(async (req, res) => {
    const { rows } = await q(`SELECT ${USER_COLS} FROM users u ORDER BY u.username`);
    res.json({ data: rows.map((u) => ({ ...u, setores: (u.setores || []).map(Number) })) });
  })
);

async function setSetores(exec, userId, setores) {
  await exec('DELETE FROM usuario_setores WHERE user_id = $1', [userId]);
  const ids = [...new Set((Array.isArray(setores) ? setores : []).map(Number).filter(Boolean))];
  for (const sid of ids) {
    await exec(
      `INSERT INTO usuario_setores (user_id, setor_id)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM pcp_setores WHERE id = $2)
       ON CONFLICT DO NOTHING`,
      [userId, sid]
    );
  }
}

r.post(
  '/usuarios',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const d = req.body || {};
    const username = String(d.username || '').trim().toLowerCase();
    const fullName = String(d.full_name || '').trim();
    const role = d.role === 'admin' ? 'admin' : 'user';
    if (!username || username.length > 64) throw new HttpError(422, 'Usuário inválido');
    if (!fullName) throw new HttpError(422, 'Nome completo é obrigatório');
    if (!d.password || String(d.password).length < 8) throw new HttpError(422, 'Senha deve ter no mínimo 8 caracteres');

    const hash = await bcrypt.hash(String(d.password), 10);
    const id = await emTransacao(async (exec) => {
      const { rows } = await exec(
        `INSERT INTO users (username, password_hash, full_name, role, permissoes)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (username) DO NOTHING RETURNING id`,
        [username, hash, fullName, role, JSON.stringify(sanePermissoes(d.permissoes))]
      );
      if (!rows[0]) throw new HttpError(409, 'Já existe um usuário com esse login');
      const uid = Number(rows[0].id);
      await setSetores(exec, uid, d.setores);
      return uid;
    });
    await audit(req.session.user.id, 'pcp', 'usuario.create', { entityType: 'user', entityId: id });
    res.status(201).json({ id });
  })
);

r.put(
  '/usuarios',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    if (d.password != null && d.password !== '' && String(d.password).length < 8)
      throw new HttpError(422, 'Senha deve ter no mínimo 8 caracteres');

    // Trava de segurança: não permitir remover o último admin / desativar a si mesmo
    if ((d.role === 'user' || d.active === false) && id === req.session.user.id)
      throw new HttpError(422, 'Você não pode rebaixar ou desativar o próprio usuário');

    await emTransacao(async (exec) => {
      const { rows: cur } = await exec('SELECT role, active FROM users WHERE id = $1', [id]);
      if (!cur[0]) throw new HttpError(404, 'Usuário não encontrado');
      if (cur[0].role === 'admin' && (d.role === 'user' || d.active === false)) {
        const { rows: adm } = await exec("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND active = TRUE");
        if (adm[0].c <= 1) throw new HttpError(422, 'Não é possível remover o último administrador ativo');
      }
      const hash = d.password ? await bcrypt.hash(String(d.password), 10) : null;
      await exec(
        `UPDATE users SET
           full_name   = COALESCE($2, full_name),
           role        = COALESCE($3, role),
           active      = COALESCE($4, active),
           permissoes  = COALESCE($5::jsonb, permissoes),
           password_hash = COALESCE($6, password_hash)
         WHERE id = $1`,
        [
          id,
          d.full_name != null ? String(d.full_name).trim() : null,
          d.role === 'admin' || d.role === 'user' ? d.role : null,
          typeof d.active === 'boolean' ? d.active : null,
          d.permissoes !== undefined ? JSON.stringify(sanePermissoes(d.permissoes)) : null,
          hash,
        ]
      );
      if (d.setores !== undefined) await setSetores(exec, id, d.setores);
    });
    await audit(req.session.user.id, 'pcp', 'usuario.update', { entityType: 'user', entityId: id });
    res.json({ ok: true });
  })
);

r.delete(
  '/usuarios',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    if (id === req.session.user.id) throw new HttpError(422, 'Você não pode excluir o próprio usuário');
    const { rows: cur } = await q('SELECT role FROM users WHERE id = $1', [id]);
    if (!cur[0]) throw new HttpError(404, 'Usuário não encontrado');
    if (cur[0].role === 'admin') {
      const { rows: adm } = await q("SELECT COUNT(*)::int AS c FROM users WHERE role = 'admin' AND active = TRUE");
      if (adm[0].c <= 1) throw new HttpError(422, 'Não é possível excluir o último administrador ativo');
    }
    await q('DELETE FROM users WHERE id = $1', [id]);
    await audit(req.session.user.id, 'pcp', 'usuario.delete', { entityType: 'user', entityId: id });
    res.json({ ok: true });
  })
);

async function emTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client.query.bind(client));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export default r;
