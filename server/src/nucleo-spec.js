/**
 * ESPECIFICAÇÃO DA PEÇA COMO FOI VENDIDA — P0 do planejamento de produção
 * (espec docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.2 a/c; decisão do cliente
 * 05/11/2026: "pode ser só pelo núcleo mesmo, o que editar ali reflete no PCP").
 *
 * Módulo PURO (sem banco, sem rede):
 *   · specDoItemComercial(it)   — o que o Comercial manda no item do pedido e
 *     o Núcleo precisa para recalcular a peça (produto/tecido/cor + todas as
 *     seleções `nucleo*`). Vai para `pcp_itens.spec_nucleo` na liberação.
 *   · corpoDaPeca(item, peca)   — o corpo do /lista-materiais (= o do
 *     /precificar) para UMA peça do PCP, montado da spec + colunas do item +
 *     medidas da peça. É o ESPELHO de `montarCorpoPrecificar` do Comercial
 *     (agenda-consultores/backend/src/produtos/produtos-client.service.ts):
 *     a mesma leitura do acabamento (box/bandô/guias/abas/revestimento),
 *     motorização pelo acionamento, cortina/ph50/celular/painel/afastamento.
 *   · linhaDoSku(sku)           — linha de construção do SKU do Núcleo
 *     (rolo/romana/painel/ph25/ph50/cortina/fixa/celular/vertical/toldo).
 *   · LINHAS_SEM_ESTRUTURA_LOCAL — linhas cujas peças NÃO têm (nem precisam
 *     de) Estrutura do Produto do PCP: cortes vêm do Núcleo e o roteiro por
 *     setor vem do cadastro por LINHA (pcp_config `roteiro_linhas`). Peça
 *     dessas linhas não fica "estrutura pendente".
 */

const CHAVES_NUCLEO = [
  'nucleoProdutoNome', 'nucleoMotorSku', 'nucleoEmissorSku', 'nucleoTuboManual',
  'nucleoPh25Rota', 'nucleoVerticalRota', 'nucleoCortina', 'nucleoPh50', 'nucleoCelular',
  'nucleoAfastamento', 'nucleoBandoReto', 'nucleoPainel', 'nucleoTrilhoPlus',
  'nucleoEquiparaTubo', 'nucleoTuboAuto', 'nucleoAvulsoSku',
];

const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const str = (v) => (v == null ? null : String(v).trim() || null);

/** Spec da peça vendida (só o que o Núcleo lê; nada de preço). */
export function specDoItemComercial(it) {
  if (!it || typeof it !== 'object') return null;
  const spec = {
    v: 1, // versão do shape
    comercial_item_id: it.id != null ? String(it.id) : null,
    tipo: str(it.tipo),
    produto_sku: str(it.produtoSku),
    tecido_sku: str(it.tecidoSku),
    colecao: str(it.colecao),
    cor: str(it.corTecido),
    cor_perfil: str(it.corPerfil),
    acionamento: str(it.acionamento),
    acabamento: str(it.acabamento),
    largura_cm: num(it.larguraCm),
    altura_cm: num(it.alturaCm),
    area_m2: num(it.areaM2),
    quantidade: num(it.quantidade),
    preco_custo: it.precoCusto === true,
    // v2.111.0 — tubo equiparado é resolvido pelo SAVE do Comercial e gravado
    // em nucleoTuboAuto/nucleoEquiparaTubo; o Núcleo precisa do tubo efetivo
    // (nucleoProdutoNome traz "(tubo NN)")
  };
  for (const k of CHAVES_NUCLEO) {
    if (it[k] !== undefined && it[k] !== null) spec[k] = it[k];
  }
  return spec;
}

/** cm → m (2 casas de cm = 4 de m), null quando inválido */
const cmParaM = (cm) => {
  const n = Number(cm);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 10000 : null;
};

const BANDO_COM_ABAS = ['reto', 'madeira'];

/**
 * Corpo do /lista-materiais (= /precificar) de UMA peça do PCP.
 * @param item  linha de pcp_itens (produto_sku, colecao, cor_tecido, acionamento, atributos, spec_nucleo, qnt…)
 * @param peca  linha de pcp_pecas (id, largura, altura em cm)
 * @param opts  { ref?, ambiente?, janela?, qtd? }
 */
