/**
 * Etiquetas próprias do PCP (F2) — substituem as etiquetas do SYSOP.
 *
 * Cada peça tem UM código ("número de série" da peça manufaturada, decisão do
 * cliente em 07/07/2026): o mesmo código sai em todas as etiquetas da peça,
 * mesmo quando os componentes passam por setores distintos. O conteúdo da
 * etiqueta varia por setor via MODELOS parametrizáveis (pcp_etiqueta_modelos).
 *
 * Resolução do modelo de um setor: primeiro modelo ativo que lista o setor em
 * `setores`; senão o fallback (modelo ativo com `setores = []`, o padrão
 * primeiro). Setor sem modelo não imprime etiqueta.
 */
import { q } from './db.js';

/** Campos disponíveis para os modelos (dicionário). `attr:<chave>` também vale. */
export const CAMPOS_ETIQUETA = [
  { chave: 'pedido',       rotulo: 'Pedido' },
  { chave: 'cliente',      rotulo: 'Cliente' },
  { chave: 'produto',      rotulo: 'Produto' },
  { chave: 'peca',         rotulo: 'Peça (n/total)' },
  { chave: 'medidas',      rotulo: 'Medidas (L×A)' },
  { chave: 'colecao',      rotulo: 'Coleção' },
  { chave: 'cor_tecido',   rotulo: 'Cor do tecido' },
  { chave: 'cor_perfil',   rotulo: 'Cor do perfil' },
  { chave: 'acionamento',  rotulo: 'Acionamento' },
  { chave: 'ambiente',     rotulo: 'Ambiente' },
  { chave: 'chegada_pcp',  rotulo: 'Entrada no PCP' },
  { chave: 'data_cliente', rotulo: 'Prazo do cliente' },
  { chave: 'tipo',         rotulo: 'Tipo de produção' },
  { chave: 'observacoes',  rotulo: 'Observações' },
  { chave: 'setor',        rotulo: 'Setor' },
  { chave: 'acabamento',   rotulo: 'Acabamento (Trilho Plus/Bandô...)' },
  { chave: 'lado',         rotulo: 'Lado do acionamento' },
  { chave: 'cor_componentes', rotulo: 'Cor dos componentes' },
  { chave: 'janela',       rotulo: 'Janela/vão' },
  { chave: 'atributos',    rotulo: 'Demais atributos do formulário' },
  { chave: 'marca',        rotulo: 'Marca (Persianas Paraná)' },
];

const SELECT_PECAS = `
  SELECT pp.id AS peca_id, pp.numero, pp.cod_barras, pp.largura, pp.altura,
         to_char(pp.conclusao, 'YYYY-MM-DD') AS conclusao,
         i.id AS item_id, i.pedido, i.produto, i.qnt, i.tipo, i.observacoes,
         i.cliente, i.colecao, i.cor_tecido, i.cor_perfil, i.acionamento,
         i.ambiente, i.atributos,
         to_char(i.chegada_pcp,  'YYYY-MM-DD') AS chegada_pcp,
         to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente,
         (SELECT COUNT(*)::int FROM pcp_pecas t WHERE t.item_id = i.id) AS peca_total
  FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id`;

/** Modelos ativos, padrão primeiro. */
export async function modelosAtivos() {
  const { rows } = await q(
    `SELECT id, nome, largura_mm, altura_mm, setores, campos, codigo, padrao, ativo
     FROM pcp_etiqueta_modelos WHERE ativo = TRUE
     ORDER BY padrao DESC, id`
  );
  return rows;
}

/** Modelo que atende um setor (específico > fallback com setores=[]). */
export function resolverModelo(setorId, modelos) {
  const especifico = modelos.find(
    (m) => Array.isArray(m.setores) && m.setores.map(Number).includes(Number(setorId))
  );
  if (especifico) return especifico;
  return modelos.find((m) => !Array.isArray(m.setores) || m.setores.length === 0) || null;
}

/**
 * Gera o código próprio (PP<item>-<n>) das peças SEM código dos pedidos
 * informados — reaproveita peças antigas da fila sem quebrar nada.
 */
export async function gerarCodigosFaltantes(pedidos) {
  const { rowCount } = await q(
    `UPDATE pcp_pecas pp SET cod_barras = 'PP' || pp.item_id || '-' || pp.numero,
            vinculada_em = now(), updated_at = now()
     FROM pcp_itens i
     WHERE i.id = pp.item_id AND i.pedido = ANY($1) AND pp.cod_barras IS NULL`,
    [pedidos]
  );
  return rowCount;
}

/**
 * Monta os dados de impressão: um grupo por SETOR (na ordem dos setores),
 * cada um com seu modelo e uma etiqueta por peça.
 * @param pedidos lista de códigos de pedido (PED-… ou nº da fila)
 * @param opts { setorIds: [..] | null, pecaIds: [..] | null }
 */
