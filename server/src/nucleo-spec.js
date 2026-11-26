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
 *     Desde 25/11/2026 vai COMO A VENDA COTOU (o corpo da TELA do Comercial,
 *     v2.139.1): PRODUTO pelo cadastro do tipo de peça que o Comercial manda
 *     em `nucleoCotacao` (seleção automática = sem `produto_sku`; somente
 *     tecido = `so_tecido`; sentinela/sku = `produto_sku`) e TECIDO pela
 *     coleção — os códigos EFETIVOS gravados na venda (`produto_sku`,
 *     `tecido_sku`) ficam de RESERVA (ver `corposDaPeca`).
 *   · corposDaPeca(item, peca)  — `{ corpo, reserva, venda }`: o corpo como a
 *     venda, a RESERVA (o corpo de até 25/11, com os códigos gravados; null
 *     quando é igual ao corpo) e o que a venda registrou — é com isto que
 *     `lista-materiais.js` confere a resposta do Núcleo e decide a reserva.
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
  // 25/11/2026 — COMO A PEÇA É COTADA no Motor (Comercial v2.140.1, chave
  // `nucleoCotacao` de cada item do `GET /pedidos/:id`). Só entra quando o
  // Comercial MANDA a chave: a ausência (Comercial anterior) é diferente de
  // `produto: null` (o tipo de peça não aponta produto do motor).
  const cot = cotacaoDoItemComercial(it);
  if (cot) spec.cotacao = cot;
  return spec;
}

/**
 * `it.nucleoCotacao` do Comercial → `{ produto, tubo_equiparado }` (ou null
 * quando o Comercial ainda não manda a chave).
 *   · produto — o que o cadastro "Tipos de peça" aponta para o tipo da peça:
 *     '__auto' (rolô: o motor escolhe estrutura e tubo pela coleção + medidas),
 *     '__so_tecido' (troca de tela), sentinela ('__ph50', '__painel') ou sku
 *     direto; null = o tipo não aponta produto do motor (vale o sku gravado).
 *   · tubo_equiparado — tubo (mm) que a peça levou por EQUIPARAR o tubo do
 *     ambiente (regra do Comercial; aqui chega resolvido). null = não equipara.
 */
export function cotacaoDoItemComercial(it) {
  const c = it && it.nucleoCotacao;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const produto = typeof c.produto === 'string' && c.produto.trim() ? c.produto.trim().slice(0, 64) : null;
  const te = c.tuboEquiparado != null ? Number(c.tuboEquiparado) : NaN;
  return { produto, tubo_equiparado: Number.isFinite(te) && te > 0 ? te : null };
}

/**
 * AMBIENTE da peça do Comercial (26/11/2026) — a MESMA regra do Comercial
 * (`nomeDoAmbiente`, v2.87.0): nos pedidos montados com ambientes o nome vem de
 * `pedido.ambientes[]` pelo `ambienteId` do item; a coluna de texto `ambiente`
 * do item é LEGADA (nula nesses pedidos) e só vale quando o item não aponta um
 * ambiente que exista. Sem nome → null.
 *
 * Por que importa: a liberação gravava `it.ambiente` cru — vazio em todo pedido
 * montado com ambientes. A Ficha e a etiqueta saíam sem o ambiente e, na lista
 * de materiais, o Núcleo tratava o pedido inteiro como UM ambiente: o plano de
 * corte do tecido (Núcleo v14.98 — uma largura de rolo por ambiente) forçava o
 * tecido do pedido todo para a mesma largura.
 *
 * @param it         item do `GET /pedidos/:id` do Comercial
 * @param ambientes  `pedido.ambientes` do mesmo detalhe ([{ id, nome }])
 */
export function ambienteDoItemComercial(it, ambientes) {
  if (!it || typeof it !== 'object') return null;
  const id = it.ambienteId != null ? String(it.ambienteId) : '';
  if (id && Array.isArray(ambientes)) {
    const a = ambientes.find((x) => x && String(x.id) === id);
    const nome = a && typeof a.nome === 'string' ? a.nome.trim() : '';
    if (nome) return nome;
  }
  const texto = typeof it.ambiente === 'string' ? it.ambiente.trim() : '';
  return texto || null;
}

/** cm → m (2 casas de cm = 4 de m), null quando inválido */
const cmParaM = (cm) => {
  const n = Number(cm);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 10000 : null;
};

const BANDO_COM_ABAS = ['reto', 'madeira'];

