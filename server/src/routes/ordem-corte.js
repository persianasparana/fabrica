/**
 * Rotas da ordem de produção de corte.
 *
 * ⚠ 09/08/2026 — OC LOCAL APOSENTADA (decisão do cliente): o documento de
 * corte é SÓ o plano do Núcleo de Produtos (padrão de cortes editado no
 * módulo Produtos, aba Corte PCP). A aba do PCP abre plano-corte-nucleo.html
 * e o registro de impressão passa por POST /registrar (mesmo log/reimpressão
 * de antes). /preview segue vivo porque a FICHA DE PRODUÇÃO usa os cortes
 * por setor; /imprimir fica só para rollback (sem ponto de entrada na UI).
 *
 *   GET  /preview       ?pedidos=a,b&setor_id=N    calcula (ficha de produção)
 *   GET  /status        ?pedidos=a,b               se já foi impresso + histórico
 *   POST /imprimir      { pedidos:[], setor_id?, modo }  [LEGADO — sem UI]
 *   POST /registrar     { pedidos:[] }             registra impressão do plano do Núcleo
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

// v09/08 — registro de impressão do PLANO DO NÚCLEO (documento único de
// corte). Mesmo log/controle de reimpressão da OC de antes (modo 'nucleo').
r.post('/registrar', requireCsrf, ah(async (req, res) => {
  const pedidos = Array.isArray(req.body?.pedidos) ? req.body.pedidos
    : String(req.body?.pedidos || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pedidos.length) throw new HttpError(422, 'Envie { pedidos: [...] }');
  const { reimpressao } = await registrarImpressao(pedidos, {
    modo: 'nucleo', userId: req.session.user.id, userNome: req.session.user.full_name,
  });
  res.json({ ok: true, reimpressao });
}));

// ── Planejamento de Corte via Núcleo de Produtos (:3070) ────────────────────
// Documento do MOTOR (plano-corte-nucleo.html) — desde 09/08 é O documento
// de corte (OC local aposentada).
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
