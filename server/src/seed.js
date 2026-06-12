/**
 * Seed inicial do PCP — estrutura do produto (catálogo oficial) e fila de
 * produção (itens da planilha de planejamento). Idempotente: só insere
 * quando a tabela correspondente está vazia.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, '..', 'data');

export async function seedEstrutura() {
  const { rows } = await q('SELECT COUNT(*)::int AS c FROM pcp_produtos');
  if (rows[0].c > 0) return 0;

  const { produtos } = JSON.parse(
    readFileSync(path.join(dataDir, 'estrutura-produtos.json'), 'utf8')
  );
  for (const p of produtos) {
    await q(
      `INSERT INTO pcp_produtos (chave, nome, familia, tubo, unidade, cortes, componentes, calculo_extra_fonte)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
      [
        p.chave, p.nome, p.familia, p.tubo ?? null, p.unidade || 'cm',
        JSON.stringify(p.cortes || []), JSON.stringify(p.componentes || []),
        p.calculoExtraFonte ?? null,
      ]
    );
  }
  return produtos.length;
}

/** Status de produção iniciais — editáveis pelo admin (cadastrar/excluir). */
export async function seedStatus() {
  const { rows } = await q('SELECT COUNT(*)::int AS c FROM pcp_status');
  if (rows[0].c > 0) return 0;

  const padroes = [
    ['Aguardando material', '#B45309', 10],
    ['Liberado p/ produção', '#1E40AF', 20],
    ['Em corte', '#0891B2', 30],
    ['Em montagem', '#7C3AED', 40],
    ['Em acabamento', '#C2410C', 50],
    ['Pronto', '#15803D', 60],
    ['Expedido', '#374151', 70],
  ];
  for (const [nome, cor, ordem] of padroes) {
    await q('INSERT INTO pcp_status (nome, cor, ordem) VALUES ($1, $2, $3)', [nome, cor, ordem]);
  }
  return padroes.length;
}

/** Setores de produção iniciais + marca um status como final (baixa). */
export async function seedSetores() {
  const { rows } = await q('SELECT COUNT(*)::int AS c FROM pcp_setores');
  if (rows[0].c > 0) return 0;

  const { rows: sts } = await q('SELECT id, nome FROM pcp_status');
  const idDe = {};
  for (const s of sts) idDe[s.nome] = Number(s.id);

  const defs = [
    ['Corte', '#0891B2', 10, 'Em corte'],
    ['Montagem', '#7C3AED', 20, 'Em montagem'],
    ['Acabamento', '#C2410C', 30, 'Em acabamento'],
    ['Embalagem', '#374151', 40, 'Expedido'],
  ];
  for (const [nome, cor, ordem, statusNome] of defs) {
    await q('INSERT INTO pcp_setores (nome, cor, ordem, status_id) VALUES ($1,$2,$3,$4)', [
      nome, cor, ordem, idDe[statusNome] ?? null,
    ]);
  }
  // "Expedido" como status final (o 'fim' nesse status dá baixa na peça)
  await q("UPDATE pcp_status SET final = TRUE WHERE nome = 'Expedido'");
  return defs.length;
}

export async function seedItens() {
  const { rows } = await q('SELECT COUNT(*)::int AS c FROM pcp_itens');
  if (rows[0].c > 0) return 0;

  const itens = JSON.parse(readFileSync(path.join(dataDir, 'seed-itens.json'), 'utf8'));
  for (const i of itens) {
    const { rows } = await q(
      `INSERT INTO pcp_itens
         (produto, pedido, qnt, chegada_pcp, prev_inicial, prev_producao, conclusao,
          data_cliente, tipo, motivo_atraso, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        i.produto, i.pedido, i.qnt ?? 1, i.chegada_pcp ?? null, i.prev_inicial ?? null,
        i.prev_producao ?? null, i.conclusao ?? null, i.data_cliente ?? null,
        i.tipo || 'Produção nova', i.motivo_atraso || '', i.observacoes || '',
      ]
    );
    // cada item gera qnt peças individuais (concluídas junto com o item, se for o caso)
    await q(
      `INSERT INTO pcp_pecas (item_id, numero, conclusao)
       SELECT $1, gs.n, $2::date FROM generate_series(1, GREATEST($3::int, 1)) AS gs(n)`,
      [rows[0].id, i.conclusao ?? null, i.qnt ?? 1]
    );
  }
  return itens.length;
}
