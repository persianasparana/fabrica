/**
 * PRODUÇÃO POR ETAPAS do pedido (27/11/2026) — os documentos SEPARADOS de corte do tecido, corte dos
 * perfis e montagem, o quadro das PARTES e a lista de compra.
 *
 * Pedido do cliente (27/11), com o pedido 2026/1348 (350 peças, instalado em 8 partes): *"Preciso que
 * na produção eu consiga imprimir um planejamento de corte de tecido separado do planejamento de corte
 * do perfil e no final a montagem. (...) quando for cortar os tecidos, preciso concentrar a produção
 * por largura de tecido para que na produção não precise ficar puxando tecido diferente o tempo
 * inteiro, também preciso de alguma forma avisar a expedição quando as partes desse pedido grande
 * estiverem concluídas (...) tudo tem que estar sincronizado e planejado corretamente, além do mais vou
 * precisar ver a solicitação de compra"*. Decisões dele: o corte dos perfis sai do PEDIDO INTEIRO, por
 * perfil (como o tecido, que já sai por largura de rolo); a montagem, por PARTE.
 *
 * Módulo PURO (sem banco, sem rede — testes em `test/producao.test.mjs`). Junta três coisas que já
 * existem, com a MESMA identificação da peça nos três documentos (etiqueta, item · peça, parte, cômodo):
 *   · a fila do PCP — itens e peças do pedido (a etiqueta, a parte = `grupo_pedido`, o cômodo = `ambiente`);
 *   · o plano de corte por peça do Núcleo (`ordem-corte-nucleo.js`: as medidas de corte, em cm);
 *   · a lista de materiais do pedido (`lista-materiais.js`: o plano do tecido rolo a rolo, o comprimento
 *     da barra de cada perfil e os materiais de cada peça).
 * Nada aqui recalcula regra de produto: quem diz a medida é o Núcleo.
 */

const r1 = (v) => Math.round(Number(v) * 10) / 10;
const r2 = (v) => Math.round(Number(v) * 100) / 100;
const txt = (v) => String(v == null ? '' : v).trim();

export const SEM_PARTE = '(sem ambiente)';

/** "PARTE 2" antes de "PARTE 10"; sem acento/caixa; o vazio e o "(sem ambiente)" por último. */
export function ordenarNomes(nomes) {
  const col = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  const semNome = (v) => !v || v === SEM_PARTE;
  return [...nomes].sort((a, b) => {
    const va = txt(a); const vb = txt(b);
    if (semNome(va) || semNome(vb)) return (semNome(va) ? 1 : 0) - (semNome(vb) ? 1 : 0);
    return col.compare(va, vb);
  });
}

/** A PARTE do item: o grupo do pedido em que a peça foi lançada; sem grupo, o próprio ambiente. */
export function parteDoItem(item) {
  return txt(item && item.grupo_pedido) || txt(item && item.ambiente) || SEM_PARTE;
}

/** O CÔMODO do item: o Ambiente escrito na peça — só quando ele não é o próprio nome da parte. */
export function comodoDoItem(item) {
  const amb = txt(item && item.ambiente);
  if (!amb) return null;
  return amb.toLowerCase() === parteDoItem(item).toLowerCase() ? null : amb;
}

const ehTecido = (comp) => /tecido/i.test(String(comp || ''));
const chaveComp = (comp) => txt(comp).toLowerCase().replace(/\s+/g, ' ');
/** "Perfil lateral (×2)" → { nome: 'Perfil lateral', vezes: 2 } — o mesmo rótulo que o Núcleo lê. */
export function nomeEVezes(comp) {
  const desc = txt(comp);
  const m = desc.match(/\(\s*[×x]\s*(\d+)\s*\)/);
  return m ? { nome: desc.replace(/\(\s*[×x]\s*\d+\s*\)/, '').trim(), vezes: Math.max(1, Number(m[1]) || 1) } : { nome: desc, vezes: 1 };
}

/**
 * Os cortes de UM perfil nas barras — First-Fit do maior para o menor, a MESMA conta do Núcleo
 * (`motor.empacotarBarras`: é ela que diz quantas barras comprar), agora guardando o que sai de cada
 * barra. Corte maior que a barra ocupa barras inteiras (`emenda`) e o resto entra na primeira que couber.
 * @param cortes [{ cm, ...o que identificar a peça }]   @param barraCm comprimento da barra, em cm
 * @returns { barras: [{ n, cortes: [...], usado_cm, sobra_cm }], n_barras, sobra_cm, metros_cm }
 */
