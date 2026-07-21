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
 *   POST   /api/pcp/bip                bipagem por setor: { codigo, setor_id, evento } (CSRF)
 *                                      início = assume status do setor (após dependências);
 *                                      fim do setor "final" = baixa da peça
 *   POST   /api/pcp/bip/vincular       vincula etiqueta à próxima peça livre do pedido (CSRF)
 *   PUT    /api/pcp/pecas?id=N         ajustes por peça (desvincular/baixa/reabrir) (CSRF)
 *   GET    /api/pcp/estrutura          estrutura do produto (catálogo)
 *   POST   /api/pcp/estrutura          cria produto            (CSRF)
 *   PUT    /api/pcp/estrutura?id=N     atualiza produto        (CSRF)
 *   DELETE /api/pcp/estrutura?id=N     desativa produto        (CSRF)
 */
import { Router } from 'express';
import { requireAuth, requireAdmin, requireCsrf, requirePerm, audit } from '../auth.js';
import { q, pool } from '../db.js';
import { ah, HttpError } from '../util.js';
// Fase C do ciclo — avanço automático do pedido federado (fire-and-forget)
import { avancarPedidoSilencioso, ehPedidoComercial } from '../comercial-client.js';

const r = Router();
r.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SELECT_ITEM = `
  SELECT i.id, i.produto, i.produto_id, i.pedido, i.qnt,
         to_char(i.chegada_pcp,  'YYYY-MM-DD') AS chegada_pcp,
         to_char(i.prev_inicial, 'YYYY-MM-DD') AS prev_inicial,
         to_char(i.prev_producao,'YYYY-MM-DD') AS prev_producao,
         to_char(i.conclusao,    'YYYY-MM-DD') AS conclusao,
         to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente,
         i.tipo, i.motivo_atraso, i.observacoes, i.especial,
         i.cliente, i.colecao, i.cor_tecido, i.cor_perfil, i.acionamento,
         i.ambiente, i.atributos, i.comercial_item_id,
         i.status_id, st.nome AS status_nome, st.cor AS status_cor,
         COALESCE(pc.pecas, '[]'::json) AS pecas
  FROM pcp_itens i
  LEFT JOIN pcp_status st ON st.id = i.status_id
  LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
             'id', pp.id, 'numero', pp.numero, 'cod_barras', pp.cod_barras,
             'conclusao', to_char(pp.conclusao, 'YYYY-MM-DD'),
             'largura', pp.largura, 'altura', pp.altura, 'medidas', pp.medidas,
             'gaveta_id', pp.gaveta_id,
             'gaveta', (SELECT g.nome FROM pcp_gavetas g WHERE g.id = pp.gaveta_id)
           ) ORDER BY pp.numero) AS pecas
    FROM pcp_pecas pp WHERE pp.item_id = i.id
  ) pc ON TRUE`;

const fmtItem = async (id, exec = q) =>
  (await exec(`${SELECT_ITEM} WHERE i.id = $1`, [id])).rows[0];

export function validarItem(d, partial = false) {
  if (!partial) {
    if (!d.produto || !String(d.produto).trim()) throw new HttpError(422, 'Produto é obrigatório');
    if (!d.pedido || !String(d.pedido).trim()) throw new HttpError(422, 'Número do pedido é obrigatório');
  }
  for (const f of ['chegada_pcp', 'prev_inicial', 'prev_producao', 'conclusao', 'data_cliente']) {
    if (d[f] != null && d[f] !== '' && !DATE_RE.test(d[f]))
      throw new HttpError(422, `Data inválida em ${f} (use YYYY-MM-DD)`);
  }
  // O tipo é validado contra o cadastro de tipos (pcp_tipos) nas transações.
  for (const f of ['largura', 'altura']) {
    if (d[f] != null && d[f] !== '' && !(Number.isFinite(Number(d[f])) && Number(d[f]) > 0))
      throw new HttpError(422, `Medida inválida em ${f} (use um número maior que zero)`);
  }
  if (d.qnt != null && (!Number.isFinite(Number(d.qnt)) || Number(d.qnt) < 1))
    throw new HttpError(422, 'Quantidade deve ser um número >= 1');
  if (d.qnt != null && Number(d.qnt) > 500) throw new HttpError(422, 'Quantidade máxima por item: 500 peças');
  if (d.produto && String(d.produto).length > 160) throw new HttpError(422, 'Nome de produto muito longo');
  if (d.observacoes && String(d.observacoes).length > 5000) throw new HttpError(422, 'Observações muito longas');
  if (d.etiqueta != null && String(d.etiqueta).trim().length > 64)
    throw new HttpError(422, 'Etiqueta muito longa (máx. 64 caracteres)');
  // Spec estruturada (F1) — todos opcionais
  if (d.cliente != null && String(d.cliente).length > 160) throw new HttpError(422, 'Nome de cliente muito longo');
  for (const f of ['colecao', 'cor_tecido', 'cor_perfil', 'acionamento', 'ambiente']) {
    if (d[f] != null && String(d[f]).length > 120) throw new HttpError(422, `Campo ${f} muito longo (máx. 120)`);
  }
  if (d.atributos !== undefined && d.atributos !== null &&
      (typeof d.atributos !== 'object' || Array.isArray(d.atributos)))
    throw new HttpError(422, 'Campo atributos deve ser um objeto { chave: valor }');
  if (d.status_id != null && d.status_id !== '' && !Number.isInteger(Number(d.status_id)))
    throw new HttpError(422, 'Status de produção inválido');
}

