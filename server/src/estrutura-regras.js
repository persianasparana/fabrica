/**
 * Regras de seleção automática da Estrutura do Produto (F3).
 *
 * Uma regra = { produto_id (estrutura destino), prioridade, condicoes[] }.
 * Condições são combinadas com E; a PRIMEIRA regra (por prioridade, id) cujas
 * condições todas casem com a spec do item vence. Sem match → produto_id fica
 * NULL e o item aparece como "estrutura pendente" na fila (escolha manual,
 * nada trava — exatamente como hoje).
 *
 * Exemplo (do cliente): Rolô Premium + tecido "Sheer" → estrutura Sheer;
 * Rolô Premium + largura > 250 → estrutura Reforçada.
 */
import { q } from './db.js';

/** Campos disponíveis nas condições. `attr:<chave>` (texto) também vale. */
export const CAMPOS_REGRA = [
  { chave: 'produto',     rotulo: 'Tipo da peça (produto)', tipo: 'texto' },
  { chave: 'colecao',     rotulo: 'Coleção',                tipo: 'texto' },
  { chave: 'cor_tecido',  rotulo: 'Cor do tecido',          tipo: 'texto' },
  { chave: 'cor_perfil',  rotulo: 'Cor do perfil',          tipo: 'texto' },
  { chave: 'acionamento', rotulo: 'Acionamento',            tipo: 'texto' },
  { chave: 'ambiente',    rotulo: 'Ambiente',               tipo: 'texto' },
  { chave: 'largura',     rotulo: 'Largura (cm)',           tipo: 'numero' },
  { chave: 'altura',      rotulo: 'Altura (cm)',            tipo: 'numero' },
  { chave: 'area',        rotulo: 'Área (m²)',              tipo: 'numero' },
  { chave: 'qnt',         rotulo: 'Quantidade de peças',    tipo: 'numero' },
];

export const OPERADORES = {
  texto: [
    { op: 'e',          rotulo: 'é' },
    { op: 'nao_e',      rotulo: 'não é' },
    { op: 'contem',     rotulo: 'contém' },
    { op: 'comeca_com', rotulo: 'começa com' },
  ],
  numero: [
    { op: '=', rotulo: '=' }, { op: '!=', rotulo: '≠' },
    { op: '<', rotulo: '<' }, { op: '<=', rotulo: '≤' },
    { op: '>', rotulo: '>' }, { op: '>=', rotulo: '≥' },
    { op: 'entre', rotulo: 'entre (inclusive)' },
  ],
};

export function tipoDoCampo(campo) {
  if (String(campo).startsWith('attr:')) return 'texto';
  const c = CAMPOS_REGRA.find((x) => x.chave === campo);
  return c ? c.tipo : null;
}

/** Normalização de texto: minúsculas, sem acento, espaços aparados. */
const norm = (s) => String(s == null ? '' : s)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Avalia UMA condição contra o contexto da peça/item. */
export function avaliarCondicao(cond, ctx) {
  const campo = String(cond.campo || '');
  const tipo = tipoDoCampo(campo);
  if (!tipo) return false;

  if (tipo === 'texto') {
    const bruto = campo.startsWith('attr:')
      ? (ctx.atributos || {})[campo.slice(5)]
      : ctx[campo];
    const v = norm(bruto);
    const alvo = norm(cond.valor);
    switch (cond.operador) {
      case 'e': return v === alvo;
      case 'nao_e': return v !== alvo;
      case 'contem': return alvo !== '' && v.includes(alvo);
      case 'comeca_com': return alvo !== '' && v.startsWith(alvo);
      default: return false;
    }
  }

  const v = Number(ctx[campo]);
  const alvo = Number(cond.valor);
  if (!Number.isFinite(v)) return false;
  switch (cond.operador) {
    case '=': return v === alvo;
    case '!=': return v !== alvo;
    case '<': return v < alvo;
    case '<=': return v <= alvo;
    case '>': return v > alvo;
    case '>=': return v >= alvo;
    case 'entre': {
      const b = Number(cond.valor2);
      if (!Number.isFinite(alvo) || !Number.isFinite(b)) return false;
      return v >= Math.min(alvo, b) && v <= Math.max(alvo, b);
    }
    default: return false;
  }
}