export function encaixarBarras(cortes, barraCm) {
  const a = Number(barraCm) > 0 ? Number(barraCm) : 600;
  const lista = (cortes || []).filter((c) => Number(c && c.cm) > 0);
  const barras = []; // { sobra, cortes: [] }
  const nova = () => { const b = { sobra: a, cortes: [] }; barras.push(b); return b; };
  const porTamanho = lista.filter((c) => Number(c.cm) <= a).sort((x, y) => Number(y.cm) - Number(x.cm));
  for (const c of porTamanho) {
    const l = Number(c.cm);
    const b = barras.find((x) => x.sobra >= l) || nova();
    b.sobra -= l; b.cortes.push(c);
  }
  for (const c of lista.filter((x) => Number(x.cm) > a)) {
    let resto = Number(c.cm); let parte = 1;
    while (resto > a) { const b = nova(); b.sobra = 0; b.cortes.push({ ...c, cm_na_barra: a, emenda: parte }); resto -= a; parte += 1; }
    const b = barras.find((x) => x.sobra >= resto) || nova();
    b.sobra -= resto; b.cortes.push({ ...c, cm_na_barra: r1(resto), emenda: parte });
  }
  const saida = barras.map((b, i) => ({ n: i + 1, cortes: b.cortes, usado_cm: r1(a - b.sobra), sobra_cm: r1(b.sobra) }));
  return {
    barras: saida,
    n_barras: saida.length,
    sobra_cm: r1(barras.reduce((s, b) => s + b.sobra, 0)),
    metros_cm: r1(lista.reduce((s, c) => s + Number(c.cm), 0)),
  };
}

/** Linha de corte do tecido no plano por peça (o Núcleo chama de "Tecido largura" / "Tecido altura"). */
const linhaTecido = (linhas, qual) => (linhas || []).find((l) => new RegExp(`^tecido\\s+${qual}$`, 'i').test(txt(l.comp)) && l.medida != null) || null;

/**
 * Junta tudo. Entradas:
 *   itens  — linhas de `pcp_itens` do pedido (id, produto, colecao, cor_tecido, cor_perfil, acionamento,
 *            ambiente, grupo_pedido, observacoes, atributos, qnt)
 *   pecas  — linhas de `pcp_pecas` (id, item_id, numero, cod_barras, largura, altura — em cm —,
 *            conclusao, gaveta_id) + `etapas` opcional [{ setor_id, inicio, fim }]
 *   plano  — a resposta de `calcularPlanoNucleo` (ou null: Núcleo fora)
 *   lista  — a resposta de `listaMateriaisDosPedidos` (ou null)
 *   setores — [{ id, nome, ordem }] ativos, na ordem do roteiro (para o quadro das partes)
 */
