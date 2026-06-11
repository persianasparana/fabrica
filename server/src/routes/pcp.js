/**
 * Rotas do PCP — fila de produção, peças/bipagem e estrutura do produto.
 *
 * Modelo de peças: cada item de planejamento (produto + qnt) gera `qnt` PEÇAS
 * individuais. A etiqueta (gerada pelo sistema de pedidos) é vinculada à peça
 * na entrada do PCP; a embalagem bipa a etiqueta para dar baixa daquela peça.
 * O item é considerado concluído quando TODAS as peças têm baixa — a coluna
 * `conclusao` do item é sempre derivada das peças.
 *
 *   GET    /api/pcp/itens              lista completa (com peças agregadas)
 *   POST   /api/pcp/itens              cria item + peças       (CSRF)
 *   POST   /api/pcp/itens/lote         importação em lote      (CSRF)
 *   PUT    /api/pcp/itens?id=N         atualização (sincroniza peças) (CSRF)
 *   DELETE /api/pcp/itens?id=N         exclui (cascade nas peças)     (CSRF)
 *   POST   /api/pcp/bip                BAIXA da peça pela etiqueta    (CSRF)
 *   POST   /api/pcp/bip/vincular       vincula etiqueta à próxima peça livre do pedido (CSRF)
 *   PUT    /api/pcp/pecas?id=N         ajustes por peça (desvincular/baixa/reabrir) (CSRF)
 *   GET    /api/pcp/estrutura          estrutura do produto (catálogo)
 *   POST   /api/pcp/estrutura          cria produto            (CSRF)
 *   PUT    /api/pcp/estrutura?id=N     atualiza produto        (CSRF)
 *   DELETE /api/pcp/estrutura?id=N     desativa produto        (CSRF)
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
  SELECT i.id, i.produto, i.produto_id, i.pedido, i.qnt,
         to_char(i.chegada_pcp,  'YYYY-MM-DD') AS chegada_pcp,
         to_char(i.prev_inicial, 'YYYY-MM-DD') AS prev_inicial,
         to_char(i.prev_producao,'YYYY-MM-DD') AS prev_producao,
         to_char(i.conclusao,    'YYYY-MM-DD') AS conclusao,
         to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente,
         i.tipo, i.motivo_atraso, i.observacoes, i.especial,
         COALESCE(pc.pecas, '[]'::json) AS pecas
  FROM pcp_itens i
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'id', pp.id, 'numero', pp.numero, 'cod_barras', pp.cod_barras,
             'conclusao', to_char(pp.conclusao, 'YYYY-MM-DD')
           ) ORDER BY pp.numero) AS pecas
    FROM pcp_pecas pp WHERE pp.item_id = i.id
  ) pc ON TRUE`;

const fmtItem = async (id, exec = q) =>
  (await exec(`${SELECT_ITEM} WHERE i.id = $1`, [id])).rows[0];

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
  if (d.qnt != null && Number(d.qnt) > 500) throw new HttpError(422, 'Quantidade máxima por item: 500 peças');
  if (d.produto && String(d.produto).length > 160) throw new HttpError(422, 'Nome de produto muito longo');
  if (d.observacoes && String(d.observacoes).length > 5000) throw new HttpError(422, 'Observações muito longas');
}

const orNull = (v) => (v === undefined || v === null || v === '' ? null : v);

/** Recalcula a conclusão do item a partir das peças (derivada). */
async function sincronizarConclusaoItem(exec, itemId) {
  await exec(
    `UPDATE pcp_itens SET conclusao = sub.c, updated_at = now()
     FROM (
       SELECT CASE WHEN COUNT(*) FILTER (WHERE conclusao IS NULL) = 0
                   THEN MAX(conclusao) END AS c
       FROM pcp_pecas WHERE item_id = $1
     ) sub
     WHERE id = $1 AND conclusao IS DISTINCT FROM sub.c`,
    [itemId]
  );
}

