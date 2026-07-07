/**
 * API de integração servidor-a-servidor — consumida pelo backend da
 * Logística/Instalações (persianas-api) no mesmo servidor.
 *
 * Autenticação por API key (header X-API-Key), independente da sessão de
 * navegador: a chave vive em INTEGRACAO_API_KEY no .env dos dois sistemas.
 * Sem a variável definida, as rotas respondem 503 (integração desativada).
 * Somente leitura — escrita na fila do PCP continua exclusiva da sessão.
 *
 *   GET /api/integracao/pedidos          pedidos agrupados, com progresso das peças
 *       ?concluidos=1                    só pedidos com TODAS as peças concluídas
 *       ?desde=YYYY-MM-DD                conclusão a partir desta data
 *       ?pedido=NNN                      um pedido específico
 */
import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';

const r = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function chaveValida(recebida) {
  const esperada = process.env.INTEGRACAO_API_KEY || '';
  if (!esperada || !recebida) return false;
  const a = Buffer.from(String(recebida));
  const b = Buffer.from(esperada);
  return a.length === b.length && timingSafeEqual(a, b);
}

r.use((req, res, next) => {
  if (!process.env.INTEGRACAO_API_KEY) {
    return res.status(503).json({ error: 'Integração desativada (INTEGRACAO_API_KEY não configurada)' });
  }
  if (!chaveValida(req.get('X-API-Key'))) {
    return res.status(401).json({ error: 'API key inválida ou ausente' });
  }
  next();
});

r.get(
  '/pedidos',
  ah(async (req, res) => {
    const { concluidos, desde, pedido } = req.query;
    if (desde && !DATE_RE.test(String(desde)))
      throw new HttpError(422, 'Data inválida em desde (use YYYY-MM-DD)');

    // item sem número de pedido não interessa à logística
    const where = [`TRIM(i.pedido) <> ''`];
    const having = [];
    const params = [];
    if (pedido) {
      params.push(String(pedido).trim());
      where.push(`i.pedido = $${params.length}`);
    }
    if (concluidos === '1') having.push('BOOL_AND(i.conclusao IS NOT NULL)');
    if (desde) {
      params.push(String(desde));
      having.push(`MAX(i.conclusao) >= $${params.length}::date`);
    }

    const { rows } = await q(
      `SELECT i.pedido,
              BOOL_AND(i.conclusao IS NOT NULL) AS concluido,
              CASE WHEN BOOL_AND(i.conclusao IS NOT NULL)
                   THEN to_char(MAX(i.conclusao), 'YYYY-MM-DD') END AS conclusao,
              to_char(MIN(i.data_cliente), 'YYYY-MM-DD') AS data_cliente,
              SUM(i.qnt)::int AS total_pecas,
              COALESCE(SUM(pc.concluidas), 0)::int AS pecas_concluidas,
              json_agg(json_build_object(
                'produto', i.produto, 'qnt', i.qnt, 'tipo', i.tipo,
                'conclusao', to_char(i.conclusao, 'YYYY-MM-DD')
              ) ORDER BY i.id) AS itens
       FROM pcp_itens i
       LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE pp.conclusao IS NOT NULL)::int AS concluidas
         FROM pcp_pecas pp WHERE pp.item_id = i.id
       ) pc ON TRUE
       WHERE ${where.join(' AND ')}
       GROUP BY i.pedido
       ${having.length ? 'HAVING ' + having.join(' AND ') : ''}
       ORDER BY MAX(i.conclusao) DESC NULLS LAST, i.pedido`,
      params
    );
    res.json({ data: rows });
  })
);

// Consulta UMA peça pela etiqueta (cod_barras) — usada pela Expedição da
// Logística ao escanear: valida se a peça existe e já foi expedida pela
// fábrica (conclusao != null) e devolve o contexto do pedido.
r.get(
  '/peca',
  ah(async (req, res) => {
    const codigo = String(req.query.codigo || '').trim();
    if (!codigo) throw new HttpError(422, 'Parâmetro "codigo" obrigatório');
    const { rows } = await q(
      `SELECT pp.cod_barras, pp.numero,
              to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao,
              (SELECT g.nome FROM pcp_gavetas g WHERE g.id = pp.gaveta_id) AS gaveta,
              to_char(pp.guardada_em, 'YYYY-MM-DD HH24:MI') AS guardada_em,
              i.pedido, i.produto,
              (SELECT SUM(i2.qnt)::int FROM pcp_itens i2 WHERE i2.pedido = i.pedido) AS total_pecas_pedido,
              (SELECT COUNT(*) FILTER (WHERE p2.conclusao IS NOT NULL)::int
                 FROM pcp_pecas p2 JOIN pcp_itens i2 ON i2.id = p2.item_id
                WHERE i2.pedido = i.pedido) AS pecas_concluidas_pedido
       FROM pcp_pecas pp
       JOIN pcp_itens i ON i.id = pp.item_id
       WHERE pp.cod_barras = $1`,
      [codigo]
    );
    if (!rows[0]) throw new HttpError(404, 'Etiqueta não encontrada na fábrica');
    res.json(rows[0]);
  })
);

// Fase C do ciclo — localização das peças de um pedido nas gavetas da
// expedição. A logística usa isto ao agendar a instalação ("indicando onde
// cada peça de cada pedido se encontra").
r.get(
  '/expedicao',
  ah(async (req, res) => {
    const pedido = String(req.query.pedido || '').trim();
    if (!pedido) throw new HttpError(422, 'Parâmetro "pedido" obrigatório');
    const { rows } = await q(
      `SELECT pp.cod_barras AS codigo, pp.numero,
              to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao,
              g.nome AS gaveta,
              to_char(pp.guardada_em, 'YYYY-MM-DD HH24:MI') AS guardada_em,
              i.pedido, i.produto, i.cliente, i.ambiente
       FROM pcp_pecas pp
       JOIN pcp_itens i ON i.id = pp.item_id
       LEFT JOIN pcp_gavetas g ON g.id = pp.gaveta_id
       WHERE i.pedido = $1
       ORDER BY pp.item_id, pp.numero`,
      [pedido]
    );
    if (!rows.length) throw new HttpError(404, `Pedido ${pedido} não encontrado na fábrica`);
    const guardadas = rows.filter((x) => x.gaveta).length;
    res.json({
      pedido,
      total_pecas: rows.length,
      embaladas: rows.filter((x) => x.conclusao).length,
      guardadas,
      completo_na_expedicao: guardadas === rows.length,
      pecas: rows,
    });
  })
);

export default r;
