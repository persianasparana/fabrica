/**
 * Fotos p/ e-commerce — API do mini-PWA /pcp/fotos/.
 *
 * Registro = uma peça fotografada com a spec (família, acabamento, trilho
 * plus, bandô, coleção, cores, medidas, comando, observações) + N fotos.
 * Fotos vão pro disco em uploads/ecommerce (fora do git) e são servidas
 * SOMENTE autenticado (streaming por esta rota — nada público).
 *
 * Upload SEM multer: o app comprime a foto no celular (canvas → JPEG) e faz
 * POST do binário puro (express.raw), o que também mantém o corpo pequeno
 * o bastante pro proxy (≤ ~1 MB na prática).
 *
 *   GET    /                      lista registros (com contagem/1ª foto)
 *   POST   /                      cria registro           (CSRF)
 *   PUT    /?id=N                 atualiza spec           (CSRF)
 *   DELETE /?id=N                 exclui registro + fotos (CSRF)
 *   POST   /:id/foto              upload binário da foto  (CSRF, image/*)
 *   GET    /foto/:arquivoId       stream da foto (autenticado)
 *   DELETE /foto/:arquivoId       exclui uma foto         (CSRF)
 *   GET    /export.csv            specs + links (pro e-commerce)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { Router } from 'express';
import { requireAuth, requireCsrf, audit } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.ECOMMERCE_FOTOS_DIR
  || path.resolve(here, '..', '..', '..', 'uploads', 'ecommerce');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const r = Router();
r.use(requireAuth);

const s = (v, max) => (v == null || v === '' ? null : String(v).trim().slice(0, max));
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const boolOuNull = (v) => (typeof v === 'boolean' ? v : null);

const SELECT_REG = `
  SELECT r.id, r.titulo, r.familia, r.produto, r.acabamento, r.trilho_plus, r.bando,
         r.colecao, r.cor_tecido, r.cor_perfil, r.largura_cm, r.altura_cm,
         r.acionamento, r.comando, r.observacoes,
         to_char(r.created_at, 'DD/MM/YYYY HH24:MI') AS criado_em,
         u.full_name AS criado_por_nome,
         COALESCE(fa.fotos, '[]'::json) AS fotos
  FROM ecommerce_fotos_registros r
  LEFT JOIN users u ON u.id = r.criado_por
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', a.id, 'ordem', a.ordem, 'tamanho', a.tamanho)
                    ORDER BY a.ordem, a.id) AS fotos
    FROM ecommerce_fotos_arquivos a WHERE a.registro_id = r.id
  ) fa ON TRUE`;

r.get('/', ah(async (req, res) => {
  const busca = String(req.query.busca || '').trim().toLowerCase();
  const params = [];
  let where = '';
  if (busca) {
    params.push(`%${busca}%`);
    where = `WHERE lower(r.titulo || ' ' || COALESCE(r.produto,'') || ' ' || COALESCE(r.colecao,'')
             || ' ' || COALESCE(r.cor_tecido,'') || ' ' || COALESCE(r.familia,'')) LIKE $1`;
  }
  const { rows } = await q(`${SELECT_REG} ${where} ORDER BY r.id DESC LIMIT 200`, params);
  res.json({ data: rows });
}));

function payloadRegistro(d) {
  return [
    s(d.titulo, 160) || '', s(d.familia, 40), s(d.produto, 160), s(d.acabamento, 120),
    boolOuNull(d.trilho_plus), boolOuNull(d.bando),
    s(d.colecao, 120), s(d.cor_tecido, 120), s(d.cor_perfil, 120),
    num(d.largura_cm), num(d.altura_cm), s(d.acionamento, 60), s(d.comando, 60),
    (d.observacoes != null ? String(d.observacoes).trim().slice(0, 5000) : ''),
  ];
}

r.post('/', requireCsrf, ah(async (req, res) => {
  const vals = payloadRegistro(req.body || {});
  const { rows } = await q(
    `INSERT INTO ecommerce_fotos_registros
       (titulo, familia, produto, acabamento, trilho_plus, bando, colecao, cor_tecido,
        cor_perfil, largura_cm, altura_cm, acionamento, comando, observacoes, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    [...vals, req.session.user.id]
  );
  const id = Number(rows[0].id);
  await audit(req.session.user.id, 'pcp', 'ecommerce.foto.create', { entityType: 'ecommerce_registro', entityId: id });
  res.status(201).json({ id });
}));

r.put('/', requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const vals = payloadRegistro(req.body || {});
  const result = await q(
    `UPDATE ecommerce_fotos_registros SET
       titulo=$2, familia=$3, produto=$4, acabamento=$5, trilho_plus=$6, bando=$7,
       colecao=$8, cor_tecido=$9, cor_perfil=$10, largura_cm=$11, altura_cm=$12,
       acionamento=$13, comando=$14, observacoes=$15, updated_at=now()
     WHERE id=$1`,
    [id, ...vals]
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Registro não encontrado');
  await audit(req.session.user.id, 'pcp', 'ecommerce.foto.update', { entityType: 'ecommerce_registro', entityId: id });
  res.json({ ok: true });
}));

r.delete('/', requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const { rows: arqs } = await q('SELECT arquivo FROM ecommerce_fotos_arquivos WHERE registro_id = $1', [id]);
  const result = await q('DELETE FROM ecommerce_fotos_registros WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new HttpError(404, 'Registro não encontrado');
  for (const a of arqs) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, a.arquivo)); } catch (e) { /* arquivo já ausente */ }
  }
  await audit(req.session.user.id, 'pcp', 'ecommerce.foto.delete', { entityType: 'ecommerce_registro', entityId: id });
  res.json({ ok: true });
}));

