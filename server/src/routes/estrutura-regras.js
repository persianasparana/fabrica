/**
 * Rotas das regras de seleção automática da Estrutura do Produto (F3).
 *   GET  /                       lista (todas, inclusive inativas)
 *   GET  /campos                 dicionário de campos + operadores
 *   POST /                       cria regra                    (CSRF)
 *   PUT  /?id=N                  atualiza regra                (CSRF)
 *   DELETE /?id=N                exclui regra                  (CSRF)
 *   POST /testar { spec }        avalia uma peça de exemplo (não grava)
 *   POST /aplicar { pedidos?, sobrescrever? }   (re)aplica na fila (CSRF)
 */
import { Router } from 'express';
import { requireAuth, requireCsrf, requirePerm, audit } from '../auth.js';
import { q } from '../db.js';
import { ah, HttpError } from '../util.js';
import {
  CAMPOS_REGRA, OPERADORES, tipoDoCampo, contextoDeSpec,
  selecionarEstrutura, regrasAtivas, aplicarRegrasFila,
} from '../estrutura-regras.js';

const r = Router();
r.use(requireAuth);

r.get('/campos', ah(async (req, res) => {
  res.json({ campos: CAMPOS_REGRA, operadores: OPERADORES });
}));

r.get('/', requirePerm('estrutura', 'ver'), ah(async (req, res) => {
  const { rows } = await q(
    `SELECT r.id, r.descricao, r.produto_id, r.prioridade, r.condicoes, r.ativo,
            p.nome AS produto_nome, p.familia AS produto_familia, p.ativo AS produto_ativo
     FROM pcp_estrutura_regras r
     JOIN pcp_produtos p ON p.id = r.produto_id
     ORDER BY r.prioridade, r.id`
  );
  res.json({ data: rows });
}));

const OPS_VALIDOS = new Set([...OPERADORES.texto, ...OPERADORES.numero].map((o) => o.op));

function validarRegra(d, partial = false) {
  if (!partial) {
    if (!d.descricao || !String(d.descricao).trim()) throw new HttpError(422, 'Descrição é obrigatória');
    if (!Number.isInteger(Number(d.produto_id)) || Number(d.produto_id) <= 0)
      throw new HttpError(422, 'Escolha a estrutura destino (produto)');
  }
  if (d.descricao != null && String(d.descricao).length > 160) throw new HttpError(422, 'Descrição muito longa (máx. 160)');
  if (d.prioridade != null && !Number.isInteger(Number(d.prioridade)))
    throw new HttpError(422, 'Prioridade deve ser um número inteiro');
  if (d.condicoes !== undefined || !partial) {
    const conds = d.condicoes;
    if (!Array.isArray(conds) || !conds.length)
      throw new HttpError(422, 'A regra precisa de pelo menos 1 condição');
    if (conds.length > 20) throw new HttpError(422, 'Máximo de 20 condições por regra');
    conds.forEach((c, i) => {
      const tipo = tipoDoCampo(c?.campo);
      if (!tipo) throw new HttpError(422, `Condição ${i + 1}: campo inválido`);
      if (!OPS_VALIDOS.has(String(c.operador))) throw new HttpError(422, `Condição ${i + 1}: operador inválido`);
      const opsDoTipo = OPERADORES[tipo].map((o) => o.op);
      if (!opsDoTipo.includes(String(c.operador)))
        throw new HttpError(422, `Condição ${i + 1}: operador não vale para campo de ${tipo}`);
      if (c.valor == null || String(c.valor).trim() === '')
        throw new HttpError(422, `Condição ${i + 1}: informe o valor`);
      if (tipo === 'numero' && !Number.isFinite(Number(c.valor)))
        throw new HttpError(422, `Condição ${i + 1}: valor deve ser numérico`);
      if (c.operador === 'entre' && !Number.isFinite(Number(c.valor2)))
        throw new HttpError(422, `Condição ${i + 1}: "entre" precisa do segundo valor`);
      if (String(c.campo) === 'attr:' || (String(c.campo).startsWith('attr:') && !String(c.campo).slice(5).trim()))
        throw new HttpError(422, `Condição ${i + 1}: informe a chave do atributo`);
    });
  }
}

const normConds = (conds) => (conds || []).map((c) => ({
  campo: String(c.campo).trim().slice(0, 80),
  operador: String(c.operador),
  valor: typeof c.valor === 'number' ? c.valor : String(c.valor).trim().slice(0, 160),
  ...(c.operador === 'entre' ? { valor2: Number(c.valor2) } : {}),
}));

