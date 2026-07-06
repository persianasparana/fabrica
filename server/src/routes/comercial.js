/**
 * Integração com o COMERCIAL (Agenda :3010) — ciclo do pedido, Fase B (PCP).
 * Ver agenda-consultores/docs/CICLO-DO-PEDIDO.md.
 *
 * O PCP avalia os pedidos APROVADOS NO FINANCEIRO (status EM_ANALISE_PCP):
 *   - DEVOLVER  → volta ao vendedor com o motivo (o que corrigir na spec);
 *                 os valores permanecem travados no Comercial.
 *   - LIBERAR   → pedido vira LIBERADO_PRODUCAO e os itens são IMPORTADOS
 *                 automaticamente para a fila de produção do PCP (idempotente:
 *                 se a fila já tem itens do PED-…, não duplica).
 * Depois, a produção avança o estado federado (EM_PRODUCAO → EMBALADO →
 * NA_EXPEDICAO) por aqui também. A fonte da verdade do pedido é o Comercial;
 * a fila interna do PCP (pcp_itens/pecas/bipagem) segue soberana na fábrica.
 *
 * Auth serviço-a-serviço por X-Service-Key (ADR-0008): COMERCIAL_SERVICE_KEY
 * deve ser IDÊNTICA ao SERVICE_API_KEY do .env do Comercial.
 */
import { Router } from 'express';
import { requireAuth, requireCsrf, requirePerm, audit } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';
import { inserirItem, emTransacao } from './pcp.js';

const r = Router();
r.use(requireAuth);

const base = () => (process.env.COMERCIAL_API_BASE || 'http://127.0.0.1:3010').replace(/\/+$/, '');
const chave = () => process.env.COMERCIAL_SERVICE_KEY || '';
const configurado = () => Boolean(base() && chave());

