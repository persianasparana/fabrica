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

export async function seedItens() {
  const { rows } = await q('SELECT COUNT(*)::int AS c FROM pcp_itens');
  if (rows[0].c > 0) return 0;

  const itens = JSON.parse(readFileSync(path.join(dataDir, 'seed-itens.json'), 'utf8'));
  for (const i of itens) {
    await q(
      `INSERT INTO pcp_itens
         (produto, pedido, qnt, chegada_pcp, prev_inicial, prev_producao, conclusao,
          data_cliente, tipo, motivo_atraso, observacoes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        i.produto, i.pedido, i.qnt ?? 1, i.chegada_pcp ?? null, i.prev_inicial ?? null,
        i.prev_producao ?? null, i.conclusao ?? null, i.data_cliente ?? null,
        i.tipo || 'Produção nova', i.motivo_atraso || '', i.observacoes || '',
      ]
    );
  }
  return itens.length;
}