// ─── Fotos (binário puro; o app comprime antes de enviar) ───────────────────
const MIMES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

r.post(
  '/:id/foto',
  requireCsrf,
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: '15mb' }),
  ah(async (req, res) => {
    const id = Number(req.params.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) {
      throw new HttpError(422, 'Envie o binário da imagem no corpo (Content-Type: image/jpeg)');
    }
    const { rows: reg } = await q('SELECT 1 FROM ecommerce_fotos_registros WHERE id = $1', [id]);
    if (!reg[0]) throw new HttpError(404, 'Registro não encontrado');

    const mime = MIMES[req.get('Content-Type')] ? req.get('Content-Type') : 'image/jpeg';
    const { rows: ord } = await q(
      'SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM ecommerce_fotos_arquivos WHERE registro_id = $1', [id]);
    const arquivo = `reg${id}-${ord[0].n}-${Date.now()}${MIMES[mime]}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, arquivo), req.body);
    const { rows } = await q(
      `INSERT INTO ecommerce_fotos_arquivos (registro_id, arquivo, mime, tamanho, ordem)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [id, arquivo, mime, req.body.length, ord[0].n]
    );
    res.status(201).json({ id: Number(rows[0].id), ordem: ord[0].n });
  })
);

r.get('/foto/:arquivoId', ah(async (req, res) => {
  const { rows } = await q(
    'SELECT arquivo, mime FROM ecommerce_fotos_arquivos WHERE id = $1', [Number(req.params.arquivoId) || 0]);
  if (!rows[0]) throw new HttpError(404, 'Foto não encontrada');
  const caminho = path.join(UPLOAD_DIR, path.basename(rows[0].arquivo));
  if (!fs.existsSync(caminho)) throw new HttpError(404, 'Arquivo ausente no disco');
  res.setHeader('Content-Type', rows[0].mime);
  res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(caminho).pipe(res);
}));

r.delete('/foto/:arquivoId', requireCsrf, ah(async (req, res) => {
  const { rows } = await q(
    'DELETE FROM ecommerce_fotos_arquivos WHERE id = $1 RETURNING arquivo, registro_id',
    [Number(req.params.arquivoId) || 0]);
  if (!rows[0]) throw new HttpError(404, 'Foto não encontrada');
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(rows[0].arquivo))); } catch (e) { /* ok */ }
  await audit(req.session.user.id, 'pcp', 'ecommerce.foto.arquivo.delete', {
    entityType: 'ecommerce_registro', entityId: Number(rows[0].registro_id),
  });
  res.json({ ok: true });
}));

// ─── Exportação pro e-commerce ───────────────────────────────────────────────
r.get('/export.csv', ah(async (req, res) => {
  const { rows } = await q(`${SELECT_REG} ORDER BY r.id DESC`);
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const base = `${req.protocol}://${req.get('host')}/api/pcp/fotos-ecommerce/foto/`;
  const linhas = [[
    'id', 'titulo', 'familia', 'produto', 'acabamento', 'trilho_plus', 'bando', 'colecao',
    'cor_tecido', 'cor_perfil', 'largura_cm', 'altura_cm', 'acionamento', 'comando',
    'observacoes', 'criado_em', 'fotos',
  ].join(';')];
  for (const x of rows) {
    linhas.push([
      x.id, esc(x.titulo), esc(x.familia), esc(x.produto), esc(x.acabamento),
      x.trilho_plus === true ? 'sim' : x.trilho_plus === false ? 'nao' : '',
      x.bando === true ? 'sim' : x.bando === false ? 'nao' : '',
      esc(x.colecao), esc(x.cor_tecido), esc(x.cor_perfil),
      x.largura_cm ?? '', x.altura_cm ?? '', esc(x.acionamento), esc(x.comando),
      esc(x.observacoes), esc(x.criado_em),
      esc((x.fotos || []).map((f) => base + f.id).join(' ')),
    ].join(';'));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fotos-ecommerce.csv"');
  res.send('﻿' + linhas.join('\r\n'));
}));

export default r;
