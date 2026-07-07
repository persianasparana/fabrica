/**
 * Rotas das etiquetas próprias (F2).
 *   GET  /campos                       dicionário de campos disponíveis
 *   GET  /modelos                      modelos ativos (alimenta editor/preview)
 *   POST /modelos                      cria modelo                  (admin, CSRF)
 *   PUT  /modelos?id=N                 atualiza modelo              (admin, CSRF)
 *   DELETE /modelos?id=N               desativa modelo              (admin, CSRF)
 *   GET  /dados?pedidos=a,b[&setores=1,2]   prévia (sem registrar)
 *   POST /imprimir { pedidos:[], setor_ids?, peca_ids? }   gera códigos
 *        faltantes + registra log + devolve os dados de impressão (CSRF)
 *   GET  /log?pedido=x                 histórico recente
 */
import { Router } from 'express';
import { requireAuth, requireAdmin, requireCsrf, requirePerm, audit } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';
import {
  CAMPOS_ETIQUETA, dadosEtiquetas, gerarCodigosFaltantes, modelosAtivos, registrarImpressao,
} from '../etiquetas.js';

const r = Router();
r.use(requireAuth);

const parseLista = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

r.get('/campos', ah(async (req, res) => {
  res.json({ data: CAMPOS_ETIQUETA });
}));

r.get('/modelos', ah(async (req, res) => {
  res.json({ data: await modelosAtivos() });
}));

const CODIGOS = ['NENHUM', 'BARRAS', 'QR', 'AMBOS'];

function validarModelo(d, partial = false) {
  if (!partial && (!d.nome || !String(d.nome).trim())) throw new HttpError(422, 'Nome do modelo é obrigatório');
  if (d.nome != null && String(d.nome).length > 80) throw new HttpError(422, 'Nome muito longo (máx. 80)');
  for (const f of ['largura_mm', 'altura_mm']) {
    if (d[f] != null && !(Number.isFinite(Number(d[f])) && Number(d[f]) >= 10 && Number(d[f]) <= 500))
      throw new HttpError(422, `Medida inválida em ${f} (entre 10 e 500 mm)`);
  }
  if (d.codigo != null && !CODIGOS.includes(String(d.codigo)))
    throw new HttpError(422, `Código impresso inválido (use ${CODIGOS.join(', ')})`);
  if (d.setores !== undefined && !Array.isArray(d.setores))
    throw new HttpError(422, 'Campo setores deve ser uma lista de IDs');
  if (d.campos !== undefined) {
    if (!Array.isArray(d.campos)) throw new HttpError(422, 'Campo campos deve ser uma lista');
    for (const c of d.campos) {
      if (!c || typeof c !== 'object' || !c.chave || !String(c.chave).trim())
        throw new HttpError(422, 'Cada campo do modelo precisa de uma chave');
      if (c.tam != null && !['P', 'M', 'G'].includes(String(c.tam)))
        throw new HttpError(422, 'Tamanho de campo inválido (P, M ou G)');
    }
  }
}

const normCampos = (campos) => (campos || []).map((c) => ({
  chave: String(c.chave).trim().slice(0, 80),
  rotulo: c.rotulo != null ? String(c.rotulo).slice(0, 40) : '',
  tam: ['P', 'M', 'G'].includes(String(c.tam)) ? String(c.tam) : 'M',
  negrito: c.negrito === true,
}));

r.post('/modelos', requireAdmin, requireCsrf, ah(async (req, res) => {
  const d = req.body || {};
  validarModelo(d);
  const { rows } = await q(
    `INSERT INTO pcp_etiqueta_modelos (nome, largura_mm, altura_mm, setores, campos, codigo, padrao)
     VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)
     ON CONFLICT (nome) DO NOTHING RETURNING id`,
    [
      String(d.nome).trim(),
      d.largura_mm != null ? Number(d.largura_mm) : 100,
      d.altura_mm != null ? Number(d.altura_mm) : 24,
      JSON.stringify((d.setores || []).map(Number)),
      JSON.stringify(normCampos(d.campos)),
      d.codigo || 'AMBOS',
      d.padrao === true,
    ]
  );
  if (!rows[0]) throw new HttpError(409, 'Já existe um modelo com esse nome');
  const id = Number(rows[0].id);
  await audit(req.session.user.id, 'pcp', 'etiqueta.modelo.create', { entityType: 'pcp_etiqueta_modelo', entityId: id });
  res.status(201).json({ id });
}));