/** Insere item + suas peças (dentro da transação do chamador). */
async function inserirItem(client, d, userId) {
  const exec = client.query.bind(client);
  const conclusao = orNull(d.conclusao);
  const qnt = Number(d.qnt) || 1;
  const { rows } = await exec(
    `INSERT INTO pcp_itens
       (produto, produto_id, pedido, qnt, chegada_pcp, prev_inicial, prev_producao,
        conclusao, data_cliente, tipo, motivo_atraso, observacoes, especial, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id`,
    [
      String(d.produto).trim(), orNull(d.produto_id), String(d.pedido).trim(),
      qnt, orNull(d.chegada_pcp), orNull(d.prev_inicial),
      orNull(d.prev_producao), conclusao, orNull(d.data_cliente),
      d.tipo || 'Produção nova', d.motivo_atraso || '', (d.observacoes || '').trim(),
      d.especial === true, userId,
    ]
  );
  const id = Number(rows[0].id);
  await exec(
    `INSERT INTO pcp_pecas (item_id, numero, conclusao)
     SELECT $1, gs.n, $2::date FROM generate_series(1, $3::int) AS gs(n)`,
    [id, conclusao, qnt]
  );
  return id;
}

/** Executa fn dentro de uma transação. */
async function emTransacao(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client.query.bind(client), client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Itens da fila ───────────────────────────────────────────────────────────

r.get(
  '/itens',
  ah(async (req, res) => {
    const { rows } = await q(`${SELECT_ITEM} ORDER BY i.id`);
    res.json({ data: rows });
  })
);

r.post(
  '/itens',
  requireCsrf,
  ah(async (req, res) => {
    const d = req.body || {};
    validarItem(d);
    const id = await emTransacao((exec, client) => inserirItem(client, d, req.session.user.id));
    await audit(req.session.user.id, 'pcp', 'item.create', { entityType: 'pcp_item', entityId: id });
    res.status(201).json({ id, item: await fmtItem(id) });
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

    const ids = await emTransacao(async (exec, client) => {
      if (substituir) await exec('DELETE FROM pcp_itens');
      const out = [];
      for (const d of itens) out.push(await inserirItem(client, d, req.session.user.id));
      return out;
    });
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

    await emTransacao(async (exec) => {
      const result = await exec(
        `UPDATE pcp_itens SET
           produto       = COALESCE($2, produto),
           produto_id    = CASE WHEN $12 THEN NULL ELSE COALESCE($3, produto_id) END,
           pedido        = COALESCE($4, pedido),
           qnt           = COALESCE($5, qnt),
           chegada_pcp   = CASE WHEN $13 THEN NULL ELSE COALESCE($6,  chegada_pcp)   END,
           prev_inicial  = COALESCE($7, prev_inicial),
           prev_producao = CASE WHEN $14 THEN NULL ELSE COALESCE($8,  prev_producao) END,
           data_cliente  = CASE WHEN $15 THEN NULL ELSE COALESCE($9,  data_cliente)  END,
           tipo          = COALESCE($10, tipo),
           motivo_atraso = COALESCE($11, motivo_atraso),
           observacoes   = COALESCE($16, observacoes),
           especial      = COALESCE($17, especial),
           updated_at    = now()
         WHERE id = $1`,
        [
          id,
          orNull(d.produto), orNull(d.produto_id), orNull(d.pedido),
          d.qnt != null ? Number(d.qnt) : null,
          orNull(d.chegada_pcp), orNull(d.prev_inicial), orNull(d.prev_producao),
          orNull(d.data_cliente),
          orNull(d.tipo),
          d.motivo_atraso !== undefined ? d.motivo_atraso : null,
          d.produto_id === null,
          d.chegada_pcp === null,
          d.prev_producao === null,
          d.data_cliente === null,
          d.observacoes !== undefined ? d.observacoes : null,
          typeof d.especial === 'boolean' ? d.especial : null,
        ]
      );
      if (result.rowCount === 0) throw new HttpError(404, 'Item não encontrado');

      // Sincroniza as peças com a quantidade do item
      if (d.qnt != null) {
        const qnt = Number(d.qnt);
        await exec(
          `INSERT INTO pcp_pecas (item_id, numero)
           SELECT $1, gs.n FROM generate_series(1, $2::int) AS gs(n)
           WHERE NOT EXISTS (SELECT 1 FROM pcp_pecas WHERE item_id = $1 AND numero = gs.n)`,
          [id, qnt]
        );
        await exec(
          `DELETE FROM pcp_pecas
           WHERE item_id = $1 AND numero > $2 AND cod_barras IS NULL AND conclusao IS NULL`,
          [id, qnt]
        );
        const { rows: sobras } = await exec(
          'SELECT COUNT(*)::int AS c FROM pcp_pecas WHERE item_id = $1 AND numero > $2',
          [id, qnt]
        );
        if (sobras[0].c > 0)
          throw new HttpError(422,
            'Não é possível reduzir a quantidade: há peças excedentes com etiqueta vinculada ou baixa registrada. Desvincule/reabra essas peças antes.');
      }

      // Conclusão manual do item cascateia para as peças
      if (d.conclusao === null) {
        await exec('UPDATE pcp_pecas SET conclusao = NULL, updated_at = now() WHERE item_id = $1', [id]);
      } else if (d.conclusao) {
        await exec(
          'UPDATE pcp_pecas SET conclusao = $2, concluida_por = $3, updated_at = now() WHERE item_id = $1 AND conclusao IS NULL',
          [id, d.conclusao, req.session.user.id]
        );
      }
      await sincronizarConclusaoItem(exec, id);
    });

    await audit(req.session.user.id, 'pcp', 'item.update', { entityType: 'pcp_item', entityId: id });
    res.json({ ok: true, item: await fmtItem(id) });
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

// ─── Bipagem (etiqueta -> peça) ──────────────────────────────────────────────
// Embalagem bipa uma etiqueta VINCULADA -> baixa daquela peça (atômico).

r.post(
  '/bip',
  requireCsrf,
  ah(async (req, res) => {
    const codigo = String(req.body?.codigo || '').trim();
    if (!codigo) throw new HttpError(422, 'Código é obrigatório');

    const { rows } = await q(
      'SELECT id, item_id, numero, conclusao FROM pcp_pecas WHERE cod_barras = $1',
      [codigo]
    );
    const peca = rows[0];
    if (!peca) return res.json({ acao: 'desconhecido' });

    let acao;
    if (peca.conclusao) {
      acao = 'jafoi';
    } else {
      await emTransacao(async (exec) => {
        await exec(
          'UPDATE pcp_pecas SET conclusao = CURRENT_DATE, concluida_por = $2, updated_at = now() WHERE id = $1',
          [peca.id, req.session.user.id]
        );
        await sincronizarConclusaoItem(exec, peca.item_id);
      });
      acao = 'baixa';
      await audit(req.session.user.id, 'pcp', 'bip.baixa', { entityType: 'pcp_peca', entityId: Number(peca.id) });
    }
    const item = await fmtItem(peca.item_id);
    res.json({ acao, item, peca_numero: Number(peca.numero) });
  })
);

// Entrada no PCP: vincula a etiqueta à PRÓXIMA peça livre (sem etiqueta e sem
// baixa) do pedido informado e registra a chegada do item, se ainda não houver.
r.post(
  '/bip/vincular',
  requireCsrf,
  ah(async (req, res) => {
    const codigo = String(req.body?.codigo || '').trim();
    const pedido = String(req.body?.pedido || '').trim();
    if (!codigo || !pedido) throw new HttpError(422, 'Código e pedido são obrigatórios');

    const { rows: existente } = await q(
      `SELECT pp.numero, i.pedido, i.produto FROM pcp_pecas pp
       JOIN pcp_itens i ON i.id = pp.item_id WHERE pp.cod_barras = $1`,
      [codigo]
    );
    if (existente[0])
      throw new HttpError(409,
        `Etiqueta já vinculada à peça ${existente[0].numero} do pedido ${existente[0].pedido} (${existente[0].produto}). Desvincule antes de reutilizar.`);

    const out = await emTransacao(async (exec) => {
      const { rows: livres } = await exec(
        `SELECT pp.id, pp.item_id, pp.numero FROM pcp_pecas pp
         JOIN pcp_itens i ON i.id = pp.item_id
         WHERE i.pedido = $1 AND pp.cod_barras IS NULL AND pp.conclusao IS NULL
         ORDER BY pp.item_id, pp.numero
         LIMIT 1 FOR UPDATE OF pp`,
        [pedido]
      );
      const livre = livres[0];
      if (!livre) {
        const { rows: tem } = await exec('SELECT 1 FROM pcp_itens WHERE pedido = $1 LIMIT 1', [pedido]);
        throw new HttpError(tem[0] ? 409 : 404,
          tem[0]
            ? `Todas as peças em aberto do pedido ${pedido} já têm etiqueta vinculada.`
            : `Pedido ${pedido} não encontrado.`);
      }
      await exec(
        'UPDATE pcp_pecas SET cod_barras = $2, vinculada_em = now(), updated_at = now() WHERE id = $1',
        [livre.id, codigo]
      );
      await exec(
        'UPDATE pcp_itens SET chegada_pcp = COALESCE(chegada_pcp, CURRENT_DATE), updated_at = now() WHERE id = $1',
        [livre.item_id]
      );
      const { rows: prog } = await exec(
        `SELECT COUNT(*) FILTER (WHERE pp.cod_barras IS NOT NULL)::int AS vinculadas,
                COUNT(*)::int AS total
         FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id WHERE i.pedido = $1`,
        [pedido]
      );
      return { pecaId: Number(livre.id), itemId: livre.item_id, numero: Number(livre.numero), progresso: prog[0] };
    });

    await audit(req.session.user.id, 'pcp', 'bip.vincular', { entityType: 'pcp_peca', entityId: out.pecaId });
    res.json({
      acao: 'vinculada',
      item: await fmtItem(out.itemId),
      peca_numero: out.numero,
      progresso: out.progresso,
    });
  })
);

// Ajustes por peça: desvincular etiqueta, baixa manual, reabrir.
//   { cod_barras: null }            -> desvincula a etiqueta
//   { conclusao: 'YYYY-MM-DD' }     -> baixa manual
//   { conclusao: null }             -> reabre a peça
r.put(
  '/pecas',
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    if (d.conclusao != null && !DATE_RE.test(d.conclusao))
      throw new HttpError(422, 'Data de conclusão inválida (use YYYY-MM-DD)');
    if (d.cod_barras !== undefined && d.cod_barras !== null && !String(d.cod_barras).trim())
      throw new HttpError(422, 'Código de barras não pode ser vazio (use null para desvincular)');

    const itemId = await emTransacao(async (exec) => {
      const { rows } = await exec('SELECT item_id FROM pcp_pecas WHERE id = $1 FOR UPDATE', [id]);
      if (!rows[0]) throw new HttpError(404, 'Peça não encontrada');
      if (d.cod_barras !== undefined) {
        const novo = d.cod_barras === null ? null : String(d.cod_barras).trim();
        if (novo) {
          const { rows: dup } = await exec(
            'SELECT 1 FROM pcp_pecas WHERE cod_barras = $1 AND id <> $2', [novo, id]);
          if (dup[0]) throw new HttpError(409, 'Esta etiqueta já está vinculada a outra peça.');
        }
        await exec(
          `UPDATE pcp_pecas SET cod_barras = $2::varchar,
                  vinculada_em = CASE WHEN $2::varchar IS NULL THEN NULL ELSE now() END,
                  updated_at = now()
           WHERE id = $1`,
          [id, novo]
        );
      }
      if (d.conclusao !== undefined) {
        await exec(
          `UPDATE pcp_pecas SET conclusao = $2::date,
                  concluida_por = CASE WHEN $2::date IS NULL THEN NULL ELSE $3::bigint END,
                  updated_at = now()
           WHERE id = $1`,
          [id, d.conclusao, req.session.user.id]
        );
      }
      await sincronizarConclusaoItem(exec, rows[0].item_id);
      return rows[0].item_id;
    });

    await audit(req.session.user.id, 'pcp', 'peca.update', { entityType: 'pcp_peca', entityId: id });
    res.json({ ok: true, item: await fmtItem(itemId) });
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