/** Primeira regra (por prioridade, id) cujas condições TODAS casam. */
export function selecionarEstrutura(ctx, regras) {
  for (const r of regras) {
    if (r.ativo === false) continue;
    const conds = Array.isArray(r.condicoes) ? r.condicoes : [];
    if (!conds.length) continue; // regra sem condição não casa com nada
    if (conds.every((c) => avaliarCondicao(c, ctx))) return r;
  }
  return null;
}

/** Contexto de avaliação a partir da spec estruturada (F1). */
export function contextoDeSpec(s) {
  const largura = s.largura != null && s.largura !== '' ? Number(s.largura) : null;
  const altura = s.altura != null && s.altura !== '' ? Number(s.altura) : null;
  return {
    produto: s.produto || '',
    colecao: s.colecao || '',
    cor_tecido: s.cor_tecido || '',
    cor_perfil: s.cor_perfil || '',
    acionamento: s.acionamento || '',
    ambiente: s.ambiente || '',
    atributos: s.atributos && typeof s.atributos === 'object' ? s.atributos : {},
    largura,
    altura,
    area: largura != null && altura != null ? (largura * altura) / 10000 : null,
    qnt: s.qnt != null ? Number(s.qnt) : null,
  };
}

/** Regras ativas, na ordem de avaliação, com o nome da estrutura destino. */
export async function regrasAtivas() {
  const { rows } = await q(
    `SELECT r.id, r.descricao, r.produto_id, r.prioridade, r.condicoes, r.ativo,
            p.nome AS produto_nome, p.familia AS produto_familia
     FROM pcp_estrutura_regras r
     JOIN pcp_produtos p ON p.id = r.produto_id AND p.ativo = TRUE
     WHERE r.ativo = TRUE
     ORDER BY r.prioridade, r.id`
  );
  return rows;
}

/**
 * (Re)aplica as regras na fila em aberto.
 * @param opts { pedidos: [..]|null (null = fila inteira), sobrescrever: bool }
 *   sobrescrever=false → só itens SEM estrutura (produto_id NULL);
 *   sobrescrever=true  → reavalia também os que já têm (escolha manual é
 *   sobrescrita — usar com cuidado, o botão avisa).
 * @returns { avaliados, aplicados, pendentes, detalhes }
 */
export async function aplicarRegrasFila({ pedidos = null, sobrescrever = false } = {}) {
  const regras = await regrasAtivas();
  const params = [];
  let where = 'i.conclusao IS NULL';
  if (pedidos && pedidos.length) { params.push(pedidos); where += ` AND i.pedido = ANY($${params.length})`; }
  if (!sobrescrever) where += ' AND i.produto_id IS NULL';

  const { rows: itens } = await q(
    `SELECT i.id, i.pedido, i.produto, i.produto_id, i.qnt, i.colecao, i.cor_tecido,
            i.cor_perfil, i.acionamento, i.ambiente, i.atributos,
            (SELECT pp.largura FROM pcp_pecas pp WHERE pp.item_id = i.id ORDER BY pp.numero LIMIT 1) AS largura,
            (SELECT pp.altura  FROM pcp_pecas pp WHERE pp.item_id = i.id ORDER BY pp.numero LIMIT 1) AS altura
     FROM pcp_itens i WHERE ${where} ORDER BY i.id`,
    params
  );

  const detalhes = [];
  let aplicados = 0;
  for (const it of itens) {
    const ctx = contextoDeSpec(it);
    const regra = selecionarEstrutura(ctx, regras);
    if (regra && Number(regra.produto_id) !== (it.produto_id != null ? Number(it.produto_id) : null)) {
      await q('UPDATE pcp_itens SET produto_id = $2, updated_at = now() WHERE id = $1', [it.id, regra.produto_id]);
      aplicados += 1;
    }
    detalhes.push({
      item_id: Number(it.id),
      pedido: it.pedido,
      produto: it.produto,
      regra_id: regra ? Number(regra.id) : null,
      regra: regra ? regra.descricao : null,
      estrutura: regra ? regra.produto_nome : null,
    });
  }
  return {
    avaliados: itens.length,
    aplicados,
    pendentes: detalhes.filter((d) => !d.regra_id).length,
    detalhes,
  };
}