r.put('/modelos', requireAdmin, requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const d = req.body || {};
  validarModelo(d, true);
  let result;
  try {
    result = await q(
      `UPDATE pcp_etiqueta_modelos SET
         nome       = COALESCE($2, nome),
         largura_mm = COALESCE($3, largura_mm),
         altura_mm  = COALESCE($4, altura_mm),
         setores    = COALESCE($5::jsonb, setores),
         campos     = COALESCE($6::jsonb, campos),
         codigo     = COALESCE($7, codigo),
         padrao     = COALESCE($8, padrao),
         updated_at = now()
       WHERE id = $1 AND ativo = TRUE`,
      [
        id,
        d.nome != null ? String(d.nome).trim() : null,
        d.largura_mm != null ? Number(d.largura_mm) : null,
        d.altura_mm != null ? Number(d.altura_mm) : null,
        d.setores !== undefined ? JSON.stringify(d.setores.map(Number)) : null,
        d.campos !== undefined ? JSON.stringify(normCampos(d.campos)) : null,
        d.codigo || null,
        typeof d.padrao === 'boolean' ? d.padrao : null,
      ]
    );
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe um modelo com esse nome');
    throw e;
  }
  if (result.rowCount === 0) throw new HttpError(404, 'Modelo não encontrado');
  await audit(req.session.user.id, 'pcp', 'etiqueta.modelo.update', { entityType: 'pcp_etiqueta_modelo', entityId: id });
  res.json({ ok: true });
}));

r.delete('/modelos', requireAdmin, requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const result = await q(
    'UPDATE pcp_etiqueta_modelos SET ativo = FALSE, updated_at = now() WHERE id = $1 AND ativo = TRUE',
    [id]
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Modelo não encontrado');
  await audit(req.session.user.id, 'pcp', 'etiqueta.modelo.delete', { entityType: 'pcp_etiqueta_modelo', entityId: id });
  res.json({ ok: true });
}));

r.get('/dados', requirePerm('etiquetas', 'ver'), ah(async (req, res) => {
  const pedidos = parseLista(req.query.pedidos || req.query.pedido);
  if (!pedidos.length) throw new HttpError(422, 'Informe ?pedidos=');
  const setorIds = req.query.setores ? parseLista(req.query.setores).map(Number) : null;
  res.json(await dadosEtiquetas(pedidos, { setorIds }));
}));

r.post('/imprimir', requirePerm('etiquetas', 'editar'), requireCsrf, ah(async (req, res) => {
  const pedidos = Array.isArray(req.body?.pedidos) ? req.body.pedidos.map(String)
    : parseLista(req.body?.pedidos);
  const pecaIds = Array.isArray(req.body?.peca_ids) ? req.body.peca_ids.map(Number).filter(Boolean) : null;
  const setorIds = Array.isArray(req.body?.setor_ids) ? req.body.setor_ids.map(Number).filter(Boolean) : null;
  if (!pedidos.length && !(pecaIds && pecaIds.length))
    throw new HttpError(422, 'Envie { pedidos: [...] } ou { peca_ids: [...] }');

  // Peças antigas sem código ganham o código próprio agora (idempotente).
  let gerados = 0;
  if (pedidos.length) gerados = await gerarCodigosFaltantes(pedidos);
  if (pecaIds && pecaIds.length) {
    const { rowCount } = await q(
      `UPDATE pcp_pecas SET cod_barras = 'PP' || item_id || '-' || numero,
              vinculada_em = now(), updated_at = now()
       WHERE id = ANY($1::bigint[]) AND cod_barras IS NULL`,
      [pecaIds]
    );
    gerados += rowCount;
  }

  const dados = await dadosEtiquetas(pedidos, { setorIds, pecaIds });
  const pecasUnicas = new Map();
  for (const g of dados.grupos) for (const e of g.etiquetas) pecasUnicas.set(e.peca_id, e);
  const { reimpressao } = await registrarImpressao(
    dados.pedidos.length ? dados.pedidos : [...new Set([...pecasUnicas.values()].map((e) => e.pedido))],
    [...pecasUnicas.values()],
    { setorIds, userId: req.session.user.id, userNome: req.session.user.full_name }
  );
  await audit(req.session.user.id, 'pcp', 'etiqueta.imprimir', { entityType: 'pcp_etiqueta' });
  res.json({ ...dados, reimpressao, codigos_gerados: gerados });
}));

r.get('/log', requirePerm('etiquetas', 'ver'), ah(async (req, res) => {
  const pedido = String(req.query.pedido || '').trim();
  const { rows } = await q(
    `SELECT id, pedido, pedidos, setor_id, modelo_id, tipo, por_nome,
            jsonb_array_length(pecas) AS qtd_pecas,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS quando
     FROM pcp_etiqueta_log l
     ${pedido ? "WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(l.pedidos) e WHERE e = $1)" : ''}
     ORDER BY created_at DESC LIMIT 100`,
    pedido ? [pedido] : []
  );
  res.json({ data: rows });
}));

export default r;
