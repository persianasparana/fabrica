/**
 * Geração da ordem de produção de corte.
 *
 * Cruza pedido → itens (pcp_itens) → peças (pcp_pecas com largura/altura/medidas)
 * → produto (pcp_produtos.cortes) e avalia as fórmulas com o motor (corte.js),
 * agrupando os cortes por SETOR. Cada setor de corte só "enxerga" os cortes
 * que lhe pertencem (tecido vê tecido, perfil vê perfil, etc.).
 *
 * Setor de cada corte: usa corte.setor_id quando definido; senão, infere por
 * palavra-chave a partir do nome do corte vs. os nomes dos setores (provisório,
 * até o setor_id ser mapeado no editor da Estrutura).
 */
import { calcularCortes, avaliarFormula } from './corte.js';
import { q } from './db.js';

// Heurística de palavra-chave → casa o nome do corte com um setor pelo nome.
function inferirSetor(nomeCorte, setores) {
  const n = String(nomeCorte || '').toLowerCase();
  const tem = (...ks) => ks.some((k) => n.includes(k));
  let alvo = null;
  if (tem('tecido')) alvo = 'tecido';
  else if (tem('tubo', 'eixo', 'rolete')) alvo = 'tubo';
  else if (tem('vareta', 'gomos')) alvo = 'vareta';
  else if (tem('lâmina', 'lamina', 'corda', 'furo', 'cadarço', 'cadarco', 'cabeçalho', 'cabecalho', 'm²', 'm2')) alvo = 'horizontal';
  else alvo = 'perfil';
  // procura um setor cujo nome contenha a palavra-alvo
  const match = setores.find((s) => s.nome.toLowerCase().includes(alvo));
  return match || null;
}

function escopoPeca(peca, item) {
  // Medidas são ARMAZENADAS sempre em cm (convenção do preenchimento), mas as
  // fórmulas usam a unidade do PRODUTO: horizontais (unidade 'm', como as
  // planilhas PH25/PH50) recebem metros; os demais recebem cm.
  const fator = item && item.unidade === 'm' ? 0.01 : 1;
  const largura = peca.largura != null ? Number(peca.largura) * fator : 0;
  const altura = peca.altura != null ? Number(peca.altura) * fator : 0;
  const escopo = {
    largura, altura, l: largura, a: altura,
    qtde: 1, qtd: 1,
  };
  // medidas extras (furos, modelo, comando, etc.) por peça
  if (peca.medidas && typeof peca.medidas === 'object') {
    for (const [k, v] of Object.entries(peca.medidas)) {
      if (v != null && v !== '') escopo[String(k).toLowerCase()] = Number(v);
    }
  }
  // comando (altura do bastão/corrente) é COMPRIMENTO: armazenado em cm, vai
  // para as fórmulas na unidade do produto, igual a largura/altura
  if (escopo.comando) escopo.comando = escopo.comando * fator;
  return escopo;
}

/**
 * Calcula a ordem de corte para um conjunto de pedidos.
 * @returns { setores: [{ setor, linhas: [...] }], pedidos, avisos }
 * linha = { pedido, produto, peca_numero, cod_barras, largura, altura,
 *           corte, valor, unidade, qtd }
 */