export function corpoDaPeca(item, peca, opts = {}) {
  const spec = item && item.spec_nucleo && typeof item.spec_nucleo === 'object' ? item.spec_nucleo : {};
  const atributos = item && item.atributos && typeof item.atributos === 'object' ? item.atributos : {};
  const corpo = {
    ref: opts.ref != null ? String(opts.ref) : (peca && peca.id != null ? String(peca.id) : undefined),
    ambiente: opts.ambiente !== undefined ? opts.ambiente : (item.ambiente || undefined),
    janela: opts.janela !== undefined ? opts.janela : (atributos.janela || undefined),
    qtd: opts.qtd != null ? Number(opts.qtd) : 1,
  };
  // medidas: a PEÇA (cm) vence; sem peça com medida, a spec; sem nada, área direta
  const L = cmParaM(peca && peca.largura) ?? cmParaM(spec.largura_cm);
  const H = cmParaM(peca && peca.altura) ?? cmParaM(spec.altura_cm);
  if (L && H) { corpo.largura = L; corpo.altura = H; }
  else if (num(spec.area_m2) > 0) corpo.area_m2 = num(spec.area_m2);
  else { corpo.largura = L || 0; corpo.altura = H || 0; }

  const sku = str(item.produto_sku) || str(spec.produto_sku);
  if (sku) corpo.produto_sku = sku;
  else if (item.produto || spec.tipo) corpo.tipo = str(item.produto) || spec.tipo;
  const tecidoSku = str(spec.tecido_sku);
  if (tecidoSku) corpo.tecido_sku = tecidoSku;
  else if (item.colecao || spec.colecao) corpo.colecao = str(item.colecao) || spec.colecao;
  const cor = str(item.cor_tecido) || str(spec.cor);
  if (cor) corpo.cor = cor;

  const acionamento = str(item.acionamento) || str(spec.acionamento) || '';
  if (/motor/i.test(acionamento)) {
    corpo.modo = 'motor';
    if (spec.nucleoMotorSku) corpo.motor_sku = String(spec.nucleoMotorSku);
    else corpo.motor_automatico = true;
    if (spec.nucleoEmissorSku === '__sem') corpo.incluir_acionamento = false;
    else if (spec.nucleoEmissorSku) { corpo.acionamento_sku = String(spec.nucleoEmissorSku); corpo.incluir_acionamento = true; }
    else corpo.incluir_acionamento = true;
  }
  if (num(spec.nucleoTuboManual) > 0) corpo.tubo_manual = num(spec.nucleoTuboManual);
  if (spec.nucleoTrilhoPlus === true || spec.nucleoTrilhoPlus === false) corpo.trilho_plus = spec.nucleoTrilhoPlus;
  if (spec.nucleoPh25Rota === 'propria' || spec.nucleoPh25Rota === 'terceirizado') corpo.ph25_rota = spec.nucleoPh25Rota;
  if (spec.nucleoVerticalRota === 'propria' || spec.nucleoVerticalRota === 'terceirizado') corpo.vertical_rota = spec.nucleoVerticalRota;

  const sel = spec.nucleoCortina;
  if (sel && typeof sel === 'object') {
    const cort = {};
    if (sel.peca) cort.peca = sel.peca;
    if (sel.estilo) cort.estilo = sel.estilo;
    if (sel.mecanismo) cort.mecanismo = sel.mecanismo;
    if (sel.emissor) cort.emissor = sel.emissor;
    if (sel.curvo === true) cort.curvo = true;
    if (sel.abertura) cort.abertura = String(sel.abertura);
    if (num(sel.alturaComando) > 0) cort.altura_comando = num(sel.alturaComando);
    if (sel.curvas != null && Number.isInteger(Number(sel.curvas)) && Number(sel.curvas) > 0) cort.curvas = Number(sel.curvas);
    if (typeof sel.cor === 'string' && sel.cor.trim()) cort.cor = sel.cor.trim();
    if (Object.keys(cort).length) corpo.cortina = cort;
    if (num(sel.volume) > 0) corpo.volume = num(sel.volume);
    if (sel.barra != null && Number.isFinite(Number(sel.barra)) && Number(sel.barra) >= 0) corpo.barra = Number(sel.barra);
  }
  const ph = spec.nucleoPh50;
  if (ph && typeof ph === 'object') {
    const o = {};
    if (ph.comando) o.comando = ph.comando;
    if (ph.monocomando != null) o.monocomando = !!ph.monocomando;
    if (Object.keys(o).length) corpo.ph50 = o;
  }
  const cel = spec.nucleoCelular;
  if (cel && typeof cel === 'object') {
    const o = {};
    if (cel.motorizacao) o.motorizacao = cel.motorizacao;
    if (cel.controle) o.controle = cel.controle;
    if (cel.angulo === true) o.angulo = true;
    if (cel.fonteBateria === true) o.fonte_bateria = true;
    if (Object.keys(o).length) corpo.celular = o;
  }
  const pn = spec.nucleoPainel;
  if (pn && typeof pn === 'object') {
    const o = {};
    if (Number(pn.vias) >= 2) o.vias = Number(pn.vias);
    if (pn.varetas === true) o.varetas = true;
    if (pn.comando === false) o.comando = false;
    if (Object.keys(o).length) corpo.painel = o;
  }

  // ACABAMENTO: a MESMA leitura do Comercial (box exclusivo; bandô por cor no nome)
  const acab = String(atributos.acabamento || spec.acabamento || '').toLowerCase();
  if (/box/.test(acab)) {
    corpo.box = true;
    if (/somente\s*box|sem\s*guia|s[óo]\s*box/.test(acab)) corpo.box_guias = false;
    if (/somente\s*guias?\s*laterais|s[óo]\s*guias?\s*laterais/.test(acab)) corpo.box_guia_inferior = false;
    if (/8\s*cm|guias?\s*de\s*8/.test(acab)) corpo.box_guia_8 = true;
    const af = spec.nucleoAfastamento;
    if (af && typeof af === 'object' && af.sku) {
      const LEGADO = { esq: ['esq'], dir: ['dir'], inf: ['inf'], lats: ['esq', 'dir'], lats_inf: ['esq', 'dir', 'inf'] };
      const brutos = Array.isArray(af.lados) ? af.lados : (LEGADO[String(af.lados ?? '')] ?? []);
      const temGuias = corpo.box_guias !== false;
      const temGuiaInf = temGuias && corpo.box_guia_inferior !== false;
      const lados = brutos.filter((l) => l === 'sup' || ((l === 'esq' || l === 'dir') && temGuias) || (l === 'inf' && temGuiaInf));
      if (lados.length) corpo.afastamento = { sku: String(af.sku), lados };
    }
  } else if (/band/.test(acab) && !/sem\s*band/.test(acab)) {
    corpo.bando = /madeira/.test(acab) ? 'madeira' : /branco/.test(acab) ? 'branco' : /preto/.test(acab) ? 'preto' : /reto/.test(acab) ? 'reto' : 'vision';
    const br = spec.nucleoBandoReto;
    if (BANDO_COM_ABAS.includes(corpo.bando) && br && typeof br === 'object') {
      const cmM = (v) => (v == null || v === '' ? undefined : (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) / 100 : undefined));
      const esq = cmM(br.abaEsqCm);
      const dir = cmM(br.abaDirCm);
      if (esq !== undefined || dir !== undefined) corpo.bando_abas = { ...(esq !== undefined ? { aba_esq: esq } : {}), ...(dir !== undefined ? { aba_dir: dir } : {}) };
    }
    const rev = br && typeof br === 'object' ? br.revestimento : null;
    if (corpo.bando === 'reto' && rev && typeof rev === 'object') {
      if (rev.sem === true) corpo.bando_revestimento = { sem: true };
      else if (rev.colecao != null && String(rev.colecao).trim()) {
        corpo.bando_revestimento = { colecao: String(rev.colecao).trim(), ...(rev.cor != null && String(rev.cor).trim() ? { cor: String(rev.cor).trim() } : {}) };
      }
    }
  }
  return corpo;
}