/**
 * COMO A VENDA COTOU a peça — o que decide o corpo (25/11/2026).
 *
 * O corpo de até aqui fixava os códigos EFETIVOS gravados na venda, e o Núcleo
 * trata sku fixado de outro jeito (medido no Comercial v2.139.1 em 55.764
 * peças: 6,3% diferiam da tela). Na lista de materiais isso dava:
 *   · peça manual da linha "tubo 53" da tabela de limites listada com o perfil
 *     do tubo 47 (produto fixado não recebe o tubo da linha);
 *   · troca de tela ("Somente tecido") listada como a peça INTEIRA;
 *   · peça larga em coleção com rolos de duas larguras fora da lista (422
 *     `peca_excede_rolo`: o tecido gravado é o rolo estreito).
 * Agora o PRODUTO segue `spec.cotacao.produto` (o cadastro do tipo de peça, que
 * o Comercial manda no pedido) e o TECIDO vai pela coleção — como a tela.
 * Volta a valer o sku FIXO quando:
 *   · a peça não traz `cotacao` (liberada antes da v2.140.1 do Comercial) ou o
 *     tipo dela não aponta produto do motor;
 *   · o PCP TROCOU o "SKU do Núcleo" do item (modal Ver) — escolha explícita;
 *   · `fixarSkus` — a RESERVA pedida por `lista-materiais.js`.
 * `so_tecido` acompanha a peça em QUALQUER modo: troca de tela nunca é listada
 * como peça inteira, nem na reserva.
 */
function modoDaVenda(item, spec, fixarSkus) {
  const skuVendido = str(spec.produto_sku);
  const skuDoItem = str(item.produto_sku);
  const cot = spec.cotacao && typeof spec.cotacao === 'object' ? spec.cotacao : null;
  const produto = cot && typeof cot.produto === 'string' && cot.produto.trim() ? cot.produto.trim() : null;
  const skuTrocadoNoPcp = !!(skuDoItem && skuVendido && skuDoItem !== skuVendido);
  return {
    produto,                                   // '__auto' | '__so_tecido' | sentinela | sku | null
    so_tecido: produto === '__so_tecido',
    como_a_venda: !fixarSkus && !!produto && !skuTrocadoNoPcp,
    sku_trocado_no_pcp: skuTrocadoNoPcp,
    // o corpo de até 25/11: coluna do item › sku da Estrutura do PCP › sku da venda
    sku_fixo: skuDoItem || str(item.estrutura_sku) || skuVendido,
    sku_vendido: skuVendido,
    tubo_equiparado: cot && num(cot.tubo_equiparado) > 0 ? num(cot.tubo_equiparado) : null,
    tem_cotacao: !!cot,
  };
}

/**
 * Corpo do /lista-materiais (= /precificar) de UMA peça do PCP.
 * @param item  linha de pcp_itens (produto_sku, estrutura_sku?, colecao, cor_tecido, acionamento, atributos, spec_nucleo, qnt…)
 * @param peca  linha de pcp_pecas (id, largura, altura em cm)
 * @param opts  { ref?, ambiente?, janela?, qtd?, fixarSkus? } — `fixarSkus: true` = a RESERVA
 *              (o corpo de até 25/11/2026, com os códigos gravados na venda)
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

  // PRODUTO — como a venda cotou (ver `modoDaVenda`)
  const venda = modoDaVenda(item, spec, opts.fixarSkus === true);
  if (venda.como_a_venda) {
    // '__auto' → nada: o motor escolhe estrutura e tubo pela coleção + medidas;
    // '__so_tecido' → idem (o `so_tecido` vai logo abaixo); sentinela/sku → vai
    if (venda.produto !== '__auto' && venda.produto !== '__so_tecido') corpo.produto_sku = venda.produto;
  } else if (venda.sku_fixo) corpo.produto_sku = venda.sku_fixo;
  else if (item.produto || spec.tipo) corpo.tipo = str(item.produto) || spec.tipo;
  if (venda.so_tecido) corpo.so_tecido = true;
  // TECIDO — pela COLEÇÃO (+ cor), como a tela: é o Núcleo que escolhe a
  // largura do rolo para a medida. O tecido gravado só vai quando a peça não
  // tem coleção escrita — e na RESERVA.
  const colecao = str(item.colecao) || str(spec.colecao);
  const tecidoSku = str(spec.tecido_sku);
  if (tecidoSku && (opts.fixarSkus === true || !colecao)) corpo.tecido_sku = tecidoSku;
  else if (colecao) corpo.colecao = colecao;
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
  // TUBO EQUIPARADO do ambiente (Comercial v2.111.0): é ele que escolhe a
  // estrutura na seleção automática (≤32 Soft · ≤40 Premium · >40 Premium 47).
  // Só no corpo como a venda — com o sku fixo a estrutura equiparada já é a
  // gravada (e a reserva tem de ser o corpo de até 25/11, sem tirar nem pôr).
  if (venda.como_a_venda && venda.tubo_equiparado) corpo.tubo_equiparado = venda.tubo_equiparado;
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

/**
 * O corpo como a venda + a RESERVA + o que a venda registrou.
 *   · corpo   — `corpoDaPeca(item, peca, opts)`;
 *   · reserva — o corpo com os códigos gravados (`fixarSkus`), ou null quando
 *     ele é IGUAL ao corpo (nada a tentar de novo);
 *   · venda   — `{ como_a_venda, modo, so_tecido, produto_sku, tecido_sku,
 *     sku_trocado_no_pcp, tem_cotacao }`: `produto_sku` é a estrutura EFETIVA
 *     que o Núcleo escolheu na venda — a lista confere a resposta contra ela.
 */