export async function dadosEtiquetas(pedidos, { setorIds = null, pecaIds = null } = {}) {
  const lista = [...new Set((pedidos || []).map((p) => String(p).trim()).filter(Boolean))];
  const avisos = [];

  let pecas;
  if (pecaIds && pecaIds.length) {
    ({ rows: pecas } = await q(
      `${SELECT_PECAS} WHERE pp.id = ANY($1::bigint[]) ORDER BY i.pedido, pp.item_id, pp.numero`,
      [pecaIds.map(Number)]
    ));
  } else {
    if (!lista.length) return { grupos: [], pedidos: [], avisos: ['Nenhum pedido informado'] };
    ({ rows: pecas } = await q(
      `${SELECT_PECAS} WHERE i.pedido = ANY($1) ORDER BY i.pedido, pp.item_id, pp.numero`,
      [lista]
    ));
  }
  if (!pecas.length) return { grupos: [], pedidos: lista, avisos: ['Nenhuma peça encontrada'] };

  const semCodigo = pecas.filter((p) => !p.cod_barras).length;
  if (semCodigo) avisos.push(`${semCodigo} peça(s) ainda sem código — será gerado na impressão.`);

  const { rows: setores } = await q(
    'SELECT id, nome, cor, ordem FROM pcp_setores WHERE ativo = TRUE ORDER BY ordem, nome'
  );
  const modelos = await modelosAtivos();
  if (!modelos.length) return { grupos: [], pedidos: lista, avisos: ['Nenhum modelo de etiqueta ativo — cadastre um na aba Etiquetas.'] };

  const etiquetaDe = (p, setorNome) => ({
    peca_id: Number(p.peca_id),
    codigo: p.cod_barras || `PP${p.item_id}-${p.numero}`,
    pedido: p.pedido,
    cliente: p.cliente,
    produto: p.produto,
    peca_numero: Number(p.numero),
    peca_total: Number(p.peca_total),
    largura: p.largura != null ? Number(p.largura) : null,
    altura: p.altura != null ? Number(p.altura) : null,
    colecao: p.colecao,
    cor_tecido: p.cor_tecido,
    cor_perfil: p.cor_perfil,
    acionamento: p.acionamento,
    ambiente: p.ambiente,
    chegada_pcp: p.chegada_pcp,
    data_cliente: p.data_cliente,
    tipo: p.tipo,
    observacoes: p.observacoes,
    atributos: p.atributos || {},
    setor: setorNome,
    concluida: !!p.conclusao,
  });

  const grupos = [];
  for (const s of setores) {
    if (setorIds && setorIds.length && !setorIds.map(Number).includes(Number(s.id))) continue;
    const modelo = resolverModelo(s.id, modelos);
    if (!modelo) continue;
    grupos.push({
      setor: { id: Number(s.id), nome: s.nome, cor: s.cor, ordem: s.ordem },
      modelo,
      etiquetas: pecas.map((p) => etiquetaDe(p, s.nome)),
    });
  }
  if (!grupos.length) avisos.push('Nenhum setor com modelo de etiqueta (verifique os modelos na aba Etiquetas).');

  return { grupos, pedidos: lista, avisos };
}

/** Registra a impressão e informa se é reimpressão (mesmas peças já impressas). */
export async function registrarImpressao(pedidos, pecas, { setorIds = null, userId, userNome } = {}) {
  const lista = [...new Set((pedidos || []).map((p) => String(p).trim()).filter(Boolean))];
  const ids = (pecas || []).map((p) => Number(p.peca_id ?? p.id ?? p)).filter(Boolean);
  const { rows: ant } = await q(
    `SELECT COUNT(*)::int AS c FROM pcp_etiqueta_log l
     WHERE EXISTS (
       SELECT 1 FROM jsonb_array_elements(l.pecas) e
       WHERE (e->>'id')::bigint = ANY($1::bigint[])
     )`,
    [ids.length ? ids : [0]]
  );
  const reimpressao = ant[0].c > 0;
  await q(
    `INSERT INTO pcp_etiqueta_log (pedido, pedidos, setor_id, pecas, tipo, por, por_nome)
     VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6, $7)`,
    [
      lista.length === 1 ? lista[0] : null,
      JSON.stringify(lista),
      setorIds && setorIds.length === 1 ? Number(setorIds[0]) : null,
      JSON.stringify((pecas || []).map((p) => ({ id: Number(p.peca_id ?? p.id ?? p), codigo: p.codigo || null }))),
      reimpressao ? 'reimpressao' : 'impressao',
      userId || null,
      userNome || null,
    ]
  );
  return { reimpressao };
}