async function chamar(metodo, caminho, body) {
  if (!configurado()) {
    throw new HttpError(503, 'Integração com o Comercial não configurada (COMERCIAL_API_BASE/COMERCIAL_SERVICE_KEY)');
  }
  let resp;
  try {
    resp = await fetch(`${base()}${caminho}`, {
      method: metodo,
      headers: {
        'X-Service-Key': chave(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new HttpError(502, `Comercial inacessível: ${err.message}`);
  }
  const texto = await resp.text();
  let payload;
  try { payload = texto ? JSON.parse(texto) : {}; } catch { payload = { raw: texto }; }
  if (!resp.ok) throw new HttpError(resp.status, payload.message || `Comercial respondeu HTTP ${resp.status}`);
  return payload;
}

// ===== GET /pedidos?status= — fila (default: aguardando avaliação do PCP) =====
r.get(
  '/pedidos',
  requirePerm('comercial', 'ver'),
  ah(async (req, res) => {
    const status = String(req.query.status || 'EM_ANALISE_PCP');
    const data = await chamar('GET', `/pedidos?status=${encodeURIComponent(status)}`);
    res.json({ data: Array.isArray(data) ? data : (data.data ?? []) });
  })
);

// ===== GET /pedidos/:id — detalhe (itens + spec + cliente) =====
r.get(
  '/pedidos/:id',
  requirePerm('comercial', 'ver'),
  ah(async (req, res) => {
    res.json(await chamar('GET', `/pedidos/${encodeURIComponent(req.params.id)}`));
  })
);

// ===== POST /pedidos/:id/devolver — { motivo } → vendedor corrige a spec =====
r.post(
  '/pedidos/:id/devolver',
  requireCsrf,
  requirePerm('comercial', 'editar'),
  ah(async (req, res) => {
    const motivo = String(req.body?.motivo || '').trim();
    if (!motivo) throw new HttpError(422, 'Informe o que precisa ser corrigido (motivo da devolução)');
    const pedido = await chamar('PATCH', `/pedidos/${encodeURIComponent(req.params.id)}/status`, {
      status: 'DEVOLVIDO_PCP',
      motivo,
      analisadoPor: req.session.user.full_name || req.session.user.username,
    });
    await audit(req.session.user.id, 'comercial', 'pedido.devolver', {
      entityType: 'pedido',
      entityId: req.params.id,
    });
    res.json(pedido);
  })
);

// ===== POST /pedidos/:id/liberar — libera produção + importa itens pra fila =====
r.post(
  '/pedidos/:id/liberar',
  requireCsrf,
  requirePerm('comercial', 'editar'),
  ah(async (req, res) => {
    const id = req.params.id;
    const detalhe = await chamar('GET', `/pedidos/${encodeURIComponent(id)}`);
    const codigo = detalhe.pedidoCodigo;
    if (!codigo) throw new HttpError(422, 'Documento não é um pedido');

    // 1) Estado federado no Comercial (idempotente se já liberado)
    const pedido = await chamar('PATCH', `/pedidos/${encodeURIComponent(id)}/status`, {
      status: 'LIBERADO_PRODUCAO',
      analisadoPor: req.session.user.full_name || req.session.user.username,
    });

    // 2) Importa os itens pra fila do PCP — idempotente por PED-…
    const { rows } = await q('SELECT COUNT(*)::int AS n FROM pcp_itens WHERE pedido = $1', [codigo]);
    let importados = 0;
    if (rows[0].n === 0) {
      // data_cliente = prazo prometido (aprovação financeira + prazo em dias)
      let dataCliente = null;
      if (detalhe.aprovadoFinanceiroEm && detalhe.prazoEntregaDias != null) {
        const d = new Date(detalhe.aprovadoFinanceiroEm);
        d.setDate(d.getDate() + Number(detalhe.prazoEntregaDias));
        dataCliente = d.toISOString().slice(0, 10);
      }
      const itens = (detalhe.itens || []).filter((it) => Number(it.quantidade) > 0);
      const especs = (it) =>
        [
          it.colecao, it.corTecido,
          Number(it.larguraCm) > 0 ? `${(Number(it.larguraCm) / 100).toFixed(2)}×${(Number(it.alturaCm) / 100).toFixed(2)}m` : null,
          it.ambiente, it.observacoesTecnicas,
        ].filter(Boolean).join(' · ');
      await emTransacao(async (exec, client) => {
        for (const it of itens) {
          await inserirItem(client, {
            produto: String(it.tipo || 'Peça').slice(0, 160),
            pedido: codigo,
            qnt: Math.min(Number(it.quantidade) || 1, 500),
            data_cliente: dataCliente,
            tipo: 'Produção nova',
            observacoes: especs(it).slice(0, 5000),
          }, req.session.user.id);
          importados += 1;
        }
      });
    }

    await audit(req.session.user.id, 'comercial', 'pedido.liberar', {
      entityType: 'pedido',
      entityId: id,
    });
    res.json({ pedido, importados, jaNaFila: rows[0].n > 0 });
  })
);

// ===== POST /pedidos/:id/status — produção avança o estado federado =====
// Permitidos aqui: EM_PRODUCAO, EMBALADO, NA_EXPEDICAO (o resto é de outros setores).
const STATUS_FABRICA = ['EM_PRODUCAO', 'EMBALADO', 'NA_EXPEDICAO'];
r.post(
  '/pedidos/:id/status',
  requireCsrf,
  requirePerm('comercial', 'editar'),
  ah(async (req, res) => {
    const status = String(req.body?.status || '');
    if (!STATUS_FABRICA.includes(status)) {
      throw new HttpError(422, `Status inválido para a fábrica (permitidos: ${STATUS_FABRICA.join(', ')})`);
    }
    const pedido = await chamar('PATCH', `/pedidos/${encodeURIComponent(req.params.id)}/status`, {
      status,
      analisadoPor: req.session.user.full_name || req.session.user.username,
    });
    await audit(req.session.user.id, 'comercial', 'pedido.status', {
      entityType: 'pedido',
      entityId: req.params.id,
    });
    res.json(pedido);
  })
);

export default r;