export function montarProducao({ pedido, itens = [], pecas = [], plano = null, lista = null, setores = [] } = {}) {
  const avisos = [];
  const itensOrd = [...itens].sort((a, b) => Number(a.id) - Number(b.id));
  const seqDoItem = new Map(itensOrd.map((it, i) => [Number(it.id), i + 1]));
  const itemPorId = new Map(itensOrd.map((it) => [Number(it.id), it]));

  const planoPorPeca = new Map();
  for (const amb of (plano && plano.ambientes) || []) for (const p of amb.pecas || []) planoPorPeca.set(Number(p.peca_id), p);
  const dados = (lista && lista.data) || null;
  const listaPorRef = new Map(((dados && dados.pecas) || []).map((p) => [String(p.ref), p]));

  // ── as peças, com a mesma identificação em todos os documentos
  const pecasOrd = [...pecas].sort((a, b) => Number(a.item_id) - Number(b.item_id) || Number(a.numero) - Number(b.numero) || Number(a.id) - Number(b.id));
  const registro = new Map();
  for (const pc of pecasOrd) {
    const item = itemPorId.get(Number(pc.item_id)) || {};
    const pl = planoPorPeca.get(Number(pc.id)) || null;
    const lp = listaPorRef.get(`${pc.item_id}:${pc.id}`) || null;
    const linhas = (pl && pl.plano && pl.plano.linhas) || [];
    const tl = linhaTecido(linhas, 'largura'); const ta = linhaTecido(linhas, 'altura');
    const atributos = (item.atributos && typeof item.atributos === 'object' && !Array.isArray(item.atributos)) ? item.atributos : {};
    registro.set(Number(pc.id), {
      id: Number(pc.id),
      item_id: Number(pc.item_id),
      item_seq: seqDoItem.get(Number(pc.item_id)) || null,
      numero: Number(pc.numero) || null,
      etiqueta: txt(pc.cod_barras) || null,
      parte: parteDoItem(item),
      comodo: comodoDoItem(item),
      produto: txt(item.produto) || null,
      produto_nome: (pl && pl.produto_nome) || (lp && lp.produto_nome) || null,
      variante: (pl && pl.variante) || (lp && lp.variante) || null,
      plano_nome: (pl && pl.plano && pl.plano.nome) || null,
      tubo: (pl && pl.tubo_efetivo) || (lp && lp.tubo) || null,
      modo: (pl && pl.modo) || (lp && lp.modo) || null,
      largura_cm: pc.largura != null ? r1(pc.largura) : null,
      altura_cm: pc.altura != null ? r1(pc.altura) : null,
      colecao: txt(item.colecao) || (lp && lp.colecao) || null,
      cor: txt(item.cor_tecido) || (lp && lp.cor) || null,
      cor_perfil: txt(item.cor_perfil) || null,
      acionamento: txt(item.acionamento) || null,
      acabamento: txt(atributos.acabamento) || null,
      observacoes: txt(item.observacoes) || null,
      // cortes de PERFIL (cm) e itens por fórmula; o tecido vai à parte
      cortes: linhas.filter((l) => !ehTecido(l.comp)).map((l) => (l.medida != null
        ? { comp: txt(l.comp), cm: r1(l.medida) }
        : { comp: txt(l.comp), formula: txt(l.formula) })),
      tecido: {
        corte_largura_cm: tl ? r1(tl.medida) : null,
        corte_altura_cm: ta ? r1(ta.medida) : null,
        altura_regra: ta && ta.regra ? String(ta.regra) : null,
        // preenchidos pelo plano do tecido, abaixo
        rolo_m: null, rolo_n: null, rolos_da_largura: null, faixa_n: null, reservado_cm: null, altura_plano_cm: null, deitada: false,
        fora_do_plano: false,
        // a peça sozinha (quando não entra no plano): rolo e metros da própria conta
        largura_rolo_m: lp && Number(lp.largura_rolo) > 0 ? Number(lp.largura_rolo) : null,
        metros: lp && Number(lp.tecido_m) > 0 ? r2(lp.tecido_m) : null,
      },
      materiais: ((lp && lp.materiais) || []).filter((m) => m && m.tipo !== 'tecido'),
      aviso: (pl && pl.aviso) || (lp && lp.ok === false ? (lp.motivo || lp.error || 'não calculou') : null) || null,
      embalada: !!pc.conclusao,
      guardada: pc.gaveta_id != null,
      etapas: Array.isArray(pc.etapas) ? pc.etapas : [],
    });
  }
  const todas = [...registro.values()];

  // ── CORTE DO TECIDO — pedido inteiro, por tecido → largura do rolo → rolo → faixa → peças
  let alturaPeloPlano = 0;
  const tecido = [];
  for (const pt of (dados && dados.plano_tecido) || []) {
    const resumoLargura = new Map((pt.larguras || []).map((l) => [Number(l.largura_rolo), l]));
    const larguras = [];
    for (const rolo of pt.rolos || []) {
      const larg = Number(rolo.largura_rolo);
      const res = resumoLargura.get(larg) || {};
      const temRolos = Array.isArray(rolo.bobinas) && rolo.bobinas.length > 0;
      const grupos = new Map(); // nº do rolo → faixas
      let seq = 0;
      for (const sh of rolo.shelves || []) {
        seq += 1;
        const nRolo = temRolos ? (Number(sh.bobina) || 1) : 1;
        if (!grupos.has(nRolo)) grupos.set(nRolo, []);
        const pecasDaFaixa = [];
        for (const sp of sh.pecas || []) {
          const [, pecaId] = String(sp.ref || '').split(':');
          const reg = registro.get(Number(pecaId));
          const altPlano = Number(sp.altura) > 0 ? r1(Number(sp.altura) * 100) : null;
          const resv = Number(sp.largura) > 0 ? r1(Number(sp.largura) * 100) : null;
          if (reg) {
            Object.assign(reg.tecido, { rolo_m: larg, rolo_n: temRolos ? nRolo : null, rolos_da_largura: temRolos ? rolo.bobinas.length : null, faixa_n: seq, reservado_cm: resv, altura_plano_cm: altPlano, deitada: !!sp.rotacionado });
            // a altura de corte é a do plano de corte da peça; se ele ainda não sabe do dobro do sheer
            // (Núcleo anterior à v14.101) vale a do plano de consumo — é a que comprou o tecido
            if (!sp.rotacionado && altPlano && (reg.tecido.corte_altura_cm == null || altPlano - reg.tecido.corte_altura_cm > 30)) {
              if (reg.tecido.corte_altura_cm != null) alturaPeloPlano += 1;
              reg.tecido.corte_altura_cm = altPlano; reg.tecido.altura_regra = 'plano_de_consumo';
            }
          }
          // a página cruza pelo `id` com `pecas[]`; peça que não está na fila leva o que o plano sabe dela
          pecasDaFaixa.push(reg
            ? { id: reg.id }
            : { id: Number(pecaId) || null, parte: txt(sp.ambiente) || null, comodo: txt(sp.ambiente_peca) || null, corte_altura_cm: altPlano, reservado_cm: resv, deitada: !!sp.rotacionado });
        }
        grupos.get(nRolo).push({ n: seq, comprimento_m: r2(sh.comprimento), pecas: pecasDaFaixa });
      }
      const rolos = [...grupos.entries()].sort((x, y) => x[0] - y[0]).map(([n, faixas]) => {
        const b = temRolos ? (rolo.bobinas.find((x) => Number(x.n) === n) || {}) : {};
        return {
          n: temRolos ? n : null,
          usado_m: temRolos ? r2(b.metros) : r2(faixas.reduce((s, f) => s + f.comprimento_m, 0)),
          ponta_m: temRolos && b.ponta != null ? r2(b.ponta) : null,
          excede: !!b.excede,
          faixas,
        };
      });
      larguras.push({
        largura_rolo: larg,
        tecido_sku: res.tecido_sku || null,
        metros: r2(res.comprimento != null ? res.comprimento : rolo.comprimento),
        pecas: Number(res.pecas) || rolos.reduce((s, r) => s + r.faixas.reduce((t, f) => t + f.pecas.length, 0), 0),
        faixas: seq,
        rolo_a_rolo: temRolos,
        n_rolos: temRolos ? rolo.bobinas.reduce((s, b) => s + (Number(b.bobinas) || 1), 0) : (res.bobinas != null ? Number(res.bobinas) : null),
        metros_rolo: Number(rolo.metros_bobina || res.metros_bobina) || null,
        metros_rolo_origem: rolo.metros_bobina_origem || res.metros_bobina_origem || null,
        ponta_m: res.ponta_m != null ? r2(res.ponta_m) : null,
        comodos: [...(res.ambientes || [])],
        rolos,
      });
    }
    larguras.sort((a, b) => a.largura_rolo - b.largura_rolo);
    tecido.push({
      colecao: pt.colecao || null, cor: pt.cor || null,
      pecas: Number(pt.pecas) || larguras.reduce((s, l) => s + l.pecas, 0),
      metros: r2(larguras.reduce((s, l) => s + l.metros, 0)),
      n_rolos: larguras.every((l) => l.n_rolos != null) ? larguras.reduce((s, l) => s + l.n_rolos, 0) : null,
      larguras,
      comodos: (pt.ambientes || []).map((a) => ({ comodo: a.ambiente, largura_rolo: Number(a.largura_rolo), pecas: Number(a.pecas) || 0, partes: a.blocos || [] })),
      nomes_parecidos: pt.ambientes_parecidos || [],
    });
  }
  // peças com tecido que NÃO entraram em plano nenhum (Romana, painel, cortina, peça com emenda…): cortar à parte
  const foraDoPlano = todas.filter((p) => p.tecido.rolo_m == null && (p.tecido.metros != null || p.tecido.corte_largura_cm != null));
  for (const p of foraDoPlano) p.tecido.fora_do_plano = true;
  if (alturaPeloPlano) avisos.push(`Em ${alturaPeloPlano} peça(s) a altura do tecido do plano de corte era bem menor que a do plano de consumo (tecido sheer, que leva o dobro da altura): vale a do plano de consumo. Atualize o Núcleo de Produtos para a v14.101 para o plano de corte já sair assim.`);

  // ── CORTE DOS PERFIS — pedido inteiro, por perfil, com o plano de barras
  const barraDoNucleo = new Map(((dados && dados.perfis) || []).map((x) => [chaveComp(x.componente), x]));
  const porPerfil = new Map();
  const porFormula = new Map();
  for (const p of todas) {
    for (const c of p.cortes) {
      const { nome, vezes } = nomeEVezes(c.comp);
      if (c.cm == null) {
        if (!porFormula.has(nome)) porFormula.set(nome, { perfil: nome, formula: c.formula, pecas: 0 });
        porFormula.get(nome).pecas += 1;
        continue;
      }
      if (!porPerfil.has(nome)) porPerfil.set(nome, []);
      for (let i = 0; i < vezes; i += 1) porPerfil.get(nome).push({ cm: c.cm, id: p.id });
    }
  }
  const perfis = [...porPerfil.entries()].map(([nome, cortes]) => {
    const doNucleo = barraDoNucleo.get(chaveComp(nome)) || null;
    const barraM = doNucleo && Number(doNucleo.barra_m) > 0 ? Number(doNucleo.barra_m) : 6;
    const e = encaixarBarras(cortes, barraM * 100);
    return {
      perfil: nome,
      barra_m: barraM,
      barra_origem: doNucleo ? (doNucleo.barra_origem || null) : 'padrao_do_documento',
      cortes: cortes.length,
      metros: r2(e.metros_cm / 100),
      n_barras: e.n_barras,
      sobra_m: r2(e.sobra_cm / 100),
      barras_na_lista: doNucleo && doNucleo.barras != null ? Number(doNucleo.barras) : null,
      barras: e.barras,
    };
  }).sort((a, b) => b.n_barras - a.n_barras || a.perfil.localeCompare(b.perfil, 'pt-BR'));
  const diverge = perfis.filter((x) => x.barras_na_lista != null && x.barras_na_lista !== x.n_barras);
  if (diverge.length) avisos.push(`O plano de barras deste documento difere da lista de materiais em ${diverge.map((x) => `${x.perfil} (${x.n_barras} × ${x.barras_na_lista})`).join(', ')} — as peças do plano de corte e as da lista não resolveram a mesma estrutura.`);

  // ── MONTAGEM — por PARTE → cômodo → peça, com os componentes de cada parte
  const nomesDasPartes = ordenarNomes(new Set(todas.map((p) => p.parte)));
  const idsSetores = (setores || []).map((s) => Number(s.id));
  const partes = nomesDasPartes.map((nome) => {
    const daParte = todas.filter((p) => p.parte === nome);
    const comodos = [];
    const porComodo = new Map();
    for (const p of daParte) {
      const k = p.comodo || '';
      if (!porComodo.has(k)) { porComodo.set(k, { comodo: p.comodo, pecas: [] }); comodos.push(porComodo.get(k)); }
      porComodo.get(k).pecas.push(p.id);
    }
    const comp = new Map();
    for (const p of daParte) {
      for (const m of p.materiais) {
        const k = `${m.sku || ''}|${txt(m.descricao)}|${m.un || ''}`;
        if (!comp.has(k)) comp.set(k, { sku: m.sku || null, descricao: txt(m.descricao) || m.sku || '', un: m.un || '', qtd: 0, pecas: 0 });
        const g = comp.get(k);
        g.qtd += Number(m.qtd) || 0; g.pecas += 1;
      }
    }
    // andamento: por setor (etapa concluída), embaladas (baixa) e guardadas (gaveta)
    const porSetor = idsSetores.map((sid) => {
      const s = setores.find((x) => Number(x.id) === sid);
      return {
        setor_id: sid, setor: s ? s.nome : String(sid),
        iniciadas: daParte.filter((p) => p.etapas.some((e) => Number(e.setor_id) === sid && e.inicio)).length,
        concluidas: daParte.filter((p) => p.etapas.some((e) => Number(e.setor_id) === sid && e.fim)).length,
      };
    });
    const embaladas = daParte.filter((p) => p.embalada).length;
    const guardadas = daParte.filter((p) => p.guardada).length;
    return {
      parte: nome,
      pecas: daParte.length,
      comodos,
      componentes: [...comp.values()].map((g) => ({ ...g, qtd: Math.round(g.qtd * 1000) / 1000 })).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR')),
      andamento: { setores: porSetor, embaladas, guardadas, pronta: daParte.length > 0 && embaladas === daParte.length, na_expedicao: daParte.length > 0 && guardadas === daParte.length },
    };
  });

  // ── LISTA DE COMPRA do pedido — tecido em rolos, perfis em barras, componentes em unidades
  const compra = {
    tecido: tecido.flatMap((t) => t.larguras.map((l) => ({
      colecao: t.colecao, cor: t.cor, largura_rolo: l.largura_rolo, tecido_sku: l.tecido_sku,
      metros: l.metros, n_rolos: l.n_rolos, metros_rolo: l.metros_rolo, metros_rolo_origem: l.metros_rolo_origem, ponta_m: l.ponta_m,
      metros_a_comprar: l.n_rolos != null && l.metros_rolo ? r2(l.n_rolos * l.metros_rolo) : l.metros,
    }))),
    tecido_fora_do_plano: foraDoPlano.filter((p) => p.tecido.metros != null).reduce((acc, p) => {
      const k = `${p.colecao || ''}|${p.cor || ''}|${p.tecido.largura_rolo_m || ''}`;
      let g = acc.find((x) => x.k === k);
      if (!g) { g = { k, colecao: p.colecao, cor: p.cor, largura_rolo: p.tecido.largura_rolo_m, metros: 0, pecas: 0 }; acc.push(g); }
      g.metros = r2(g.metros + p.tecido.metros); g.pecas += 1;
      return acc;
    }, []).map(({ k, ...g }) => g),
    perfis: perfis.map((x) => ({ perfil: x.perfil, cortes: x.cortes, metros: x.metros, n_barras: x.n_barras, barra_m: x.barra_m, sobra_m: x.sobra_m })),
    componentes: (() => {
      const comp = new Map();
      for (const parte of partes) for (const m of parte.componentes) {
        const k = `${m.sku || ''}|${m.descricao}|${m.un}`;
        if (!comp.has(k)) comp.set(k, { sku: m.sku, descricao: m.descricao, un: m.un, qtd: 0 });
        comp.get(k).qtd += m.qtd;
      }
      return [...comp.values()].map((g) => ({ ...g, qtd: Math.round(g.qtd * 1000) / 1000 })).sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
    })(),
  };

  if (!plano) avisos.push('O plano de corte por peça não veio do Núcleo de Produtos: o corte dos perfis e as medidas de corte da montagem ficam de fora.');
  if (!dados) avisos.push(`A lista de materiais não veio do Núcleo de Produtos${lista && lista.motivo ? ` (${lista.motivo})` : ''}: o plano de corte do tecido, os componentes e a lista de compra ficam de fora.`);
  for (const a of (lista && lista.avisos) || []) avisos.push(String(a));
  // o aviso de cada peça sai na linha dela (Montagem); aqui só a contagem — um pedido grande não pode
  // abrir todo documento com centenas de linhas de aviso
  const comAviso = todas.filter((p) => p.aviso).length;
  if (comAviso) avisos.push(`${comAviso} peça(s) com aviso do Núcleo de Produtos no plano de corte — o aviso está na linha da peça, no documento de Montagem.`);

  return {
    pedido: txt(pedido) || null,
    resumo: {
      itens: itensOrd.length, pecas: todas.length, partes: partes.length,
      embaladas: todas.filter((p) => p.embalada).length, guardadas: todas.filter((p) => p.guardada).length,
      partes_prontas: partes.filter((p) => p.andamento.pronta).length,
    },
    pecas: todas.map(({ materiais, etapas, ...p }) => p),
    tecido,
    tecido_fora_do_plano: foraDoPlano.map((p) => p.id),
    perfis,
    itens_por_formula: [...porFormula.values()],
    partes,
    compra,
    avisos: [...new Set(avisos)],
  };
}
