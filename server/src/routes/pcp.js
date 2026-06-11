/**
 * Rotas do PCP — fila de produção, bipagem e estrutura do produto.
 *
 *   GET    /api/pcp/itens              lista completa (o app filtra no cliente)
 *   POST   /api/pcp/itens              cria item            (CSRF)
 *   POST   /api/pcp/itens/lote         importação em lote   (CSRF)
 *   PUT    /api/pcp/itens?id=N         atualização parcial  (CSRF)
 *   DELETE /api/pcp/itens?id=N         exclui               (CSRF)
 *   POST   /api/pcp/bip                bipagem por código de barras (CSRF)
 *   POST   /api/pcp/bip/vincular       vincula código a um pedido   (CSRF)
 *   GET    /api/pcp/estrutura          estrutura do produto (catálogo)
 *   POST   /api/pcp/estrutura          cria produto         (CSRF)
 *   PUT    /api/pcp/estrutura?id=N     atualiza produto     (CSRF)
 *   DELETE /api/pcp/estrutura?id=N     desativa produto     (CSRF)
 */
import { Router } from 'express';
import { requireAuth, requireCsrf, audit } from '../auth.js';
import { q, pool } from '../db.js';
import { ah, HttpError } from '../util.js';

const r = Router();
r.use(requireAuth);

