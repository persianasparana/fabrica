/** Rotas do Qualidade: não conformidades + KPIs. /api/qualidade/* */
import { Router } from 'express';
import { requireAuth, requireCsrf, audit } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';

const r = Router();
r.use(requireAuth);

const IMPACTOS = ['Baixo', 'Médio', 'Alto'];
const STATUSES = ['Aberta', 'Em andamento', 'Encerrada'];

const SELECT_NC = `
  SELECT id, pedido,
         to_char(data_ocorrencia, 'YYYY-MM-DD') AS data_ocorrencia,
         descricao, causa_raiz, acao_imediata, acao_corretiva,
         impacto, status, responsavel,
         to_char(prazo, 'YYYY-MM-DD') AS prazo,
         setores, origens, created_by, created_at, updated_at
  FROM nao_conformidades`;

function validateNC(d, partial = false) {
  if (!partial) {
    if (!d.data_ocorrencia) throw new HttpError(422, 'Data da ocorrência é obrigatória');
    if (!d.descricao || !String(d.descricao).trim()) throw new HttpError(422, 'Descrição é obrigatória');
  }
  if (d.data_ocorrencia && !/^\d{4}-\d{2}-\d{2}$/.test(d.data_ocorrencia))
    throw new HttpError(422, 'Formato de data inválido (use YYYY-MM-DD)');
  if (d.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(d.prazo))
    throw new HttpError(422, 'Formato de prazo inválido');
  if (d.impacto && !IMPACTOS.includes(d.impacto))
    throw new HttpError(422, 'Impacto deve ser Baixo, Médio ou Alto');
  if (d.status && !STATUSES.includes(d.status))
    throw new HttpError(422, 'Status inválido');
  if (d.descricao && String(d.descricao).length > 5000)
    throw new HttpError(422, 'Descrição muito longa (máx 5000 caracteres)');
}

const arr = (v) => JSON.stringify(Array.isArray(v) ? v : []);
const orNull = (v) => (v === undefined || v === '' ? null : v);

// GET /api/qualidade/ncs            -> { data: [...] }  (filtros via query)
// GET /api/qualidade/ncs?id=N       -> NC
r.get(
  '/ncs',
  ah(async (req, res) => {
    if (req.query.id !== undefined) {
      const { rows } = await q(`${SELECT_NC} WHERE id = $1`, [Number(req.query.id)]);
      if (!rows[0]) throw new HttpError(404, 'NC não encontrada');
      return res.json(rows[0]);
    }

    const where = [];
    const params = [];
    const add = (cond, val) => { params.push(val); where.push(cond.replace('?', `$${params.length}`)); };
    if (req.query.status) add('status = ?', req.query.status);
    if (req.query.impacto) add('impacto = ?', req.query.impacto);
    if (req.query.data_inicio) add('data_ocorrencia >= ?', req.query.data_inicio);
    if (req.query.data_fim) add('data_ocorrencia <= ?', req.query.data_fim);

    const sql = `${SELECT_NC} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY data_ocorrencia DESC, id DESC`;
    const { rows } = await q(sql, params);
    res.json({ data: rows });
  })
);

// POST /api/qualidade/ncs
r.post(
  '/ncs',
  requireCsrf,
  ah(async (req, res) => {
    const d = req.body || {};
    validateNC(d);
    const { rows } = await q(
      `INSERT INTO nao_conformidades
        (pedido, data_ocorrencia, descricao, causa_raiz, acao_imediata, acao_corretiva,
         impacto, status, responsavel, prazo, setores, origens, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
       RETURNING id`,
      [
        orNull(d.pedido), d.data_ocorrencia, d.descricao, orNull(d.causa_raiz),
        orNull(d.acao_imediata), orNull(d.acao_corretiva), d.impacto || 'Médio',
        d.status || 'Aberta', orNull(d.responsavel), orNull(d.prazo),
        arr(d.setores), arr(d.origens), req.session.user.id,
      ]
    );
    const id = Number(rows[0].id);
    await audit(req.session.user.id, 'qualidade', 'nc.create', { entityType: 'nc', entityId: id });
    res.status(201).json({ id, message: 'NC criada com sucesso' });
  })
);

