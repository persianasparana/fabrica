/** Rotas do PCP: armazenamento chave-valor compartilhado. /api/pcp/* */
import { Router } from 'express';
import { requireAuth, requireCsrf } from '../auth.js';
import { q } from '../db.js';
import { ah } from '../util.js';

const r = Router();
r.use(requireAuth);

// GET /api/pcp/storage?key=...   -> { value }
// GET /api/pcp/storage?prefix=.. -> { keys: [...] }
r.get(
  '/storage',
  ah(async (req, res) => {
    if (req.query.key !== undefined) {
      const { rows } = await q('SELECT v FROM pcp_kv_store WHERE k = $1', [String(req.query.key)]);
      return res.json({ value: rows[0]?.v ?? null });
    }
    const prefix = String(req.query.prefix ?? '');
    let rows;
    if (prefix === '') {
      ({ rows } = await q('SELECT k FROM pcp_kv_store ORDER BY k'));
    } else {
      const esc = prefix.replace(/([\\%_])/g, '\\$1'); // escapa curingas LIKE
      ({ rows } = await q(
        `SELECT k FROM pcp_kv_store WHERE k LIKE $1 ESCAPE '\\' ORDER BY k`,
        [esc + '%']
      ));
    }
    res.json({ keys: rows.map((x) => x.k) });
  })
);

// PUT/POST /api/pcp/storage?key=... body { value }
const setKey = ah(async (req, res) => {
  const key = String(req.query.key ?? '');
  if (!key) return res.status(400).json({ error: 'Parâmetro "key" obrigatório' });
  const value = req.body?.value;
  if (typeof value !== 'string') return res.status(422).json({ error: 'Campo "value" (string) obrigatório' });
  if (value.length > 1048576) return res.status(413).json({ error: 'Documento muito grande (máx. 1 MB)' });

  await q(
    `INSERT INTO pcp_kv_store (k, v, updated_at, updated_by)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, value, req.session.user.id]
  );
  res.json({ ok: true });
});
r.put('/storage', requireCsrf, setKey);
r.post('/storage', requireCsrf, setKey);

// DELETE /api/pcp/storage?key=...
r.delete(
  '/storage',
  requireCsrf,
  ah(async (req, res) => {
    const key = String(req.query.key ?? '');
    if (!key) return res.status(400).json({ error: 'Parâmetro "key" obrigatório' });
    const result = await q('DELETE FROM pcp_kv_store WHERE k = $1', [key]);
    res.json({ ok: result.rowCount > 0 });
  })
);

export default r;