const orNull = (v) => (v === undefined || v === null || v === '' ? null : v);

/** Garante que o status de produção existe e está ativo (dentro da transação). */
async function assertStatus(exec, id) {
  if (id == null || id === '') return;
  const { rows } = await exec('SELECT 1 FROM pcp_status WHERE id = $1 AND ativo = TRUE', [Number(id)]);
  if (!rows[0]) throw new HttpError(422, 'Status de produção inexistente ou inativo');
}

/** Garante que o tipo de produção existe e está ativo (dentro da transação). */
async function assertTipo(exec, nome) {
  if (nome == null || nome === '') return;
  const { rows } = await exec('SELECT 1 FROM pcp_tipos WHERE nome = $1 AND ativo = TRUE', [String(nome)]);
  if (!rows[0]) throw new HttpError(422, 'Tipo de produção inexistente ou inativo');
}

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

/** Insere item + suas peças (dentro da transação do chamador).
 *  `etiqueta` (opcional) é vinculada à peça 1 — bipada no cadastro do pedido;
 *  nesse caso a chegada ao PCP é registrada automaticamente se não informada. */
export async function inserirItem(client, d, userId) {
  const exec = client.query.bind(client);
  const conclusao = orNull(d.conclusao);
  const qnt = Number(d.qnt) || 1;
  const etiqueta = d.etiqueta != null && String(d.etiqueta).trim() ? String(d.etiqueta).trim() : null;
  // Sem tipo informado, usa o tipo marcado como padrão no cadastro (pcp_tipos).
  let tipo = d.tipo != null && String(d.tipo).trim() ? String(d.tipo).trim() : null;
  if (!tipo) {
    const { rows: pad } = await exec(
      'SELECT nome FROM pcp_tipos WHERE padrao = TRUE AND ativo = TRUE ORDER BY ordem, id LIMIT 1'
    );
    tipo = (pad[0] && pad[0].nome) || 'Produção nova';
  }
  const { rows } = await exec(
    `INSERT INTO pcp_itens
       (produto, produto_id, pedido, qnt, chegada_pcp, prev_inicial, prev_producao,
        conclusao, data_cliente, tipo, motivo_atraso, observacoes, especial, created_by,
        cliente, colecao, cor_tecido, cor_perfil, acionamento, ambiente, atributos, comercial_item_id)
     VALUES ($1,$2,$3,$4,
             COALESCE($5::date, CASE WHEN $15::varchar IS NOT NULL THEN CURRENT_DATE END),
             $6,$7,$8,$9,$10,$11,$12,$13,$14,
             $16,$17,$18,$19,$20,$21,COALESCE($22::jsonb,'{}'::jsonb),$23)
     RETURNING id`,
    [
      String(d.produto).trim(), orNull(d.produto_id), String(d.pedido).trim(),
      qnt, orNull(d.chegada_pcp), orNull(d.prev_inicial),
      orNull(d.prev_producao), conclusao, orNull(d.data_cliente),
      tipo, d.motivo_atraso || '', (d.observacoes || '').trim(),
      d.especial === true, userId, etiqueta,
      orNull(d.cliente), orNull(d.colecao), orNull(d.cor_tecido), orNull(d.cor_perfil),
      orNull(d.acionamento), orNull(d.ambiente),
      d.atributos && typeof d.atributos === 'object' && !Array.isArray(d.atributos)
        ? JSON.stringify(d.atributos) : null,
      orNull(d.comercial_item_id),
    ]
  );
  const id = Number(rows[0].id);
  await exec(
    `INSERT INTO pcp_pecas (item_id, numero, conclusao)
     SELECT $1, gs.n, $2::date FROM generate_series(1, $3::int) AS gs(n)`,
    [id, conclusao, qnt]
  );
  if (etiqueta) {
    await exec(
      'UPDATE pcp_pecas SET cod_barras = $2, vinculada_em = now() WHERE item_id = $1 AND numero = 1',
      [id, etiqueta]
    );
  }
  // F2 — código PRÓPRIO por peça ("número de série" da peça manufaturada):
  // PP<item>-<n>, curto e único; a peça já nasce vinculada (some o passo de
  // "vincular etiqueta" do fluxo SYSOP). Usado na importação do Comercial.
  if (d.gerar_etiquetas === true) {
    await exec(
      `UPDATE pcp_pecas SET cod_barras = 'PP' || item_id || '-' || numero, vinculada_em = now()
       WHERE item_id = $1 AND cod_barras IS NULL`,
      [id]
    );
  }
  // Medidas informadas já no cadastro alimentam o cálculo de cortes. Como cada
  // produto do formulário entra com qnt=1, a medida vale para a(s) peça(s) do item.
  const larg = d.largura != null && d.largura !== '' ? Number(d.largura) : null;
  const alt  = d.altura  != null && d.altura  !== '' ? Number(d.altura)  : null;
  const medidas =
    d.medidas && typeof d.medidas === 'object' && Object.keys(d.medidas).length ? d.medidas : null;
  if (larg != null || alt != null || medidas != null) {
    await exec(
      `UPDATE pcp_pecas SET
         largura = COALESCE($2, largura),
         altura  = COALESCE($3, altura),
         medidas = COALESCE($4::jsonb, medidas)
       WHERE item_id = $1`,
      [id, larg, alt, medidas ? JSON.stringify(medidas) : null]
    );
  }
  return id;
}

