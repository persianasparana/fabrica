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
import { regrasAtivas, selecionarEstrutura, contextoDeSpec, categoriasPorColecao } from '../estrutura-regras.js';
// Cliente HTTP compartilhado (também usado pelos avanços automáticos do ciclo)
import { chamar, baixarBinario } from '../comercial-client.js';

const r = Router();
r.use(requireAuth);

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

// ─── Desenhos de fabricação/instalação anexados ao pedido (Comercial) ────────
// O arquivo mora na Agenda; o PCP faz PROXY porque a CSP do frontend só
// permite imgSrc 'self' (o navegador nunca fala direto com o :3010).

// ===== GET /pedidos/:id/desenhos — lista { data: [{ id, tipo, ... }] } =====
r.get(
  '/pedidos/:id/desenhos',
  requirePerm('comercial', 'ver'),
  ah(async (req, res) => {
    const data = await chamar('GET', `/pedidos/${encodeURIComponent(req.params.id)}/desenhos`);
    res.json({ data: Array.isArray(data) ? data : (data.data ?? []) });
  })
);

// ===== GET /pedidos/:id/desenhos/:desenhoId/arquivo — binário (streaming) =====
r.get(
  '/pedidos/:id/desenhos/:desenhoId/arquivo',
  requirePerm('comercial', 'ver'),
  ah(async (req, res) => {
    const { status, headers, stream } = await baixarBinario(
      `/pedidos/${encodeURIComponent(req.params.id)}/desenhos/${encodeURIComponent(req.params.desenhoId)}/arquivo`
    );
    if (status === 401 || status === 403) {
      throw new HttpError(502,
        'O Comercial recusou a chave de serviço (X-Service-Key). Confira se COMERCIAL_SERVICE_KEY no .env da fábrica é IDÊNTICA ao SERVICE_API_KEY do .env do Comercial e reinicie o fabrica-server.');
    }
    if (status === 404) throw new HttpError(404, 'Desenho não encontrado no Comercial');
    if (status >= 400) throw new HttpError(502, `Comercial respondeu HTTP ${status} ao buscar o desenho`);
    res.status(200);
    res.set('Content-Type', headers.get('content-type') || 'application/octet-stream');
    res.set('Content-Disposition', headers.get('content-disposition') || 'inline');
    const len = headers.get('content-length');
    if (len) res.set('Content-Length', len);
    res.set('Cache-Control', 'private, max-age=300');
    if (!stream) return res.end();
    stream.on('error', () => res.destroy());
    stream.pipe(res);
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

// ─── Estrutura do Produto na chegada do pedido ───────────────────────────────
// Cadeia de seleção: 1) regras condicionais (F3); 2) fallback conservador por
// NOME EXATO normalizado (tipo do item == nome/chave da estrutura); 3) pendente
// (o avaliador escolhe manualmente na tela antes de liberar).
const normNome = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function produtosAtivos() {
  const { rows } = await q(`SELECT id, chave, nome, familia, produto_sku FROM pcp_produtos WHERE ativo = TRUE ORDER BY nome`);
  return rows;
}

function fallbackPorNome(tipo, produtos) {
  const alvo = normNome(tipo);
  if (!alvo) return null;
  const hit = produtos.find((p) => normNome(p.nome) === alvo || normNome(p.chave) === alvo);
  return hit ? Number(hit.id) : null;
}

// F2/v2.29 — o item do pedido pode chegar com o SKU CANÔNICO do Núcleo de
// Produtos (it.produtoSku, gravado pelo Comercial na cotação). Se exatamente
// UMA estrutura ativa aponta pra esse SKU (pcp_produtos.produto_sku), ela é a
// escolha certa. Com N estruturas no mesmo SKU (variantes com/sem plus, box…)
// o SKU sozinho não decide — as regras condicionais/nome continuam decidindo.
function porSkuCanonico(it, produtos) {
  const sku = String(it.produtoSku || '').trim();
  if (!sku) return null;
  const candidatas = produtos.filter((p) => String(p.produto_sku || '').trim() === sku);
  return candidatas.length === 1 ? Number(candidatas[0].id) : null;
}

// ===== GET /pedidos/:id/estrutura-previa — o que a Ordem de Corte vai usar ====
// Devolve, POR ITEM, a estrutura que a importação escolheria (regra/nome) —
// o avaliador confere e corrige ANTES de liberar (a OC depende disso).
r.get(
  '/pedidos/:id/estrutura-previa',
  requirePerm('comercial', 'ver'),
  ah(async (req, res) => {
    const detalhe = await chamar('GET', `/pedidos/${encodeURIComponent(req.params.id)}`);
    const regras = await regrasAtivas();
    const categorias = await categoriasPorColecao();
    const produtos = await produtosAtivos();
    const porId = new Map(produtos.map((p) => [Number(p.id), p]));
    const itens = (detalhe.itens || []).filter((it) => Number(it.quantidade) > 0).map((it) => {
      const a = (it.atributos && typeof it.atributos === 'object' && !Array.isArray(it.atributos)) ? { ...it.atributos } : {};
      if (it.acabamento) a.acabamento = it.acabamento;
      if (it.janela) a.janela = it.janela;
      if (it.corComponentes) a.cor_componentes = it.corComponentes;
      const regra = selecionarEstrutura(contextoDeSpec({
        produto: it.tipo, colecao: it.colecao, cor_tecido: it.corTecido,
        cor_perfil: it.corPerfil, acionamento: it.acionamento, ambiente: it.ambiente,
        atributos: a, largura: it.larguraCm, altura: it.alturaCm, qnt: it.quantidade,
      }, categorias), regras);
      let produtoId = regra ? Number(regra.produto_id) : null;
      let origem = regra ? 'regra' : null;
      if (!produtoId) {
        produtoId = porSkuCanonico(it, produtos);
        if (produtoId) origem = 'sku';
      }
      if (!produtoId) {
        produtoId = fallbackPorNome(it.tipo, produtos);
        if (produtoId) origem = 'nome';
      }
      return {
        item_id: it.id != null ? String(it.id) : null,
        tipo: it.tipo || null, colecao: it.colecao || null,
        produto_id: produtoId,
        produto_nome: produtoId && porId.get(produtoId) ? porId.get(produtoId).nome : null,
        origem, // 'regra' | 'sku' | 'nome' | null (pendente)
        regra_nome: regra ? regra.nome || null : null,
      };
    });
    res.json({ itens, estruturas: produtos.map((p) => ({ id: Number(p.id), nome: p.nome, familia: p.familia })) });
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
      const cliente = (detalhe.client && (detalhe.client.nome || detalhe.client.name)) || null;
      // F1 — spec ESTRUTURADA: colunas próprias + atributos custom do formulário
      // dinâmico do Comercial (alimentam etiquetas e as futuras regras de
      // estrutura automática). Campos BASE sem coluna própria vão no JSONB.
      const atributosDe = (it) => {
        const a = (it.atributos && typeof it.atributos === 'object' && !Array.isArray(it.atributos))
          ? { ...it.atributos } : {};
        if (it.acabamento) a.acabamento = it.acabamento;
        if (it.janela) a.janela = it.janela;
        if (it.corComponentes) a.cor_componentes = it.corComponentes;
        return a;
      };
      const s120 = (v) => (v == null || v === '' ? null : String(v).slice(0, 120));
      // F3 — seleção da Estrutura do Produto: override MANUAL do avaliador
      // (body.estruturas, vindo da tela) > regras condicionais > nome exato.
      const overrides = (req.body && req.body.estruturas && typeof req.body.estruturas === 'object')
        ? req.body.estruturas : {};
      const regras = await regrasAtivas();
      const categorias = await categoriasPorColecao();
      const produtos = await produtosAtivos();
      const idsValidos = new Set(produtos.map((p) => Number(p.id)));
      const estruturaDe = (it) => {
        const manual = it.id != null ? Number(overrides[String(it.id)]) : NaN;
        if (Number.isFinite(manual) && manual > 0 && idsValidos.has(manual)) return manual;
        const regra = selecionarEstrutura(contextoDeSpec({
          produto: it.tipo, colecao: it.colecao, cor_tecido: it.corTecido,
          cor_perfil: it.corPerfil, acionamento: it.acionamento, ambiente: it.ambiente,
          atributos: atributosDe(it), largura: it.larguraCm, altura: it.alturaCm,
          qnt: it.quantidade,
        }, categorias), regras);
        if (regra) return Number(regra.produto_id);
        return porSkuCanonico(it, produtos) || fallbackPorNome(it.tipo, produtos);
      };
      await emTransacao(async (exec, client) => {
        for (const it of itens) {
          await inserirItem(client, {
            produto: String(it.tipo || 'Peça').slice(0, 160),
            produto_id: estruturaDe(it),
            pedido: codigo,
            qnt: Math.min(Number(it.quantidade) || 1, 500),
            data_cliente: dataCliente,
            tipo: 'Produção nova',
            observacoes: String(it.observacoesTecnicas || '').slice(0, 5000),
            cliente: cliente ? String(cliente).slice(0, 160) : null,
            colecao: s120(it.colecao),
            cor_tecido: s120(it.corTecido),
            cor_perfil: s120(it.corPerfil),
            acionamento: s120(it.acionamento),
            ambiente: s120(it.ambiente),
            atributos: atributosDe(it),
            comercial_item_id: it.id != null ? String(it.id).slice(0, 64) : null,
            // SKU canônico do MOTOR (Núcleo :3070) — alimenta o Plano de Corte
            produto_sku: it.produtoSku ? String(it.produtoSku).slice(0, 64) : null,
            // medidas por peça (cm) — alimentam a Ordem de Corte e a etiqueta
            largura: Number(it.larguraCm) > 0 ? Number(it.larguraCm) : null,
            altura: Number(it.alturaCm) > 0 ? Number(it.alturaCm) : null,
            // F2 — a peça já nasce com o código próprio PP<item>-<n>
            gerar_etiquetas: true,
          }, req.session.user.id);
          importados += 1;
        }
      });
    }

    // Infos de NÍVEL DE PEDIDO pra Ficha de Produção (vendedor, obs, modalidade)
    // + flags de desenho anexado (fabricação/instalação) — o arquivo fica no
    // Comercial e é servido sob demanda pelo proxy /pedidos/:id/desenhos/....
    const desenhos = Array.isArray(detalhe.desenhos) ? detalhe.desenhos : [];
    const temFab = desenhos.some((d) => d && d.tipo === 'FABRICACAO');
    const temInst = desenhos.some((d) => d && d.tipo === 'INSTALACAO');
    await q(
      `INSERT INTO pcp_pedido_info (pedido, comercial_id, cliente, vendedor, modalidade, observacoes, prazo_dias, aprovado_fin, desenho_fabricacao, desenho_instalacao, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (pedido) DO UPDATE SET
         comercial_id=EXCLUDED.comercial_id, cliente=EXCLUDED.cliente, vendedor=EXCLUDED.vendedor,
         modalidade=EXCLUDED.modalidade, observacoes=EXCLUDED.observacoes,
         prazo_dias=EXCLUDED.prazo_dias, aprovado_fin=EXCLUDED.aprovado_fin,
         desenho_fabricacao=EXCLUDED.desenho_fabricacao, desenho_instalacao=EXCLUDED.desenho_instalacao, updated_at=now()`,
      [codigo, String(id).slice(0, 64),
       (detalhe.client && (detalhe.client.nome || detalhe.client.name)) || null,
       (detalhe.consultor && detalhe.consultor.nome) || null,
       detalhe.modalidade || null,
       detalhe.observacoes || null,
       detalhe.prazoEntregaDias != null ? Number(detalhe.prazoEntregaDias) : null,
       detalhe.aprovadoFinanceiroEm ? String(detalhe.aprovadoFinanceiroEm).slice(0, 10) : null,
       temFab, temInst]
    );

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