export async function calcularOrdem(pedidos, { setorId = null } = {}) {
  const lista = [...new Set((pedidos || []).map((p) => String(p).trim()).filter(Boolean))];
  if (!lista.length) return { setores: [], pedidos: [], avisos: ['Nenhum pedido informado'] };

  const { rows: setores } = await q('SELECT id, nome, cor, ordem, ordem_corte FROM pcp_setores WHERE ativo = TRUE ORDER BY ordem, nome');
  const setorById = Object.fromEntries(setores.map((s) => [Number(s.id), s]));

  const { rows: itens } = await q(
    `SELECT i.id, i.pedido, i.produto, i.produto_id, i.qnt,
            p.cortes, p.componentes, p.unidade, p.nome AS produto_nome
     FROM pcp_itens i LEFT JOIN pcp_produtos p ON p.id = i.produto_id
     WHERE i.pedido = ANY($1) ORDER BY i.pedido, i.id`, [lista]);
  const { rows: pecas } = await q(
    `SELECT pp.id, pp.item_id, pp.numero, pp.largura, pp.altura, pp.medidas, pp.cod_barras
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     WHERE i.pedido = ANY($1) ORDER BY pp.item_id, pp.numero`, [lista]);

  const pecasPorItem = {};
  for (const pc of pecas) (pecasPorItem[pc.item_id] = pecasPorItem[pc.item_id] || []).push(pc);

  const grupos = new Map(); // setorKey -> { setor, linhas: [] }
  const avisos = [];
  const semSetor = { id: null, nome: 'Não classificado', cor: '#606060', ordem: 999, ordem_corte: false };
  const comps = new Map(); // nome -> { nome, total, obs } — demais materiais (BOM), soma do pedido

  for (const item of itens) {
    const cortes = Array.isArray(item.cortes) ? item.cortes : [];
    if (!item.produto_id) {
      avisos.push(`Pedido ${item.pedido}: item "${item.produto}" com ESTRUTURA PENDENTE — defina a Estrutura do Produto no item ou cadastre uma regra de seleção automática (aba Estrutura do Produto).`);
      continue;
    }
    if (!cortes.length) {
      avisos.push(`Pedido ${item.pedido}: produto "${item.produto}" sem cortes parametrizados na Estrutura.`);
      continue;
    }
    const itemPecas = pecasPorItem[item.id] || [];
    const componentes = Array.isArray(item.componentes) ? item.componentes : [];
    for (const peca of itemPecas) {
      const escopo = escopoPeca(peca, item);   // converte cm → unidade do produto
      // Demais materiais (BOM): soma a quantidade de cada componente por peça.
      // Funções de qtd (garrasPorLargura etc.) usam cm — converte quando o produto é em m.
      const escopoCm = item.unidade === 'm'
        ? Object.assign({}, escopo, {
          largura: escopo.largura * 100, altura: escopo.altura * 100,
          l: escopo.l * 100, a: escopo.a * 100,
          comando: (escopo.comando || 0) * 100,
        })
        : escopo;
      for (const c of componentes) {
        let qtd;
        try {
          qtd = c.qtdFormula
            ? Math.max(0, Math.round(avaliarFormula(c.qtdFormula, escopoCm)))
            : Number(c.qtd != null ? c.qtd : 1);
        } catch (e) {
          avisos.push(`Pedido ${item.pedido}: componente "${c.nome}" com erro de cálculo (${e.message}).`);
          continue;
        }
        if (!(qtd > 0)) continue;
        const chave = String(c.nome || '').trim();
        if (!comps.has(chave)) comps.set(chave, { nome: chave, total: 0, obs: c.obs || '' });
        const g = comps.get(chave);
        g.total += qtd;
        if (!g.obs && c.obs) g.obs = c.obs;
      }
      let resultado;
      try { resultado = calcularCortes(cortes, escopo); }
      catch (e) { avisos.push(`Pedido ${item.pedido}, peça ${peca.numero}: erro de cálculo (${e.message}).`); continue; }
      for (let idx = 0; idx < resultado.length; idx++) {
        const r = resultado[idx];
        const cfg = cortes[idx] || {};
        const setor = (r.setor_id && setorById[r.setor_id]) || inferirSetor(r.nome, setores) || semSetor;
        if (setorId && Number(setor.id) !== Number(setorId)) continue;
        const key = setor.id == null ? 'sem' : String(setor.id);
        if (!grupos.has(key)) grupos.set(key, { setor, linhas: [] });
        grupos.get(key).linhas.push({
          pedido: item.pedido, produto: item.produto_nome || item.produto,
          item_id: item.id, peca_id: peca.id,
          peca_numero: peca.numero, cod_barras: peca.cod_barras,
          largura: escopo.largura || null, altura: escopo.altura || null,  // na unidade do produto
          comando: escopo.comando || null,   // altura do comando/bastão (idem)
          corte: r.nome, valor: Number.isFinite(r.valor) ? Math.round(r.valor * 1000) / 1000 : null,
          unidade: r.unidade || item.unidade || 'cm', qtd: r.qtd,
          barra: cfg.barra != null && Number.isFinite(Number(cfg.barra)) && Number(cfg.barra) > 0 ? Number(cfg.barra) : null,
        });
      }
    }
  }

  const gruposArr = [...grupos.values()].sort((a, b) => (a.setor.ordem || 0) - (b.setor.ordem || 0));
  const componentesArr = [...comps.values()]
    .map((c) => ({ nome: c.nome, total: Math.round(c.total * 100) / 100, obs: c.obs }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
  return { setores: gruposArr, pedidos: lista, avisos: [...new Set(avisos)], componentes: componentesArr };
}

/** Registra a impressão e devolve se já havia sido impresso antes. */
export async function registrarImpressao(pedidos, { setorId = null, modo = 'individual', userId, userNome } = {}) {
  const lista = [...new Set((pedidos || []).map((p) => String(p).trim()).filter(Boolean))];
  const { rows: anteriores } = await q(
    `SELECT COUNT(*)::int AS c FROM pcp_ordem_corte_log l
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(l.pedidos) e WHERE e = ANY($1))
       ${setorId ? 'AND l.setor_id = $2' : ''}`,
    setorId ? [lista, setorId] : [lista]
  );
  const reimpressao = anteriores[0].c > 0;
  await q(
    `INSERT INTO pcp_ordem_corte_log (pedido, setor_id, modo, tipo, pedidos, por, por_nome)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
    [lista.length === 1 ? lista[0] : null, setorId, modo,
     reimpressao ? 'reimpressao' : 'impressao', JSON.stringify(lista), userId || null, userNome || null]
  );
  return { reimpressao };
}

/** Histórico de impressão por pedido (para destacar no PCP). */
export async function statusImpressao(pedidos) {
  const lista = [...new Set((pedidos || []).map((p) => String(p).trim()).filter(Boolean))];
  if (!lista.length) return {};
  const { rows } = await q(
    `SELECT l.pedido, p.pedido_no AS pno, l.tipo, l.modo, l.por_nome,
            to_char(l.created_at, 'YYYY-MM-DD HH24:MI') AS quando
     FROM pcp_ordem_corte_log l
     CROSS JOIN LATERAL (SELECT jsonb_array_elements_text(l.pedidos) AS pedido_no) p
     WHERE p.pedido_no = ANY($1)
     ORDER BY l.created_at DESC`, [lista]);
  const out = {};
  for (const r of rows) {
    const ped = r.pno;
    if (!out[ped]) out[ped] = { impresso: true, ultima: r.quando, vezes: 0, historico: [] };
    out[ped].vezes++;
    out[ped].historico.push({ tipo: r.tipo, modo: r.modo, por: r.por_nome, quando: r.quando });
  }
  return out;
}