export function corposDaPeca(item, peca, opts = {}) {
  const spec = item && item.spec_nucleo && typeof item.spec_nucleo === 'object' ? item.spec_nucleo : {};
  const corpo = corpoDaPeca(item, peca, { ...opts, fixarSkus: false });
  const fixo = corpoDaPeca(item, peca, { ...opts, fixarSkus: true });
  const m = modoDaVenda(item || {}, spec, false);
  return {
    corpo,
    reserva: JSON.stringify(fixo) === JSON.stringify(corpo) ? null : fixo,
    venda: {
      como_a_venda: m.como_a_venda,
      modo: m.produto,
      so_tecido: m.so_tecido,
      produto_sku: m.sku_vendido,
      tecido_sku: str(spec.tecido_sku),
      sku_trocado_no_pcp: m.sku_trocado_no_pcp,
      tem_cotacao: m.tem_cotacao,
    },
  };
}

// ─── CONFERÊNCIA da resposta do Núcleo × a venda (25/11/2026) ────────────────
// O corpo "como a venda" reproduz a cotação da TELA com o cadastro de HOJE (tipo
// de peça do Comercial, tabela de limites e coleções do Núcleo). Se um deles
// mudou depois da venda, a lista sairia de uma peça que não foi a vendida — ou
// a peça nem calcularia. A estrutura EFETIVA gravada na venda é a prova: quando
// o corpo como a venda não calcula, ou calcula OUTRA estrutura, a peça volta
// pela RESERVA (o corpo de até 25/11, com os códigos gravados). Consequência,
// por construção: peça que calculava com o corpo antigo continua calculando.

/**
 * Peças do bloco que devem ser pedidas de novo pela RESERVA.
 * @param planos    [{ ref, reserva, venda }] — um por peça enviada (`corposDaPeca`)
 * @param pecasResp `data.pecas` da resposta do Núcleo ao corpo como a venda
 * @returns Map ref → { motivo: 'nao_calculou' | 'estrutura_diferente', erro, mensagem, estrutura, estrutura_nome }
 */
export function pecasParaReserva(planos, pecasResp) {
  const porRef = new Map((Array.isArray(pecasResp) ? pecasResp : []).map((p) => [String(p && p.ref), p]));
  const marcadas = new Map();
  for (const pl of (planos || [])) {
    if (!pl || !pl.reserva) continue; // sem reserva (corpo já é o dos códigos gravados): nada a tentar
    const ref = String(pl.ref);
    const pc = porRef.get(ref);
    if (!pc) continue;
    if (pc.ok === false) {
      marcadas.set(ref, { motivo: 'nao_calculou', erro: pc.error || null, mensagem: pc.motivo || pc.error || null, estrutura: null, estrutura_nome: null });
      continue;
    }
    const venda = pl.venda || {};
    const vendido = str(venda.produto_sku);
    const hoje = str(pc.produto_sku);
    if (venda.como_a_venda && vendido && hoje && vendido !== hoje) {
      marcadas.set(ref, { motivo: 'estrutura_diferente', erro: null, mensagem: null, estrutura: hoje, estrutura_nome: str(pc.produto_nome) || hoje });
    }
  }
  return marcadas;
}

/**
 * Decide, peça a peça, entre a 1ª resposta (como a venda) e a 2ª (reserva).
 * A reserva só vale se CALCULOU; senão fica a 1ª resposta.
 * @returns Map ref → { usar: 'reserva' | 'venda', motivo, nota }
 */