/** Linha de construção pelo SKU do Núcleo (null = desconhecido). */
export function linhaDoSku(sku) {
  const s = String(sku || '').toLowerCase();
  if (!s) return null;
  if (/^fixa_/.test(s)) return 'fixa';
  if (/^cortina/.test(s)) return 'cortina';
  if (/^celular/.test(s)) return 'celular';
  if (/^vertical/.test(s)) return 'vertical';
  if (/^toldo/.test(s)) return 'toldo';
  if (/^painel/.test(s)) return 'painel';
  if (/^romana/.test(s)) return 'romana';
  if (/^ph25/.test(s)) return 'ph25';
  if (/^ph50/.test(s)) return 'ph50';
  if (/^(soft|premium|plussize|visionsheer|soft_|premium_)/.test(s)) return 'rolo';
  return null;
}

/** Linhas que não têm Estrutura do Produto no PCP (cortes/materiais pelo Núcleo). */
export const LINHAS_SEM_ESTRUTURA_LOCAL = ['cortina', 'fixa', 'celular', 'vertical', 'toldo'];

export function semEstruturaLocal(sku) {
  const l = linhaDoSku(sku);
  return !!l && LINHAS_SEM_ESTRUTURA_LOCAL.includes(l);
}

/** Roteiro padrão por LINHA (nomes de setor; a bipagem resolve pelos ids). */
export const ROTEIRO_LINHAS_PADRAO = {
  cortina: ['Corte', 'Montagem', 'Embalagem'],
  fixa: ['Corte', 'Montagem', 'Embalagem'],
  celular: ['Embalagem'],
  vertical: ['Montagem', 'Embalagem'],
  toldo: ['Embalagem'],
};