async function assertProduto(id) {
  const { rows } = await q('SELECT 1 FROM pcp_produtos WHERE id = $1 AND ativo = TRUE', [Number(id)]);
  if (!rows[0]) throw new HttpError(422, 'Estrutura destino inexistente ou inativa');
}

r.post('/', requirePerm('estrutura', 'editar'), requireCsrf, ah(async (req, res) => {
  const d = req.body || {};
  validarRegra(d);
  await assertProduto(d.produto_id);
  const { rows } = await q(
    `INSERT INTO pcp_estrutura_regras (descricao, produto_id, prioridade, condicoes, ativo)
     VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id`,
    [
      String(d.descricao).trim(), Number(d.produto_id),
      d.prioridade != null ? Number(d.prioridade) : 100,
      JSON.stringify(normConds(d.condicoes)),
      d.ativo !== false,
    ]
  );
  const id = Number(rows[0].id);
  await audit(req.session.user.id, 'pcp', 'estrutura.regra.create', { entityType: 'pcp_estrutura_regra', entityId: id });
  res.status(201).json({ id });
}));

r.put('/', requirePerm('estrutura', 'editar'), requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const d = req.body || {};
  validarRegra(d, true);
  if (d.produto_id != null) await assertProduto(d.produto_id);
  const result = await q(
    `UPDATE pcp_estrutura_regras SET
       descricao  = COALESCE($2, descricao),
       produto_id = COALESCE($3, produto_id),
       prioridade = COALESCE($4, prioridade),
       condicoes  = COALESCE($5::jsonb, condicoes),
       ativo      = COALESCE($6, ativo),
       updated_at = now()
     WHERE id = $1`,
    [
      id,
      d.descricao != null ? String(d.descricao).trim() : null,
      d.produto_id != null ? Number(d.produto_id) : null,
      d.prioridade != null ? Number(d.prioridade) : null,
      d.condicoes !== undefined ? JSON.stringify(normConds(d.condicoes)) : null,
      typeof d.ativo === 'boolean' ? d.ativo : null,
    ]
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Regra não encontrada');
  await audit(req.session.user.id, 'pcp', 'estrutura.regra.update', { entityType: 'pcp_estrutura_regra', entityId: id });
  res.json({ ok: true });
}));

r.delete('/', requirePerm('estrutura', 'editar'), requireCsrf, ah(async (req, res) => {
  const id = Number(req.query.id || 0);
  if (!id) throw new HttpError(400, 'ID obrigatório');
  const result = await q('DELETE FROM pcp_estrutura_regras WHERE id = $1', [id]);
  if (result.rowCount === 0) throw new HttpError(404, 'Regra não encontrada');
  await audit(req.session.user.id, 'pcp', 'estrutura.regra.delete', { entityType: 'pcp_estrutura_regra', entityId: id });
  res.json({ ok: true });
}));

// "Testar com uma peça de exemplo" — avalia a spec digitada e mostra qual
// regra venceria (e as que não casaram), sem gravar nada.
r.post('/testar', requirePerm('estrutura', 'ver'), ah(async (req, res) => {
  const spec = req.body?.spec || req.body || {};
  const ctx = contextoDeSpec({
    produto: spec.produto, colecao: spec.colecao, cor_tecido: spec.cor_tecido,
    cor_perfil: spec.cor_perfil, acionamento: spec.acionamento, ambiente: spec.ambiente,
    atributos: spec.atributos, largura: spec.largura, altura: spec.altura, qnt: spec.qnt,
  });
  const regras = await regrasAtivas();
  const vencedora = selecionarEstrutura(ctx, regras);
  res.json({
    ctx,
    vencedora: vencedora
      ? { id: Number(vencedora.id), descricao: vencedora.descricao, prioridade: vencedora.prioridade,
          produto_id: Number(vencedora.produto_id), estrutura: vencedora.produto_nome }
      : null,
    total_regras: regras.length,
  });
}));

// (Re)aplica as regras na fila em aberto. Sem { pedidos } = fila inteira.
r.post('/aplicar', requirePerm('fila', 'editar'), requireCsrf, ah(async (req, res) => {
  const pedidos = Array.isArray(req.body?.pedidos)
    ? req.body.pedidos.map((p) => String(p).trim()).filter(Boolean)
    : null;
  const sobrescrever = req.body?.sobrescrever === true;
  const out = await aplicarRegrasFila({ pedidos: pedidos && pedidos.length ? pedidos : null, sobrescrever });
  await audit(req.session.user.id, 'pcp', 'estrutura.regra.aplicar', { entityType: 'pcp_item' });
  res.json(out);
}));

export default r;