/** Converte violação de unicidade da etiqueta em erro 409 legível. */
function trataEtiquetaDuplicada(e) {
  if (e && e.code === '23505' && /cod_barras/.test(e.constraint || e.detail || '')) {
    const m = /\((?:cod_barras)\)=\(([^)]+)\)/.exec(e.detail || '');
    return new HttpError(409, `Etiqueta ${m ? m[1] + ' ' : ''}já está vinculada a outra peça.`);
  }
  return e;
}

/** Executa fn dentro de uma transação. */
export async function emTransacao(fn) {
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
  requirePerm('novo', 'editar'),
  ah(async (req, res) => {
    const d = req.body || {};
    validarItem(d);
    let id;
    try {
      id = await emTransacao((exec, client) => inserirItem(client, d, req.session.user.id));
    } catch (e) { throw trataEtiquetaDuplicada(e); }
    await audit(req.session.user.id, 'pcp', 'item.create', { entityType: 'pcp_item', entityId: id });
    res.status(201).json({ id, item: await fmtItem(id) });
  })
);

// Importação em lote (Excel / PDF / JSON colado) — transação única.
// { itens: [...], substituir: true } apaga a fila atual antes de inserir.
r.post(
  '/itens/lote',
  requireCsrf,
  requirePerm('novo', 'editar'),
  ah(async (req, res) => {
    const itens = req.body?.itens;
    const substituir = req.body?.substituir === true;
    if (!Array.isArray(itens) || itens.length === 0)
      throw new HttpError(422, 'Envie { itens: [...] } com pelo menos 1 item');
    if (itens.length > 2000) throw new HttpError(413, 'Lote muito grande (máx. 2000 itens)');
    itens.forEach((d, i) => {
      try { validarItem(d); } catch (e) { throw new HttpError(422, `Item ${i + 1}: ${e.message}`); }
    });
    // tipos válidos vêm do cadastro de tipos (admin), não de lista fixa
    const { rows: tnames } = await q('SELECT nome FROM pcp_tipos WHERE ativo = TRUE');
    const tiposValidos = new Set(tnames.map((t) => t.nome));
    itens.forEach((d, i) => {
      if (d.tipo && !tiposValidos.has(String(d.tipo)))
        throw new HttpError(422, `Item ${i + 1}: tipo de produção “${d.tipo}” não está cadastrado`);
    });
    // etiquetas repetidas dentro do próprio lote
    const etiquetas = itens
      .map((d) => (d.etiqueta != null ? String(d.etiqueta).trim() : ''))
      .filter(Boolean);
    const repetida = etiquetas.find((e, i) => etiquetas.indexOf(e) !== i);
    if (repetida) throw new HttpError(422, `Etiqueta repetida no pedido: ${repetida}`);

    let ids;
    try {
      ids = await emTransacao(async (exec, client) => {
        if (substituir) await exec('DELETE FROM pcp_itens');
        const out = [];
        for (const d of itens) out.push(await inserirItem(client, d, req.session.user.id));
        return out;
      });
    } catch (e) { throw trataEtiquetaDuplicada(e); }
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
  requirePerm('fila', 'editar'),
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    validarItem(d, true);

    await emTransacao(async (exec) => {
      await assertStatus(exec, d.status_id);
      await assertTipo(exec, d.tipo);
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
           status_id     = CASE WHEN $18 THEN NULL ELSE COALESCE($19::bigint, status_id) END,
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
          d.status_id === null,
          d.status_id != null && d.status_id !== '' ? Number(d.status_id) : null,
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
  requirePerm('fila', 'editar'),
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const result = await q('DELETE FROM pcp_itens WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Item não encontrado');
    await audit(req.session.user.id, 'pcp', 'item.delete', { entityType: 'pcp_item', entityId: id });
    res.json({ ok: true });
  })
);

// ─── Pedido (edição em massa de todos os itens/peças) ───────────────────────

// GET /api/pcp/pedido?pedido=NNN -> { pedido, itens: [...] }
r.get(
  '/pedido',
  ah(async (req, res) => {
    const pedido = String(req.query.pedido || '').trim();
    if (!pedido) throw new HttpError(400, 'Parâmetro "pedido" obrigatório');
    const { rows } = await q(`${SELECT_ITEM} WHERE i.pedido = $1 ORDER BY i.id`, [pedido]);
    if (!rows.length) throw new HttpError(404, `Pedido ${pedido} não encontrado`);
    // Infos de nível de pedido do Comercial (vendedor, obs, modalidade) —
    // gravadas na liberação; alimentam a Ficha de Produção. null p/ manuais.
    const { rows: info } = await q(
      `SELECT cliente, vendedor, modalidade, observacoes, prazo_dias,
              to_char(aprovado_fin, 'YYYY-MM-DD') AS aprovado_fin
       FROM pcp_pedido_info WHERE pedido = $1`, [pedido]);
    res.json({ pedido, itens: rows, info: info[0] || null });
  })
);

// PUT /api/pcp/pedido?pedido=NNN — aplica mudanças a TODOS os itens do pedido.
// Campos comuns só alteram o que for enviado. `acao` muda o status de TODAS as
// peças de uma vez: 'concluir' (baixa) ou 'reabrir'.
r.put(
  '/pedido',
  requireCsrf,
  requirePerm('pedido', 'editar'),
  ah(async (req, res) => {
    const pedido = String(req.query.pedido || '').trim();
    if (!pedido) throw new HttpError(400, 'Parâmetro "pedido" obrigatório');
    const d = req.body || {};
    validarItem(d, true);
    const acao = d.acao;
    if (acao && !['concluir', 'reabrir'].includes(acao)) throw new HttpError(422, 'Ação inválida');
    if (acao === 'concluir' && d.conclusao && !DATE_RE.test(d.conclusao))
      throw new HttpError(422, 'Data de conclusão inválida (use YYYY-MM-DD)');

    const n = await emTransacao(async (exec) => {
      await assertStatus(exec, d.status_id);
      await assertTipo(exec, d.tipo);
      const { rows: itens } = await exec('SELECT id FROM pcp_itens WHERE pedido = $1', [pedido]);
      if (!itens.length) throw new HttpError(404, `Pedido ${pedido} não encontrado`);

      await exec(
        `UPDATE pcp_itens SET
           data_cliente  = CASE WHEN $3 THEN NULL ELSE COALESCE($2, data_cliente)  END,
           chegada_pcp   = CASE WHEN $5 THEN NULL ELSE COALESCE($4, chegada_pcp)   END,
           prev_producao = CASE WHEN $7 THEN NULL ELSE COALESCE($6, prev_producao) END,
           tipo          = COALESCE($8, tipo),
           motivo_atraso = COALESCE($9, motivo_atraso),
           observacoes   = COALESCE($10, observacoes),
           especial      = COALESCE($11, especial),
           status_id     = CASE WHEN $12 THEN NULL ELSE COALESCE($13::bigint, status_id) END,
           updated_at    = now()
         WHERE pedido = $1`,
        [
          pedido,
          orNull(d.data_cliente), d.data_cliente === null,
          orNull(d.chegada_pcp), d.chegada_pcp === null,
          orNull(d.prev_producao), d.prev_producao === null,
          orNull(d.tipo),
          d.motivo_atraso !== undefined ? d.motivo_atraso : null,
          d.observacoes !== undefined ? d.observacoes : null,
          typeof d.especial === 'boolean' ? d.especial : null,
          d.status_id === null,
          d.status_id != null && d.status_id !== '' ? Number(d.status_id) : null,
        ]
      );

      if (acao === 'concluir') {
        await exec(
          `UPDATE pcp_pecas SET conclusao = COALESCE($2::date, CURRENT_DATE), concluida_por = $3, updated_at = now()
           WHERE conclusao IS NULL AND item_id IN (SELECT id FROM pcp_itens WHERE pedido = $1)`,
          [pedido, orNull(d.conclusao), req.session.user.id]
        );
      } else if (acao === 'reabrir') {
        await exec(
          `UPDATE pcp_pecas SET conclusao = NULL, concluida_por = NULL, updated_at = now()
           WHERE item_id IN (SELECT id FROM pcp_itens WHERE pedido = $1)`,
          [pedido]
        );
      }
      for (const it of itens) await sincronizarConclusaoItem(exec, it.id);
      return itens.length;
    });

    await audit(req.session.user.id, 'pcp', acao ? `pedido.${acao}` : 'pedido.update', { entityType: 'pcp_pedido' });
    const { rows } = await q(`${SELECT_ITEM} WHERE i.pedido = $1 ORDER BY i.id`, [pedido]);
    res.json({ ok: true, pedido, count: n, itens: rows });
  })
);

// DELETE /api/pcp/pedido?pedido=NNN — exclui o pedido inteiro
r.delete(
  '/pedido',
  requireCsrf,
  requirePerm('pedido', 'editar'),
  ah(async (req, res) => {
    const pedido = String(req.query.pedido || '').trim();
    if (!pedido) throw new HttpError(400, 'Parâmetro "pedido" obrigatório');
    const result = await q('DELETE FROM pcp_itens WHERE pedido = $1', [pedido]);
    if (result.rowCount === 0) throw new HttpError(404, `Pedido ${pedido} não encontrado`);
    // limpa o que não cai em cascata: infos do Comercial e pendências do ciclo
    // (senão o agendador re-tentaria avançar no Comercial um pedido excluído)
    await q('DELETE FROM pcp_pedido_info WHERE pedido = $1', [pedido]);
    await q('DELETE FROM pcp_ciclo_pendencias WHERE pedido = $1', [pedido]);
    await audit(req.session.user.id, 'pcp', 'pedido.delete', { entityType: 'pcp_pedido' });
    res.json({ ok: true, count: result.rowCount });
  })
);

// ─── Bipagem por setor (início / fim) ────────────────────────────────────────
// Cada setor bipa sua parte da peça: 'início' assume o status do setor (após as
// dependências do roteiro estarem 'fim'); o 'fim' do setor cujo status é "final"
// dá baixa na peça.

// Etapas registradas (progresso) de uma peça
async function progressoPeca(pecaId, exec = q) {
  const { rows } = await exec(
    `SELECT s.id AS setor_id, s.nome AS setor_nome, s.cor, st.final AS final,
            to_char(pe.inicio, 'YYYY-MM-DD HH24:MI') AS inicio,
            to_char(pe.fim,    'YYYY-MM-DD HH24:MI') AS fim
     FROM pcp_peca_etapas pe
     JOIN pcp_setores s ON s.id = pe.setor_id
     LEFT JOIN pcp_status st ON st.id = s.status_id
     WHERE pe.peca_id = $1 ORDER BY s.ordem, s.nome`,
    [pecaId]
  );
  return rows.map((r) => ({ ...r, setor_id: Number(r.setor_id) }));
}

r.post(
  '/bip',
  requireCsrf,
  requirePerm('bipagem', 'editar'),
  ah(async (req, res) => {
    const codigo = String(req.body?.codigo || '').trim();
    const setorId = Number(req.body?.setor_id || 0);
    const evento = req.body?.evento === 'fim' ? 'fim' : 'inicio';
    if (!codigo) throw new HttpError(422, 'Código é obrigatório');
    if (!setorId) throw new HttpError(422, 'Selecione o setor');

    const { rows } = await q(
      `SELECT pp.id, pp.item_id, pp.numero, to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao,
              i.produto_id, i.pedido
       FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id WHERE pp.cod_barras = $1`,
      [codigo]
    );
    const peca = rows[0];
    if (!peca) return res.json({ acao: 'desconhecido' });

    const out = await emTransacao(async (exec) => {
      // roteiro do produto (se houver)
      let roteiro = [];
      if (peca.produto_id) {
        const { rows: pr } = await exec('SELECT roteiro FROM pcp_produtos WHERE id = $1', [peca.produto_id]);
        roteiro = pr[0]?.roteiro || [];
      }
      const noRoteiro = roteiro.find((x) => Number(x.setor_id) === setorId);
      if (roteiro.length && !noRoteiro)
        throw new HttpError(422, 'Este setor não faz parte do roteiro deste produto.');

      // dados do setor
      const { rows: ss } = await exec(
        `SELECT s.id, s.nome, s.status_id, st.final
         FROM pcp_setores s LEFT JOIN pcp_status st ON st.id = s.status_id WHERE s.id = $1`,
        [setorId]
      );
      const setor = ss[0];
      if (!setor) throw new HttpError(404, 'Setor não encontrado');

      // etapas já registradas desta peça
      const { rows: regs } = await exec(
        'SELECT setor_id, inicio, fim FROM pcp_peca_etapas WHERE peca_id = $1',
        [peca.id]
      );
      const reg = {};
      regs.forEach((rr) => (reg[Number(rr.setor_id)] = rr));

      if (evento === 'inicio') {
        const dep = (noRoteiro?.depende_de || []).map(Number);
        const pendentes = dep.filter((d) => !reg[d] || !reg[d].fim);
        if (pendentes.length) {
          const { rows: nm } = await exec('SELECT nome FROM pcp_setores WHERE id = ANY($1::bigint[])', [pendentes]);
          throw new HttpError(409, `Aguardando concluir antes: ${nm.map((x) => x.nome).join(', ')}`);
        }
        await exec(
          `INSERT INTO pcp_peca_etapas (peca_id, setor_id, inicio, inicio_por)
           VALUES ($1,$2,now(),$3)
           ON CONFLICT (peca_id, setor_id)
             DO UPDATE SET inicio = COALESCE(pcp_peca_etapas.inicio, now()),
                           inicio_por = COALESCE(pcp_peca_etapas.inicio_por, $3)`,
          [peca.id, setorId, req.session.user.id]
        );
        if (setor.status_id)
          await exec('UPDATE pcp_itens SET status_id = $2, updated_at = now() WHERE id = $1', [peca.item_id, setor.status_id]);
        return { acao: 'inicio', setor_nome: setor.nome };
      }

      // evento === 'fim'
      if (!reg[setorId] || !reg[setorId].inicio)
        throw new HttpError(422, `Bipe o INÍCIO de ${setor.nome} antes do FIM.`);
      if (reg[setorId].fim) return { acao: 'jafoi', setor_nome: setor.nome };

      await exec('UPDATE pcp_peca_etapas SET fim = now(), fim_por = $3 WHERE peca_id = $1 AND setor_id = $2', [
        peca.id, setorId, req.session.user.id,
      ]);
      if (setor.status_id)
        await exec('UPDATE pcp_itens SET status_id = $2, updated_at = now() WHERE id = $1', [peca.item_id, setor.status_id]);

      let acao = 'fim';
      if (setor.final && !peca.conclusao) {
        await exec('UPDATE pcp_pecas SET conclusao = CURRENT_DATE, concluida_por = $2, updated_at = now() WHERE id = $1', [
          peca.id, req.session.user.id,
        ]);
        await sincronizarConclusaoItem(exec, peca.item_id);
        acao = 'baixa';
      }
      return { acao, setor_nome: setor.nome };
    });

    if (out.acao !== 'jafoi')
      await audit(req.session.user.id, 'pcp', 'bip.' + out.acao, { entityType: 'pcp_peca', entityId: Number(peca.id) });

    // Ciclo do pedido (Fase C) — avanço automático do estado federado, sem
    // atrasar a resposta da bipagem: 1º início → EM_PRODUCAO; última baixa
    // do pedido → EMBALADO.
    if (ehPedidoComercial(peca.pedido)) {
      if (out.acao === 'inicio') {
        avancarPedidoSilencioso(peca.pedido, 'EM_PRODUCAO', req.session.user.full_name);
      } else if (out.acao === 'baixa') {
        q(`SELECT BOOL_AND(pp.conclusao IS NOT NULL) AS tudo
           FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
           WHERE i.pedido = $1`, [peca.pedido])
          .then(({ rows: chk }) => {
            if (chk[0]?.tudo) avancarPedidoSilencioso(peca.pedido, 'EMBALADO', req.session.user.full_name);
          })
          .catch((e) => console.warn(`[ciclo] Falha ao checar baixa de ${peca.pedido}: ${e.message}`));
      }
    }
    res.json({
      acao: out.acao,
      setor_nome: out.setor_nome,
      item: await fmtItem(peca.item_id),
      peca_numero: Number(peca.numero),
      etapas: await progressoPeca(peca.id),
    });
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
  requirePerm('fila', 'editar'),
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
      // Medidas da peça (alimentam o cálculo de cortes): largura, altura, extras
      if (d.largura !== undefined || d.altura !== undefined || d.medidas !== undefined) {
        await exec(
          `UPDATE pcp_pecas SET
             largura = COALESCE($2, largura),
             altura  = COALESCE($3, altura),
             medidas = COALESCE($4::jsonb, medidas),
             updated_at = now()
           WHERE id = $1`,
          [
            id,
            d.largura != null && d.largura !== '' ? Number(d.largura) : null,
            d.altura != null && d.altura !== '' ? Number(d.altura) : null,
            d.medidas !== undefined && d.medidas !== null ? JSON.stringify(d.medidas) : null,
          ]
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
              calculo_extra_fonte, roteiro, produto_sku, ativo
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
  for (const f of ['cortes', 'componentes', 'roteiro']) {
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
  requirePerm('estrutura', 'editar'),
  ah(async (req, res) => {
    const d = req.body || {};
    validarProduto(d);
    const chave = d.chave ? slug(d.chave) : slug(d.nome);
    const { rows } = await q(
      `INSERT INTO pcp_produtos (chave, nome, familia, tubo, unidade, cortes, componentes, roteiro, produto_sku)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (chave) DO NOTHING
       RETURNING id`,
      [
        chave, String(d.nome).trim(), String(d.familia).trim().toUpperCase(),
        orNull(d.tubo), d.unidade || 'cm',
        JSON.stringify(d.cortes || []), JSON.stringify(d.componentes || []),
        JSON.stringify(d.roteiro || []),
        // F3/v2.29 — SKU canônico do Núcleo de Produtos (BOM/custo + seleção
        // de estrutura pelo SKU do pedido). Opcional; N estruturas → 1 SKU.
        d.produto_sku ? String(d.produto_sku).trim().slice(0, 64) : null,
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
  requirePerm('estrutura', 'editar'),
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
         roteiro     = COALESCE($9::jsonb, roteiro),
         produto_sku = CASE WHEN $11 THEN NULL ELSE COALESCE($10, produto_sku) END,
         updated_at  = now()
       WHERE id = $1 AND ativo = TRUE`,
      [
        id, orNull(d.nome), d.familia ? String(d.familia).toUpperCase() : null,
        orNull(d.tubo), orNull(d.unidade),
        d.cortes !== undefined ? JSON.stringify(d.cortes) : null,
        d.componentes !== undefined ? JSON.stringify(d.componentes) : null,
        d.tubo === null,
        d.roteiro !== undefined ? JSON.stringify(d.roteiro) : null,
        // F3/v2.29 — SKU canônico do Núcleo ($10 valor, $11 = limpar)
        d.produto_sku ? String(d.produto_sku).trim().slice(0, 64) : null,
        d.produto_sku === null,
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
  requirePerm('estrutura', 'editar'),
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const result = await q('UPDATE pcp_produtos SET ativo = FALSE, updated_at = now() WHERE id = $1 AND ativo = TRUE', [id]);
    if (result.rowCount === 0) throw new HttpError(404, 'Produto não encontrado');
    await audit(req.session.user.id, 'pcp', 'produto.delete', { entityType: 'pcp_produto', entityId: id });
    res.json({ ok: true });
  })
);

// ─── Status de produção (configuráveis pelo admin) ──────────────────────────

const COR_RE = /^#[0-9a-fA-F]{6}$/;

// GET é aberto a qualquer usuário autenticado (alimenta os seletores)
r.get(
  '/status',
  ah(async (req, res) => {
    const { rows } = await q(
      'SELECT id, nome, cor, ordem, final FROM pcp_status WHERE ativo = TRUE ORDER BY ordem, nome'
    );
    res.json({ data: rows });
  })
);

r.post(
  '/status',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const nome = String(req.body?.nome || '').trim();
    const cor = String(req.body?.cor || '#606060').trim();
    const ordem = Number.isFinite(Number(req.body?.ordem)) ? Number(req.body.ordem) : 0;
    if (!nome) throw new HttpError(422, 'Nome do status é obrigatório');
    if (nome.length > 40) throw new HttpError(422, 'Nome muito longo (máx. 40 caracteres)');
    if (!COR_RE.test(cor)) throw new HttpError(422, 'Cor inválida (use #RRGGBB)');
    const { rows } = await q(
      `INSERT INTO pcp_status (nome, cor, ordem) VALUES ($1, $2, $3)
       ON CONFLICT (nome) DO NOTHING RETURNING id`,
      [nome, cor, ordem]
    );
    if (!rows[0]) throw new HttpError(409, 'Já existe um status com esse nome');
    await audit(req.session.user.id, 'pcp', 'status.create', { entityType: 'pcp_status', entityId: Number(rows[0].id) });
    res.status(201).json({ id: Number(rows[0].id) });
  })
);

r.put(
  '/status',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    if (d.cor != null && !COR_RE.test(String(d.cor))) throw new HttpError(422, 'Cor inválida (use #RRGGBB)');
    if (d.nome != null && (!String(d.nome).trim() || String(d.nome).length > 40))
      throw new HttpError(422, 'Nome inválido');
    let result;
    try {
      result = await q(
        `UPDATE pcp_status SET nome = COALESCE($2, nome), cor = COALESCE($3, cor),
                ordem = COALESCE($4, ordem), final = COALESCE($5, final)
         WHERE id = $1`,
        [
          id,
          d.nome != null ? String(d.nome).trim() : null,
          d.cor != null ? String(d.cor) : null,
          d.ordem != null && Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : null,
          typeof d.final === 'boolean' ? d.final : null,
        ]
      );
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'Já existe um status com esse nome');
      throw e;
    }
    if (result.rowCount === 0) throw new HttpError(404, 'Status não encontrado');
    await audit(req.session.user.id, 'pcp', 'status.update', { entityType: 'pcp_status', entityId: id });
    res.json({ ok: true });
  })
);

r.delete(
  '/status',
  requireAdmin,
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const { rows: uso } = await q('SELECT COUNT(*)::int AS c FROM pcp_itens WHERE status_id = $1', [id]);
    const result = await q('DELETE FROM pcp_status WHERE id = $1', [id]); // itens: ON DELETE SET NULL
    if (result.rowCount === 0) throw new HttpError(404, 'Status não encontrado');
    await audit(req.session.user.id, 'pcp', 'status.delete', { entityType: 'pcp_status', entityId: id });
    res.json({ ok: true, itens_afetados: uso[0].c });
  })
);

// ─── Tipos de entrada de pedido (configuráveis pelo admin) ──────────────────
// O item guarda o tipo como TEXTO (pcp_itens.tipo). Renomear um tipo reflete
// nos itens existentes; o tipo "padrão" é o pré-selecionado no novo pedido.

// GET é aberto a qualquer usuário autenticado (alimenta os seletores)
r.get(
  '/tipos',
  ah(async (req, res) => {
    const { rows } = await q(
      'SELECT id, nome, cor, ordem, padrao FROM pcp_tipos WHERE ativo = TRUE ORDER BY ordem, nome'
    );
    res.json({ data: rows });
  })
);

r.post(
  '/tipos',
  requirePerm('tipos', 'editar'),
  requireCsrf,
  ah(async (req, res) => {
    const nome = String(req.body?.nome || '').trim();
    const cor = String(req.body?.cor || '#3949AB').trim();
    const ordem = Number.isFinite(Number(req.body?.ordem)) ? Number(req.body.ordem) : 0;
    const padrao = req.body?.padrao === true;
    if (!nome) throw new HttpError(422, 'Nome do tipo é obrigatório');
    if (nome.length > 40) throw new HttpError(422, 'Nome muito longo (máx. 40 caracteres)');
    if (!COR_RE.test(cor)) throw new HttpError(422, 'Cor inválida (use #RRGGBB)');
    const id = await emTransacao(async (exec) => {
      const { rows } = await exec(
        `INSERT INTO pcp_tipos (nome, cor, ordem, padrao) VALUES ($1, $2, $3, $4)
         ON CONFLICT (nome) DO NOTHING RETURNING id`,
        [nome, cor, ordem, padrao]
      );
      if (!rows[0]) throw new HttpError(409, 'Já existe um tipo com esse nome');
      const novoId = Number(rows[0].id);
      if (padrao) await exec('UPDATE pcp_tipos SET padrao = FALSE WHERE id <> $1', [novoId]);
      return novoId;
    });
    await audit(req.session.user.id, 'pcp', 'tipo.create', { entityType: 'pcp_tipo', entityId: id });
    res.status(201).json({ id });
  })
);

r.put(
  '/tipos',
  requirePerm('tipos', 'editar'),
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const d = req.body || {};
    if (d.cor != null && !COR_RE.test(String(d.cor))) throw new HttpError(422, 'Cor inválida (use #RRGGBB)');
    if (d.nome != null && (!String(d.nome).trim() || String(d.nome).length > 40))
      throw new HttpError(422, 'Nome inválido');
    await emTransacao(async (exec) => {
      const { rows: cur } = await exec('SELECT nome FROM pcp_tipos WHERE id = $1', [id]);
      if (!cur[0]) throw new HttpError(404, 'Tipo não encontrado');
      const novoNome = d.nome != null ? String(d.nome).trim() : null;
      let result;
      try {
        result = await exec(
          `UPDATE pcp_tipos SET nome = COALESCE($2, nome), cor = COALESCE($3, cor),
                  ordem = COALESCE($4, ordem), padrao = COALESCE($5, padrao)
           WHERE id = $1`,
          [
            id,
            novoNome,
            d.cor != null ? String(d.cor) : null,
            d.ordem != null && Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : null,
            typeof d.padrao === 'boolean' ? d.padrao : null,
          ]
        );
      } catch (e) {
        if (e.code === '23505') throw new HttpError(409, 'Já existe um tipo com esse nome');
        throw e;
      }
      if (result.rowCount === 0) throw new HttpError(404, 'Tipo não encontrado');
      // Renomear reflete nos itens já cadastrados (tipo é armazenado como texto).
      if (novoNome && novoNome !== cur[0].nome)
        await exec('UPDATE pcp_itens SET tipo = $2, updated_at = now() WHERE tipo = $1', [cur[0].nome, novoNome]);
      if (d.padrao === true) await exec('UPDATE pcp_tipos SET padrao = FALSE WHERE id <> $1', [id]);
    });
    await audit(req.session.user.id, 'pcp', 'tipo.update', { entityType: 'pcp_tipo', entityId: id });
    res.json({ ok: true });
  })
);

r.delete(
  '/tipos',
  requirePerm('tipos', 'editar'),
  requireCsrf,
  ah(async (req, res) => {
    const id = Number(req.query.id || 0);
    if (!id) throw new HttpError(400, 'ID obrigatório');
    const { rows: cur } = await q('SELECT nome, padrao FROM pcp_tipos WHERE id = $1', [id]);
    if (!cur[0]) throw new HttpError(404, 'Tipo não encontrado');
    if (cur[0].padrao)
      throw new HttpError(422, 'Não é possível excluir o tipo padrão. Defina outro tipo como padrão antes.');
    const { rows: uso } = await q('SELECT COUNT(*)::int AS c FROM pcp_itens WHERE tipo = $1', [cur[0].nome]);
    await q('DELETE FROM pcp_tipos WHERE id = $1', [id]);
    await audit(req.session.user.id, 'pcp', 'tipo.delete', { entityType: 'pcp_tipo', entityId: id });
    res.json({ ok: true, itens_afetados: uso[0].c });
  })
);

export default r;