const TIPOS = ['Produção nova', 'Retrabalho', 'Higienização', 'Carry-over 2025', 'Showroom'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_ITEM = `
  SELECT id, produto, produto_id, pedido, qnt,
         to_char(chegada_pcp,  'YYYY-MM-DD') AS chegada_pcp,
         to_char(prev_inicial, 'YYYY-MM-DD') AS prev_inicial,
         to_char(prev_producao,'YYYY-MM-DD') AS prev_producao,
         to_char(conclusao,    'YYYY-MM-DD') AS conclusao,
         to_char(data_cliente, 'YYYY-MM-DD') AS data_cliente,
         tipo, motivo_atraso, observacoes, cod_barras
  FROM pcp_itens`;

function validarItem(d, partial = false) {
  if (!partial) {
    if (!d.produto || !String(d.produto).trim()) throw new HttpError(422, 'Produto é obrigatório');
    if (!d.pedido || !String(d.pedido).trim()) throw new HttpError(422, 'Número do pedido é obrigatório');
  }
  for (const f of ['chegada_pcp', 'prev_inicial', 'prev_producao', 'conclusao', 'data_cliente']) {
    if (d[f] != null && d[f] !== '' && !DATE_RE.test(d[f]))
      throw new HttpError(422, `Data inválida em ${f} (use YYYY-MM-DD)`);
  }
  if (d.tipo && !TIPOS.includes(d.tipo)) throw new HttpError(422, 'Tipo de produção inválido');
  if (d.qnt != null && (!Number.isFinite(Number(d.qnt)) || Number(d.qnt) < 1))
    throw new HttpError(422, 'Quantidade deve ser um número >= 1');
  if (d.produto && String(d.produto).length > 160) throw new HttpError(422, 'Nome de produto muito longo');
  if (d.observacoes && String(d.observacoes).length > 5000) throw new HttpError(422, 'Observações muito longas');
}

const orNull = (v) => (v === undefined || v === null || v === '' ? null : v);

async function inserirItem(d, userId, client = null) {
  const exec = client ? client.query.bind(client) : q;
  const { rows } = await exec(
    `INSERT INTO pcp_itens
       (produto, produto_id, pedido, qnt, chegada_pcp, prev_inicial, prev_producao,
        conclusao, data_cliente, tipo, motivo_atraso, observacoes, cod_barras, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      String(d.produto).trim(), orNull(d.produto_id), String(d.pedido).trim(),
      Number(d.qnt) || 1, orNull(d.chegada_pcp), orNull(d.prev_inicial),
      orNull(d.prev_producao), orNull(d.conclusao), orNull(d.data_cliente),
      d.tipo || 'Produção nova', d.motivo_atraso || '', (d.observacoes || '').trim(),
      orNull(d.cod_barras), userId,
    ]
  );
  return Number(rows[0].id);
}

// ─── Itens da fila ───────────────────────────────────────────────────────────

r.get(
  '/itens',
  ah(async (req, res) => {
    const { rows } = await q(`${SELECT_ITEM} ORDER BY id`);
    res.json({ data: rows });
  })
);

r.post(
  '/itens',
  requireCsrf,
  ah(async (req, res) => {
    const d = req.body || {};
    validarItem(d);
    const id = await inserirItem(d, req.session.user.id);
    await audit(req.session.user.id, 'pcp', 'item.create', { entityType: 'pcp_item', entityId: id });
    res.status(201).json({ id });
  })
);

// Importação em lote (Excel / PDF / JSON colado) — transação única.
// { itens: [...], substituir: true } apaga a fila atual antes de inserir.
r.post(
  '/itens/lote',
  requireCsrf,
  ah(async (req, res) => {
    const itens = req.body?.itens;
    const substituir = req.body?.substituir === true;
    if (!Array.isArray(itens) || itens.length === 0)
      throw new HttpError(422, 'Envie { itens: [...] } com pelo menos 1 item');
    if (itens.length > 2000) throw new HttpError(413, 'Lote muito grande (máx. 2000 itens)');
    itens.forEach((d, i) => {
      try { validarItem(d); } catch (e) { throw new HttpError(422, `Item ${i + 1}: ${e.message}`); }
    });

    const client = await pool.connect();
    let ids = [];
    try {
      await client.query('BEGIN');
      if (substituir) await client.query('DELETE FROM pcp_itens');
      for (const d of itens) ids.push(await inserirItem(d, req.session.user.id, client));
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    await audit(req.session.user.id, 'pcp', substituir ? 'item.lote.substituir' : 'item.lote', {
      entityType: 'pcp_item',
      entityId: ids[0],
    });
    res.status(201).json({ ids, count: ids.length });
  })
);

r.put(
  '/itens',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    validarItem(d, true);

    // limpar_conclusao / limpar_* : permite anular datas explicitamente
    const result = await q(
      `UPDATE pcp_itens SET
         produto       = COALESCE($2, produto),
         produto_id    = CASE WHEN $14 THEN NULL ELSE COALESCE($3, produto_id) END,
         pedido        = COALESCE($4, pedido),
         qnt           = COALESCE($5, qnt),
         chegada_pcp   = CASE WHEN $15 THEN NULL ELSE COALESCE($6,  chegada_pcp)   END,
         prev_inicial  = COALESCE($7, prev_inicial),
         prev_producao = CASE WHEN $16 THEN NULL ELSE COALESCE($8,  prev_producao) END,
         conclusao     = CASE WHEN $17 THEN NULL ELSE COALESCE($9,  conclusao)     END,
         data_cliente  = CASE WHEN $18 THEN NULL ELSE COALESCE($10, data_cliente)  END,
         tipo          = COALESCE($11, tipo),
         motivo_atraso = COALESCE($12, motivo_atraso),
         observacoes   = COALESCE($13, observacoes),
         cod_barras    = CASE WHEN $19 THEN NULL ELSE COALESCE($20, cod_barras)    END,
         updated_at    = now()
       WHERE id = $1`,
      [
        id,
        orNull(d.produto), orNull(d.produto_id), orNull(d.pedido),
        d.qnt != null ? Number(d.qnt) : null,
        orNull(d.chegada_pcp), orNull(d.prev_inicial), orNull(d.prev_producao),
        orNull(d.conclusao), orNull(d.data_cliente),
        orNull(d.tipo),
        d.motivo_atraso !== undefined ? d.motivo_atraso : null,
        d.observacoes !== undefined ? d.observacoes : null,
        d.produto_id === null,
        d.chegada_pcp === null,
        d.prev_producao === null,
        d.conclusao === null,
        d.data_cliente === null,
        d.cod_barras === null,
        orNull(d.cod_barras),
      ]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Item não encontrado');
    await audit(req.session.user.id, 'pcp', 'item.update', { entityType: 'pcp_item', entityId: id });
    res.json({ ok: true });
  })
);

r.delete(
  '/itens',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const result = await q('DELETE FROM pcp_itens WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Item não encontrado');
    await audit(req.session.user.id, 'pcp', 'item.delete', { entityType: 'pcp_item', entityId: id });
    res.json({ ok: true });
  })
);

// ─── Bipagem (código de barras) ──────────────────────────────────────────────
// Atômica no servidor: 1º bip = entrada no PCP, 2º bip = conclusão.

const fmtItem = async (id) => (await q(`${SELECT_ITEM} WHERE id = $1`, [id])).rows[0];

r.post(
  '/bip',
  requireCsrf,
  ah(async (req, res) => {
    const codigo = String(req.body?.codigo || '').trim();
    if (!codigo) throw new HttpError(422, 'Código é obrigatório');

    const { rows } = await q('SELECT id, chegada_pcp, conclusao FROM pcp_itens WHERE cod_barras = $1', [codigo]);
    const found = rows[0];
    if (!found) return res.json({ acao: 'desconhecido' });

    let acao;
    if (!found.chegada_pcp) {
      await q('UPDATE pcp_itens SET chegada_pcp = CURRENT_DATE, updated_at = now() WHERE id = $1', [found.id]);
      acao = 'entrada';
    } else if (!found.conclusao) {
      await q('UPDATE pcp_itens SET conclusao = CURRENT_DATE, updated_at = now() WHERE id = $1', [found.id]);
      acao = 'conclusao';
    } else {
      acao = 'jafoi';
    }
    if (acao !== 'jafoi')
      await audit(req.session.user.id, 'pcp', `bip.${acao}`, { entityType: 'pcp_item', entityId: Number(found.id) });
    res.json({ acao, item: await fmtItem(found.id) });
  })
);

r.post(
  '/bip/vincular',
  requireCsrf,
  ah(async (req, res) => {
    const codigo = String(req.body?.codigo || '').trim();
    const pedido = String(req.body?.pedido || '').trim();
    if (!codigo || !pedido) throw new HttpError(422, 'Código e pedido são obrigatórios');

    // preferir item do pedido ainda sem código vinculado
    const { rows } = await q(
      `SELECT id FROM pcp_itens WHERE pedido = $1
       ORDER BY (cod_barras IS NULL) DESC, id LIMIT 1`,
      [pedido]
    );
    if (!rows[0]) throw new HttpError(404, `Pedido ${pedido} não encontrado`);
    const id = Number(rows[0].id);

    await q('UPDATE pcp_itens SET cod_barras = NULL WHERE cod_barras = $1 AND id <> $2', [codigo, id]);
    await q(
      `UPDATE pcp_itens SET cod_barras = $2,
              chegada_pcp = COALESCE(chegada_pcp, CURRENT_DATE), updated_at = now()
       WHERE id = $1`,
      [id, codigo]
    );
    await audit(req.session.user.id, 'pcp', 'bip.vincular', { entityType: 'pcp_item', entityId: id });
    res.json({ acao: 'entrada', item: await fmtItem(id) });
  })
);

// ─── Estrutura do produto (catálogo oficial) ─────────────────────────────────

r.get(
  '/estrutura',
  ah(async (req, res) => {
    const { rows } = await q(
      `SELECT id, chave, nome, familia, tubo, unidade, cortes, componentes,
              calculo_extra_fonte, ativo
       FROM pcp_produtos WHERE ativo = TRUE ORDER BY familia, nome`
    );
    res.json({ data: rows });
  })
);

function validarProduto(d, partial = false) {
  if (!partial) {
    if (!d.nome || !String(d.nome).trim()) throw new HttpError(422, 'Nome é obrigatório');
    if (!d.familia || !String(d.familia).trim()) throw new HttpError(422, 'Família é obrigatória');
  }
  for (const f of ['cortes', 'componentes']) {
    if (d[f] !== undefined && !Array.isArray(d[f]))
      throw new HttpError(422, `Campo ${f} deve ser uma lista`);
  }
  if (d.unidade && !['cm', 'm'].includes(d.unidade)) throw new HttpError(422, "Unidade deve ser 'cm' ou 'm'");
}

const slug = (s) =>
  String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);

r.post(
  '/estrutura',
  requireCsrf,
  ah(async (req, res) => {
    const d = req.body || {};
    validarProduto(d);
    const chave = d.chave ? slug(d.chave) : slug(d.nome);
    const { rows } = await q(
      `INSERT INTO pcp_produtos (chave, nome, familia, tubo, unidade, cortes, componentes)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
       ON CONFLICT (chave) DO NOTHING
       RETURNING id`,
      [
        chave, String(d.nome).trim(), String(d.familia).trim().toUpperCase(),
        orNull(d.tubo), d.unidade || 'cm',
        JSON.stringify(d.cortes || []), JSON.stringify(d.componentes || []),
      ]
    );
    if (!rows[0]) throw new HttpError(409, 'Já existe um produto com essa chave/nome');
    const id = Number(rows[0].id);
    await audit(req.session.user.id, 'pcp', 'produto.create', { entityType: 'pcp_produto', entityId: id });
    res.status(201).json({ id, chave });
  })
);

r.put(
  '/estrutura',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    validarProduto(d, true);
    const result = await q(
      `UPDATE pcp_produtos SET
         nome        = COALESCE($2, nome),
         familia     = COALESCE($3, familia),
         tubo        = CASE WHEN $8 THEN NULL ELSE COALESCE($4, tubo) END,
         unidade     = COALESCE($5, unidade),
         cortes      = COALESCE($6::jsonb, cortes),
         componentes = COALESCE($7::jsonb, componentes),
         updated_at  = now()
       WHERE id = $1 AND ativo = TRUE`,
      [
        id, orNull(d.nome), d.familia ? String(d.familia).toUpperCase() : null,
        orNull(d.tubo), orNull(d.unidade),
        d.cortes !== undefined ? JSON.stringify(d.cortes) : null,
        d.componentes !== undefined ? JSON.stringify(d.componentes) : null,
        d.tubo === null,
      ]
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Produto não encontrado');
    await audit(req.session.user.id, 'pcp', 'produto.update', { entityType: 'pcp_produto', entityId: id });
    res.json({ ok: true });
  })
);

// Exclusão lógica (itens antigos podem referenciar o produto)
r.delete(
  '/estrutura',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const result = await q('UPDATE pcp_produtos SET ativo = FALSE, updated_at = now() WHERE id = $1 AND ativo = TRUE', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Produto não encontrado');
    await audit(req.session.user.id, 'pcp', 'produto.delete', { entityType: 'pcp_produto', entityId: id });
    res.json({ ok: true });
  })
);

export default r;