export function decidirReserva(marcadas, planos, pecasReserva) {
  const porRef = new Map((Array.isArray(pecasReserva) ? pecasReserva : []).map((p) => [String(p && p.ref), p]));
  const planoDe = new Map((planos || []).map((pl) => [String(pl.ref), pl]));
  const out = new Map();
  for (const [ref, m] of (marcadas || new Map())) {
    const r2 = porRef.get(ref);
    const venda = (planoDe.get(ref) || {}).venda || {};
    const vendido = str(venda.produto_sku);
    const calculou = !!(r2 && r2.ok !== false);
    if (m.motivo === 'nao_calculou') {
      out.set(ref, calculou
        ? { usar: 'reserva', motivo: m.motivo, nota: `não calculou pela coleção/tipo da venda (${m.mensagem || m.erro || 'sem resposta'}) — lista pelos códigos gravados na venda${vendido ? ` («${vendido}»)` : ''}` }
        : { usar: 'venda', motivo: m.motivo, nota: null }); // segue "não calculou", com o motivo do corpo como a venda
    } else {
      out.set(ref, calculou
        ? { usar: 'reserva', motivo: m.motivo, nota: `hoje o Motor escolheria «${m.estrutura_nome || m.estrutura}» para esta medida; a venda saiu em «${vendido}» — lista pela estrutura VENDIDA` }
        : { usar: 'venda', motivo: m.motivo, nota: `a venda saiu em «${vendido}», que hoje não calcula (${(r2 && (r2.motivo || r2.error)) || 'sem resposta'}) — lista pela estrutura que o Motor escolhe hoje («${m.estrutura_nome || m.estrutura}»); confira com o Comercial` });
    }
  }
  return out;
}

/**
 * UM bloco de peças no Núcleo, com a conferência contra a venda. Puro: quem
 * chama injeta `buscar(corpos) → data | null` (o POST /lista-materiais).
 *   1ª chamada — os corpos como a venda;
 *   peça que não calculou, ou calculou OUTRA estrutura que a vendida, e tem
 *   reserva → 2ª chamada do bloco com essas peças pela RESERVA; a reserva só
 *   vale para a peça em que CALCULOU. Resultado misto (umas pela reserva,
 *   outras não) → 3ª chamada com a escolha final, para os agregados do bloco
 *   (tecido, perfis, tubos) saírem de UMA resposta só.
 * No caso normal (nada a conferir) é a única chamada de sempre.
 * @param pecas  [{ corpo, reserva, venda }] — `corposDaPeca` de cada peça
 * @returns { data, decisoes: Map ref → { usar, motivo, nota }, chamadas } — `data` null = o Núcleo não respondeu
 */
export async function calcularComReserva(pecas, buscar) {
  const lista = Array.isArray(pecas) ? pecas : [];
  const planos = lista.map((p) => ({ ref: p.corpo.ref, reserva: p.reserva || null, venda: p.venda || null }));
  const r1 = await buscar(lista.map((p) => p.corpo));
  if (!r1) return { data: null, decisoes: new Map(), chamadas: 1 };
  const marcadas = pecasParaReserva(planos, r1.pecas);
  if (!marcadas.size) return { data: r1, decisoes: new Map(), chamadas: 1 };
  const montar = (refs) => lista.map((p) => (refs.has(String(p.corpo.ref)) ? p.reserva : p.corpo));
  const r2 = await buscar(montar(new Set(marcadas.keys())));
  if (!r2) return { data: r1, decisoes: new Map(), chamadas: 2 }; // a 2ª falhou (rede): vale a 1ª, como sempre foi
  const decisoes = decidirReserva(marcadas, planos, r2.pecas);
  const pelaReserva = new Set([...decisoes].filter(([, d]) => d.usar === 'reserva').map(([ref]) => ref));
  if (pelaReserva.size === marcadas.size) return { data: r2, decisoes, chamadas: 2 };
  if (pelaReserva.size === 0) return { data: r1, decisoes, chamadas: 2 };
  const r3 = await buscar(montar(pelaReserva));
  if (r3) return { data: r3, decisoes, chamadas: 3 };
  // a 3ª falhou (rede): fica a resposta em que mais peças calcularam
  const ok = (r) => (r.pecas || []).filter((x) => x.ok !== false).length;
  return { data: ok(r2) >= ok(r1) ? r2 : r1, decisoes, chamadas: 3 };
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
