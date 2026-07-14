/**
 * Expedição — gavetas (Fase C do ciclo do pedido).
 *
 * A peça EMBALADA (com baixa) é guardada numa gaveta bipando a etiqueta;
 * a logística consulta onde cada peça está e a retira na instalação.
 * Quando TODAS as peças de um PED-… estão guardadas, o pedido federado
 * avança sozinho para NA_EXPEDICAO no Comercial.
 *
 *   GET    /gavetas               lista com ocupação
 *   POST   /gavetas               cria                       (CSRF, editar)
 *   PUT    /gavetas?id=N          atualiza                   (CSRF, editar)
 *   DELETE /gavetas?id=N          desativa (se vazia)        (CSRF, editar)
 *   POST   /guardar  { codigo, gaveta_id }   entrada/transferência (CSRF)
 *   POST   /retirar  { codigo }              saída p/ instalação   (CSRF)
 *   GET    /mapa                  gavetas com as peças dentro
 *   GET    /pedido?pedido=X       onde está cada peça do pedido
 *   GET    /log?pedido=X          movimentações recentes
 */
import { Router } from 'express';
import { requireAuth, requireCsrf, requirePerm, audit } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';
import { avancarPedidoPorCodigo, ehPedidoComercial, registrarPendenciaCiclo } from '../comercial-client.js';

const r = Router();
r.use(requireAuth);

const SELECT_PECA = `
  SELECT pp.id, pp.numero, pp.cod_barras, pp.gaveta_id,
         to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao,
         to_char(pp.guardada_em, 'YYYY-MM-DD HH24:MI') AS guardada_em,
         g.nome AS gaveta_nome,
         i.id AS item_id, i.pedido, i.produto, i.cliente,
         to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente
  FROM pcp_pecas pp
  JOIN pcp_itens i ON i.id = pp.item_id
  LEFT JOIN pcp_gavetas g ON g.id = pp.gaveta_id`;