// PUT /api/qualidade/ncs?id=N  (atualização parcial via COALESCE)
r.put(
  '/ncs',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    validateNC(d, true);

    const setores = d.setores !== undefined ? arr(d.setores) : null;
    const origens = d.origens !== undefined ? arr(d.origens) : null;

    const result = await q(
      `UPDATE nao_conformidades SET
         pedido = COALESCE($2, pedido),
         data_ocorrencia = COALESCE($3, data_ocorrencia),
         descricao = COALESCE($4, descricao),
         causa_raiz = COALESCE($5, causa_raiz),
         acao_imediata = COALESCE($6, acao_imediata),
         acao_corretiva = COALESCE($7, acao_corretiva),
         impacto = COALESCE($8, impacto),
         status = COALESCE($9, status),
         responsavel = COALESCE($10, responsavel),
         prazo = COALESCE($11, prazo),
         setores = COALESCE($12::jsonb, setores),
         origens = COALESCE($13::jsonb, origens),
         updated_at = now()
       WHERE id = $1`,
      [
        id, orNull(d.pedido), orNull(d.data_ocorrencia), orNull(d.descricao),
        orNull(d.causa_raiz), orNull(d.acao_imediata), orNull(d.acao_corretiva),
        orNull(d.impacto), orNull(d.status), orNull(d.responsavel), orNull(d.prazo),
        setores, origens,
      ]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'NC não encontrada');
    await audit(req.session.user.id, 'qualidade', 'nc.update', { entityType: 'nc', entityId: id });
    res.json({ message: 'NC atualizada com sucesso' });
  })
);

// DELETE /api/qualidade/ncs?id=N
r.delete(
  '/ncs',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const result = await q('DELETE FROM nao_conformidades WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'NC não encontrada');
    await audit(req.session.user.id, 'qualidade', 'nc.delete', { entityType: 'nc', entityId: id });
    res.json({ message: 'NC excluída com sucesso' });
  })
);

// GET /api/qualidade/kpis
r.get(
  '/kpis',
  ah(async (req, res) => {
    const counts = (await q(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'Aberta')::int AS abertas,
        COUNT(*) FILTER (WHERE status = 'Em andamento')::int AS andamento,
        COUNT(*) FILTER (WHERE status = 'Encerrada')::int AS encerradas,
        COUNT(*) FILTER (WHERE impacto = 'Alto')::int AS alto,
        COUNT(*) FILTER (WHERE impacto = 'Médio')::int AS medio,
        COUNT(*) FILTER (WHERE impacto = 'Baixo')::int AS baixo
      FROM nao_conformidades
    `)).rows[0];

    const origRows = (await q(`
      SELECT o AS origem, COUNT(*)::int AS c
      FROM nao_conformidades, jsonb_array_elements_text(origens) AS o
      GROUP BY o ORDER BY c DESC
    `)).rows;
    const origens = {};
    for (const row of origRows) origens[row.origem] = row.c;

    const evolucao = (await q(`
      SELECT to_char(data_ocorrencia, 'YYYY-MM-DD') AS data_ocorrencia, COUNT(*)::int AS c
      FROM nao_conformidades GROUP BY data_ocorrencia ORDER BY data_ocorrencia
    `)).rows;

    const total = counts.total;
    res.json({
      total,
      abertas: counts.abertas,
      andamento: counts.andamento,
      encerradas: counts.encerradas,
      taxa_resolucao: total > 0 ? Math.round((counts.encerradas / total) * 1000) / 10 : 0,
      impacto: { Alto: counts.alto, Médio: counts.medio, Baixo: counts.baixo },
      origens,
      evolucao,
    });
  })
);

export default r;
