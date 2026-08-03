/**
 * Rotas da ordem de produção de corte.
 *   GET  /preview       ?pedidos=a,b&setor_id=N    calcula (sem registrar)
 *   GET  /status        ?pedidos=a,b               se já foi impresso + histórico
 *   POST /imprimir      { pedidos:[], setor_id?, modo }  calcula e registra log
 *   GET  /log           ?pedido=x                  histórico recente
 *   GET  /plano-nucleo  ?pedido=x                  PLANO DE CORTE via Núcleo (:3070)
 *   POST /plano-nucleo  { pedido, overrides }      idem, com variante por peça
 */
import { Router } from 'express';
import { requireAuth, requireCsrf } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';
import { calcularOrdem, registrarImpressao, statusImpressao } from '../ordem-corte.js';
import { calcularPlanoNucleo } from '../ordem-corte-nucleo.js';
import { planoCorteHabilitado } from '../produtos-client.js';

const r = Router();
r.use(requireAuth);

const parsePedidos = (req) => String(req.query.pedidos || req.query.pedido || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

r.get('/preview', ah(async (req, res) => {
  const pedidos = parsePedidos(req);
  if (!pedidos.length) throw new HttpError(422, 'Informe ?pedidos=');
  const setorId = req.query.setor_id ? Number(req.query.setor_id) : null;
  res.json(await calcularOrdem(pedidos, { setorId }));
}));

r.get('/status', ah(async (req, res) => {
  res.json({ data: await statusImpressao(parsePedidos(req)) });
}));

r.post('/imprimir', requireCsrf, ah(async (req, res) => {
  const pedidos = Array.isArray(req.body?.pedidos) ? req.body.pedidos
    : String(req.body?.pedidos || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pedidos.length) throw new HttpError(422, 'Envie { pedidos: [...] }');
  const setorId = req.body?.setor_id ? Number(req.body.setor_id) : null;
  const modo = pedidos.length > 1 ? 'lote' : (req.body?.modo === 'lote' ? 'lote' : 'individual');
  const ordem = await calcularOrdem(pedidos, { setorId });
  const { reimpressao } = await registrarImpressao(pedidos, {
    setorId, modo, userId: req.session.user.id, userNome: req.session.user.full_name,
  });
  res.json({ ...ordem, reimpressao, modo });
}));

// ── Planejamento de Corte via Núcleo de Produtos (:3070) ────────────────────
// Documento do MOTOR (plano-corte-nucleo.html) — não toca a OC local.
const exigirNucleo = () => {
  if (!planoCorteHabilitado())
    throw new HttpError(503, 'Integração com o Núcleo de Produtos não configurada (PRODUTOS_SERVICE_KEY)');
};

r.get('/plano-nucleo', ah(async (req, res) => {
  const pedido = String(req.query.pedido || '').trim();
  if (!pedido) throw new HttpError(422, 'Informe ?pedido=');
  exigirNucleo();
  res.json(await calcularPlanoNucleo(pedido));
}));

// POST = o operador troca a VARIANTE de peça(s) antes de imprimir
r.post('/plano-nucleo', requireCsrf, ah(async (req, res) => {
  const pedido = String(req.body?.pedido || '').trim();
  if (!pedido) throw new HttpError(422, 'Envie { pedido }');
  exigirNucleo();
  const overrides = (req.body?.overrides && typeof req.body.overrides === 'object'
    && !Array.isArray(req.body.overrides)) ? req.body.overrides : {};
  res.json(await calcularPlanoNucleo(pedido, overrides));
}));

r.get('/log', ah(async (req, res) => {
  const pedido = String(req.query.pedido || '').trim();
  const { rows } = await q(
    `SELECT id, pedido, setor_id, modo, tipo, pedidos, por_nome,
            to_char(created_at, 'YYYY-MM-DD HH24:MI') AS quando
     FROM pcp_ordem_corte_log l
     ${pedido ? "WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(l.pedidos) e WHERE e = $1)" : ''}
     ORDER BY created_at DESC LIMIT 100`,
    pedido ? [pedido] : []
  );
  res.json({ data: rows });
}));

export default r;