/** Progresso da expedição de um pedido (peças, baixadas, guardadas). */
async function progressoPedido(pedido) {
  const { rows } = await q(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE pp.conclusao IS NOT NULL)::int AS embaladas,
            COUNT(*) FILTER (WHERE pp.gaveta_id IS NOT NULL)::int AS guardadas
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     WHERE i.pedido = $1`,
    [pedido]
  );
  return rows[0];
}

// ─── Gavetas (cadastro) ──────────────────────────────────────────────────────

r.get('/gavetas', ah(async (req, res) => {
  const { rows } = await q(
    `SELECT g.id, g.nome, g.descricao, g.ordem, g.ativo,
            COUNT(pp.id)::int AS pecas
     FROM pcp_gavetas g
     LEFT JOIN pcp_pecas pp ON pp.gaveta_id = g.id
     WHERE g.ativo = TRUE
     GROUP BY g.id ORDER BY g.ordem, g.nome`
  );
  res.json({ data: rows });
}));

function validarGaveta(d, partial = false) {
  if (!partial && (!d.nome || !String(d.nome).trim())) throw new HttpError(422, 'Nome da gaveta é obrigatório');
  if (d.nome != null && String(d.nome).trim().length > 60) throw new HttpError(422, 'Nome muito longo (máx. 60)');
  if (d.descricao != null && String(d.descricao).length > 160) throw new HttpError(422, 'Descrição muito longa (máx. 160)');
  if (d.ordem != null && !Number.isFinite(Number(d.ordem))) throw new HttpError(422, 'Ordem inválida');
}

r.post('/gavetas', requirePerm('expedicao', 'editar'), requireCsrf, ah(async (req, res) => {
  const d = req.body || {};
  validarGaveta(d);
  const { rows } = await q(
    `INSERT INTO pcp_gavetas (nome, descricao, ordem) VALUES ($1,$2,$3)
     ON CONFLICT (nome) DO NOTHING RETURNING id`,
    [String(d.nome).trim(), String(d.descricao || '').trim(), Number(d.ordem) || 0]
  );
  if (!rows[0]) throw new HttpError(409, 'Já existe uma gaveta com esse nome');
  const id = Number(rows[0].id);
  await audit(req.session.user.id, 'pcp', 'gaveta.create', { entityType: 'pcp_gaveta', entityId: id });
  res.status(201).json({ id });
}));

r.put('/gavetas', requirePerm('expedicao', 'editar'), requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const d = req.body || {};
  validarGaveta(d, true);
  let result;
  try {
    result = await q(
      `UPDATE pcp_gavetas SET nome = COALESCE($2, nome), descricao = COALESCE($3, descricao),
              ordem = COALESCE($4, ordem)
       WHERE id = $1 AND ativo = TRUE`,
      [
        id,
        d.nome != null ? String(d.nome).trim() : null,
        d.descricao != null ? String(d.descricao).trim() : null,
        d.ordem != null ? Number(d.ordem) : null,
      ]
    );
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe uma gaveta com esse nome');
    throw e;
  }
  if (result.rowCount === 0) throw new HttpError(404, 'Gaveta não encontrada');
  await audit(req.session.user.id, 'pcp', 'gaveta.update', { entityType: 'pcp_gaveta', entityId: id });
  res.json({ ok: true });
}));

r.delete('/gavetas', requirePerm('expedicao', 'editar'), requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const { rows: uso } = await q('SELECT COUNT(*)::int AS c FROM pcp_pecas WHERE gaveta_id = $1', [id]);
  if (uso[0].c > 0)
    throw new HttpError(422, `A gaveta ainda tem ${uso[0].c} peça(s) dentro — retire antes de excluir.`);
  const result = await q('UPDATE pcp_gavetas SET ativo = FALSE WHERE id = $1 AND ativo = TRUE', [id]);
  if (result.rowCount === 0) throw new HttpError(404, 'Gaveta não encontrada');
  await audit(req.session.user.id, 'pcp', 'gaveta.delete', { entityType: 'pcp_gaveta', entityId: id });
  res.json({ ok: true });
}));

// ─── Guardar / retirar (bipagem da expedição) ────────────────────────────────

r.post('/guardar', requirePerm('expedicao', 'editar'), requireCsrf, ah(async (req, res) => {
  const codigo = String(req.body?.codigo || '').trim();
  const gavetaId = Number(req.body?.gaveta_id || 0);
  if (!codigo) throw new HttpError(422, 'Bipe/informe o código da peça');
  if (!gavetaId) throw new HttpError(422, 'Selecione a gaveta');

  const { rows: gs } = await q('SELECT id, nome FROM pcp_gavetas WHERE id = $1 AND ativo = TRUE', [gavetaId]);
  const gaveta = gs[0];
  if (!gaveta) throw new HttpError(404, 'Gaveta não encontrada ou inativa');

  const { rows } = await q(`${SELECT_PECA} WHERE pp.cod_barras = $1`, [codigo]);
  const peca = rows[0];
  if (!peca) throw new HttpError(404, `Código ${codigo} não encontrado na fila.`);
  if (!peca.conclusao)
    throw new HttpError(422,
      `A peça ${codigo} (${peca.produto}, pedido ${peca.pedido}) ainda NÃO tem baixa de produção — embale/bipe a baixa antes de guardar.`);

  const transferencia = peca.gaveta_id != null && Number(peca.gaveta_id) !== gavetaId;
  const jaEstava = peca.gaveta_id != null && Number(peca.gaveta_id) === gavetaId;
  if (!jaEstava) {
    await q(
      `UPDATE pcp_pecas SET gaveta_id = $2, guardada_em = now(), guardada_por = $3, updated_at = now()
       WHERE id = $1`,
      [peca.id, gavetaId, req.session.user.id]
    );
    await q(
      `INSERT INTO pcp_expedicao_log (peca_id, codigo, pedido, gaveta_id, gaveta_nome, acao, por, por_nome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [peca.id, codigo, peca.pedido, gavetaId, gaveta.nome,
       transferencia ? 'transferencia' : 'entrada',
       req.session.user.id, req.session.user.full_name]
    );
    await audit(req.session.user.id, 'pcp', 'expedicao.guardar', { entityType: 'pcp_peca', entityId: Number(peca.id) });
  }

  // Todas as peças do PED-… guardadas → NA_EXPEDICAO no Comercial (não fatal)
  const progresso = await progressoPedido(peca.pedido);
  let ciclo = null;
  if (ehPedidoComercial(peca.pedido) && progresso.guardadas === progresso.total) {
    try { ciclo = await avancarPedidoPorCodigo(peca.pedido, 'NA_EXPEDICAO', req.session.user.full_name); }
    catch (e) {
      ciclo = { ok: false, motivo: e.message, reenvio_agendado: true };
      // Comercial fora do ar não pode perder o avanço: vira pendência re-tentável
      await registrarPendenciaCiclo(peca.pedido, 'NA_EXPEDICAO', req.session.user.full_name, e.message).catch(() => {});
    }
  }

  res.json({
    acao: jaEstava ? 'ja_estava' : (transferencia ? 'transferencia' : 'guardada'),
    peca: { id: Number(peca.id), numero: Number(peca.numero), codigo,
            produto: peca.produto, pedido: peca.pedido, cliente: peca.cliente,
            gaveta_anterior: transferencia ? peca.gaveta_nome : null },
    gaveta: { id: gavetaId, nome: gaveta.nome },
    progresso,
    ciclo,
  });
}));

r.post('/retirar', requirePerm('expedicao', 'editar'), requireCsrf, ah(async (req, res) => {
  const codigo = String(req.body?.codigo || '').trim();
  if (!codigo) throw new HttpError(422, 'Bipe/informe o código da peça');
  const { rows } = await q(`${SELECT_PECA} WHERE pp.cod_barras = $1`, [codigo]);
  const peca = rows[0];
  if (!peca) throw new HttpError(404, `Código ${codigo} não encontrado na fila.`);
  if (!peca.gaveta_id)
    throw new HttpError(422, `A peça ${codigo} não está em nenhuma gaveta.`);

  await q(
    `UPDATE pcp_pecas SET gaveta_id = NULL, guardada_em = NULL, guardada_por = NULL, updated_at = now()
     WHERE id = $1`,
    [peca.id]
  );
  await q(
    `INSERT INTO pcp_expedicao_log (peca_id, codigo, pedido, gaveta_id, gaveta_nome, acao, por, por_nome)
     VALUES ($1,$2,$3,$4,$5,'saida',$6,$7)`,
    [peca.id, codigo, peca.pedido, peca.gaveta_id, peca.gaveta_nome,
     req.session.user.id, req.session.user.full_name]
  );
  await audit(req.session.user.id, 'pcp', 'expedicao.retirar', { entityType: 'pcp_peca', entityId: Number(peca.id) });

  res.json({
    acao: 'retirada',
    peca: { id: Number(peca.id), numero: Number(peca.numero), codigo,
            produto: peca.produto, pedido: peca.pedido, cliente: peca.cliente },
    gaveta: { id: Number(peca.gaveta_id), nome: peca.gaveta_nome },
    progresso: await progressoPedido(peca.pedido),
  });
}));

// ─── Consultas ───────────────────────────────────────────────────────────────

r.get('/mapa', ah(async (req, res) => {
  const { rows: gavetas } = await q(
    `SELECT g.id, g.nome, g.descricao, g.ordem,
            COALESCE(pc.pecas, '[]'::json) AS pecas
     FROM pcp_gavetas g
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
                'id', pp.id, 'numero', pp.numero, 'codigo', pp.cod_barras,
                'pedido', i.pedido, 'produto', i.produto, 'cliente', i.cliente,
                'guardada_em', to_char(pp.guardada_em, 'YYYY-MM-DD HH24:MI')
              ) ORDER BY i.pedido, pp.numero) AS pecas
       FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
       WHERE pp.gaveta_id = g.id
     ) pc ON TRUE
     WHERE g.ativo = TRUE
     ORDER BY g.ordem, g.nome`
  );
  res.json({ data: gavetas });
}));

r.get('/pedido', ah(async (req, res) => {
  const pedido = String(req.query.pedido || '').trim();
  if (!pedido) throw new HttpError(400, 'Parâmetro "pedido" obrigatório');
  const { rows } = await q(`${SELECT_PECA} WHERE i.pedido = $1 ORDER BY pp.item_id, pp.numero`, [pedido]);
  if (!rows.length) throw new HttpError(404, `Pedido ${pedido} não encontrado`);
  res.json({ pedido, progresso: await progressoPedido(pedido), pecas: rows });
}));

r.get('/log', ah(async (req, res) => {
  const pedido = String(req.query.pedido || '').trim();
  const { rows } = await q(
    `SELECT id, codigo, pedido, gaveta_nome, acao, por_nome,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS quando
     FROM pcp_expedicao_log
     ${pedido ? 'WHERE pedido = $1' : ''}
     ORDER BY created_at DESC LIMIT 100`,
    pedido ? [pedido] : []
  );
  res.json({ data: rows });
}));

export default r;
