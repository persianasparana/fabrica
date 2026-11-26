// Teste do módulo PURO `nucleo-spec.js` — o corpo que o PCP manda ao Núcleo
// (`POST /lista-materiais`) vai COMO A VENDA COTOU (25/11/2026).
// Rodar: node server/test/nucleo-spec.test.mjs  (sem banco, sem rede)
//
// Os três casos medidos na réplica (Núcleo :3070) com o corpo de até 25/11:
//   (a) BK COLISEU 2,17 × 2,26 manual, produto fixado `premium47` → a lista saía
//       com o perfil do tubo 47 (a venda cobrou o tubo 53 da linha da tabela);
//   (b) troca de tela (tipo "Somente tecido") → a lista saía com a peça inteira;
//   (c) AM 3059 2,17 × 2,26 com `tecido_sku` do rolo de 2,00 m → 422
//       `peca_excede_rolo` (a peça caía em "não calcularam").
// O que se trava aqui é O QUE VAI AO NÚCLEO e a decisão da RESERVA — a conta é
// do Núcleo (prova na réplica: roteiro e2e da sessão, não versionado).
import assert from 'node:assert/strict';
import {
  specDoItemComercial, cotacaoDoItemComercial, corpoDaPeca, corposDaPeca,
  pecasParaReserva, decidirReserva, calcularComReserva,
} from '../src/nucleo-spec.js';

let n = 0;
const ok = (c, m) => { n++; assert.ok(c, m); console.log('✓ ' + m); };
const igual = (a, b, m) => { n++; assert.deepEqual(a, b, m); console.log('✓ ' + m); };

// ── a peça como o Comercial manda no `GET /pedidos/:id` (item do pedido)
const itemComercial = (over = {}) => ({
  id: 'it-1', tipo: 'Cortina Rolô', colecao: 'BK COLISEU', corTecido: 'BRANCO', acionamento: 'Manual',
  larguraCm: 217, alturaCm: 226, quantidade: 1, produtoSku: 'premium47', tecidoSku: 't21',
  nucleoProdutoNome: 'Rolô Premium (tubo 53)', nucleoTuboAuto: 53,
  nucleoCotacao: { produto: '__auto', tuboEquiparado: null },
  ...over,
});
// ── a linha de pcp_itens que a liberação grava a partir dele
const itemPcp = (it, over = {}) => ({
  id: 7, pedido: 'PED-2026/0001', produto: it.tipo, produto_sku: it.produtoSku || null, estrutura_sku: null,
  colecao: it.colecao || null, cor_tecido: it.corTecido || null, acionamento: it.acionamento || null,
  ambiente: null, atributos: it.acabamento ? { acabamento: it.acabamento } : {},
  spec_nucleo: specDoItemComercial(it), ...over,
});
const peca = { id: 70, numero: 1, largura: 217, altura: 226 };
const chavesOcultas = (c) => Object.keys(JSON.parse(JSON.stringify(c))).filter((k) => k.startsWith('__'));

// ═══ 1) a spec guarda como a peça foi cotada (Comercial v2.140.1) ═══════════
{
  const spec = specDoItemComercial(itemComercial());
  igual(spec.cotacao, { produto: '__auto', tubo_equiparado: null }, 'spec.cotacao = { produto: "__auto", tubo_equiparado: null }');
  ok(spec.produto_sku === 'premium47' && spec.tecido_sku === 't21' && spec.v === 1, 'os códigos efetivos da venda continuam na spec (são a reserva)');
  const antigo = specDoItemComercial(itemComercial({ nucleoCotacao: undefined }));
  ok(!('cotacao' in antigo), 'Comercial que ainda não manda `nucleoCotacao` → spec SEM a chave (≠ produto null)');
  igual(cotacaoDoItemComercial({ nucleoCotacao: { produto: null, tuboEquiparado: 47 } }), { produto: null, tubo_equiparado: 47 }, 'tipo que não aponta produto do motor: produto null (vale o sku gravado)');
  igual(cotacaoDoItemComercial({ nucleoCotacao: { produto: '  __so_tecido ', tuboEquiparado: '0' } }), { produto: '__so_tecido', tubo_equiparado: null }, 'normaliza espaços e tubo 0/negativo → null');
  for (const lixo of [null, undefined, 'x', 5, [], { nucleoCotacao: 'x' }, { nucleoCotacao: ['a'] }]) {
    ok(cotacaoDoItemComercial(lixo) === null, `entrada inválida não vira cotação (${JSON.stringify(lixo)})`);
  }
  igual(cotacaoDoItemComercial({ nucleoCotacao: { produto: 12, tuboEquiparado: 'abc' } }), { produto: null, tubo_equiparado: null }, 'produto não-texto e tubo não numérico → null (nunca NaN nem "12")');
}

// ═══ 2) (a) SELEÇÃO AUTOMÁTICA: sem produto_sku, tecido pela coleção ═════════
{
  const { corpo, reserva, venda } = corposDaPeca(itemPcp(itemComercial()), peca, { ref: '7:70' });
  ok(!('produto_sku' in corpo) && !('tipo' in corpo), '(a) seleção automática: o sku efetivo gravado NÃO vai — o Núcleo escolhe estrutura e tubo pela medida');
  ok(corpo.colecao === 'BK COLISEU' && !('tecido_sku' in corpo) && corpo.cor === 'BRANCO', '(a) tecido pela COLEÇÃO (+ cor), nunca o tecido gravado');
  ok(corpo.largura === 2.17 && corpo.altura === 2.26 && corpo.ref === '7:70' && corpo.qtd === 1, '(a) medidas da peça em metros, ref e qtd');
  ok(!('so_tecido' in corpo) && !('tubo_equiparado' in corpo) && !('modo' in corpo), '(a) manual sem equiparação: nada além do necessário');
  igual(reserva, { ref: '7:70', ambiente: undefined, janela: undefined, qtd: 1, largura: 2.17, altura: 2.26, produto_sku: 'premium47', tecido_sku: 't21', cor: 'BRANCO' },
    '(a) RESERVA = o corpo de até 25/11 (produto_sku + tecido_sku gravados)');
  igual(venda, { como_a_venda: true, modo: '__auto', so_tecido: false, produto_sku: 'premium47', tecido_sku: 't21', sku_trocado_no_pcp: false, tem_cotacao: true }, '(a) venda: como a venda, estrutura vendida premium47');
  igual(corpoDaPeca(itemPcp(itemComercial()), peca, { ref: '7:70' }), corpo, 'corpoDaPeca() == corposDaPeca().corpo');
  igual(corpoDaPeca(itemPcp(itemComercial()), peca, { ref: '7:70', fixarSkus: true }), reserva, 'corpoDaPeca({fixarSkus}) == a reserva');
  igual(chavesOcultas(corpo), [], 'nada de chave interna no JSON que vai ao Núcleo');
}

// ═══ 3) (b) SOMENTE TECIDO: `so_tecido` sempre, inclusive na reserva ═════════
{
  const it = itemComercial({ tipo: 'Somente Tecido', colecao: 'FILTRA SOL FATOR 5%', larguraCm: 150, alturaCm: 160, produtoSku: 'soft', tecidoSku: 't76', nucleoCotacao: { produto: '__so_tecido', tuboEquiparado: null } });
  const { corpo, reserva, venda } = corposDaPeca(itemPcp(it), { id: 71, numero: 1, largura: 150, altura: 160 }, { ref: '7:71' });
  ok(corpo.so_tecido === true && !('produto_sku' in corpo) && !('tecido_sku' in corpo) && corpo.colecao === 'FILTRA SOL FATOR 5%', '(b) troca de tela: so_tecido + coleção, sem sku (a estrutura é a do rolô automático)');
  ok(reserva.so_tecido === true && reserva.produto_sku === 'soft' && reserva.tecido_sku === 't76', '(b) a RESERVA também leva so_tecido — troca de tela nunca é listada como peça inteira');
  ok(venda.so_tecido === true && venda.modo === '__so_tecido' && venda.produto_sku === 'soft', '(b) venda.so_tecido');
  // nem o sku trocado no PCP tira a marca
  const trocado = corpoDaPeca(itemPcp(it, { produto_sku: 'premium' }), { id: 71, largura: 150, altura: 160 });
  ok(trocado.so_tecido === true && trocado.produto_sku === 'premium', '(b) sku trocado no PCP: vale o sku do PCP, e o so_tecido continua');
}

// ═══ 4) (c) TECIDO pela coleção em QUALQUER tipo (explícito, sentinela…) ═════
{
  const it = itemComercial({ tipo: 'Persiana Rolô Premium', colecao: 'AM 3059', corTecido: 'NATURAL', produtoSku: 'premium47', tecidoSku: 't0', nucleoCotacao: { produto: 'premium', tuboEquiparado: null } });
  const { corpo, reserva } = corposDaPeca(itemPcp(it), peca);
  ok(corpo.produto_sku === 'premium' && corpo.colecao === 'AM 3059' && corpo.cor === 'NATURAL' && !('tecido_sku' in corpo),
    '(c) tipo com produto EXPLÍCITO: vai o sku do CADASTRO (premium), não a variante efetiva gravada (premium47); tecido pela coleção');
  ok(reserva.produto_sku === 'premium47' && reserva.tecido_sku === 't0' && !('colecao' in reserva), '(c) reserva: os dois códigos gravados, sem coleção');
  // sentinela + seleção da peça
  const ph = itemComercial({ tipo: 'Persiana PH 50mm', colecao: 'Lâmina Alumínio 50mm', produtoSku: 'ph50almono_fita', tecidoSku: 't200', nucleoPh50: { comando: 'fita', monocomando: true }, nucleoCotacao: { produto: '__ph50' } });
  const cph = corpoDaPeca(itemPcp(ph), { id: 72, largura: 120, altura: 140 });
  ok(cph.produto_sku === '__ph50' && cph.ph50.comando === 'fita' && cph.ph50.monocomando === true && cph.colecao === 'Lâmina Alumínio 50mm', 'sentinela (__ph50): vai o sentinela + a seleção da peça — o Núcleo resolve a variante, como na tela');
  // sem coleção escrita: aí sim o tecido gravado
  const semCol = corposDaPeca(itemPcp(itemComercial({ colecao: '   ' })), peca);
  ok(semCol.corpo.tecido_sku === 't21' && !('colecao' in semCol.corpo), 'peça SEM coleção escrita: vai o tecido gravado');
  // coleção editada no PCP vence a da venda
  const editada = corpoDaPeca(itemPcp(itemComercial(), { colecao: 'BK LUGANO' }), peca);
  ok(editada.colecao === 'BK LUGANO' && !('tecido_sku' in editada), 'coleção trocada no PCP (modal Ver) passa a valer na lista');
}

// ═══ 5) quando o sku FIXO continua valendo ═══════════════════════════════════
{
  // peça liberada ANTES de o Comercial mandar `nucleoCotacao`
  const antigo = itemPcp(itemComercial({ nucleoCotacao: undefined }));
  const a = corposDaPeca(antigo, peca);
  ok(a.corpo.produto_sku === 'premium47' && a.corpo.colecao === 'BK COLISEU' && !('tecido_sku' in a.corpo), 'sem `cotacao` (liberada antes): produto FIXO como sempre; o tecido já vai pela coleção');
  ok(a.venda.como_a_venda === false && a.venda.tem_cotacao === false && a.reserva.tecido_sku === 't21', 'sem `cotacao`: não é "como a venda"; a reserva só difere no tecido');
  // tipo em preço manual / sem cadastro
  const manual = corposDaPeca(itemPcp(itemComercial({ tipo: 'Peça sob consulta', produtoSku: 'romana', nucleoCotacao: { produto: null } })), peca);
  ok(manual.corpo.produto_sku === 'romana' && manual.venda.como_a_venda === false && manual.venda.tem_cotacao === true, 'tipo que não aponta produto do motor: vale o sku gravado');
  // "SKU do Núcleo" trocado no PCP = escolha explícita
  const trocado = corposDaPeca(itemPcp(itemComercial(), { produto_sku: 'plussize' }), peca);
  ok(trocado.corpo.produto_sku === 'plussize' && trocado.venda.como_a_venda === false && trocado.venda.sku_trocado_no_pcp === true, 'sku trocado no PCP (≠ o da venda): fixo no sku do PCP');
  // item sem sku próprio: o sku da Estrutura do PCP (estrutura_sku) › o da venda
  const semSku = corpoDaPeca({ ...itemPcp(itemComercial({ nucleoCotacao: undefined })), produto_sku: null, estrutura_sku: 'premium' }, peca);
  ok(semSku.produto_sku === 'premium', 'item sem sku: vale o sku da Estrutura do PCP (antes era resolvido no chamador)');
  const soVenda = corpoDaPeca({ ...itemPcp(itemComercial({ nucleoCotacao: undefined })), produto_sku: null, estrutura_sku: null }, peca);
  ok(soVenda.produto_sku === 'premium47', 'sem sku no item nem na estrutura: o da venda');
  // item manual/antigo sem spec nenhuma: como antes
  const semSpec = corposDaPeca({ id: 9, produto: 'Rolô Soft', produto_sku: null, colecao: 'AM 3059', spec_nucleo: null }, peca);
  ok(semSpec.corpo.tipo === 'Rolô Soft' && semSpec.corpo.colecao === 'AM 3059' && semSpec.reserva === null && semSpec.venda.como_a_venda === false, 'item sem spec: tipo + coleção, sem reserva (corpo e reserva iguais)');
  // sem medida: 0 × 0 (o Núcleo responde "Informe largura e altura"), área direta quando há
  const m2 = corpoDaPeca(itemPcp(itemComercial({ larguraCm: 0, alturaCm: 0, areaM2: 3.5 })), { id: 1, largura: null, altura: null });
  ok(m2.area_m2 === 3.5 && !('largura' in m2), 'metragem direta: area_m2 da spec quando não há L × H');
}

// ═══ 6) TUBO EQUIPARADO — só no corpo como a venda ═══════════════════════════
{
  const it = itemComercial({ colecao: 'AM 3059', larguraCm: 100, alturaCm: 160, produtoSku: 'premium47', tecidoSku: 't0', nucleoEquiparaTubo: true, nucleoTuboAuto: 32, nucleoCotacao: { produto: '__auto', tuboEquiparado: 47 } });
  const { corpo, reserva } = corposDaPeca(itemPcp(it), { id: 73, largura: 100, altura: 160 });
  ok(corpo.tubo_equiparado === 47 && !('produto_sku' in corpo), 'equiparação: tubo_equiparado vai junto da seleção automática (é ele que escolhe a estrutura)');
  ok(!('tubo_equiparado' in reserva) && reserva.produto_sku === 'premium47', 'reserva: sem tubo_equiparado (a estrutura equiparada já é a gravada) — idêntica ao corpo de até 25/11');
  // motorizada: o resto do espelho não mudou
  const mot = corpoDaPeca(itemPcp(itemComercial({ acionamento: 'Motorizado', nucleoMotorSku: 'm1', nucleoEmissorSku: '__sem', nucleoTrilhoPlus: false, acabamento: 'Com bandô box' })), peca);
  ok(mot.modo === 'motor' && mot.motor_sku === 'm1' && mot.incluir_acionamento === false && mot.trilho_plus === false && mot.box === true, 'motor, emissor, trilho plus e acabamento seguem como antes');
}

// ═══ 7) O MESMO CORPO DA TELA do Comercial (v2.139.1) ════════════════════════
// (`recotar-como-a-tela.spec.ts` do Comercial trava estes mesmos corpos do lado de lá)
{
  const base = (c) => { const { ref, ambiente, janela, qtd, ...resto } = c; return JSON.parse(JSON.stringify(resto)); };
  igual(base(corpoDaPeca(itemPcp(itemComercial({ corTecido: null })), peca)), { largura: 2.17, altura: 2.26, colecao: 'BK COLISEU' }, 'tela: Cortina Rolô (__auto) → { largura, altura, colecao }');
  igual(base(corpoDaPeca(itemPcp(itemComercial({ corTecido: null, tipo: 'Troca de tela', colecao: 'FILTRA SOL FATOR 5%', produtoSku: 'soft', tecidoSku: 't76', nucleoCotacao: { produto: '__so_tecido' } })), peca)),
    { largura: 2.17, altura: 2.26, so_tecido: true, colecao: 'FILTRA SOL FATOR 5%' }, 'tela: Troca de tela → { …, so_tecido: true, colecao }');
  igual(base(corpoDaPeca(itemPcp(itemComercial({ tipo: 'Persiana Rolô Premium', colecao: 'AM 3059', corTecido: 'NATURAL', tecidoSku: 't0', nucleoCotacao: { produto: 'premium' } })), peca)),
    { largura: 2.17, altura: 2.26, produto_sku: 'premium', colecao: 'AM 3059', cor: 'NATURAL' }, 'tela: tipo explícito → { …, produto_sku do cadastro, colecao, cor }');
}

// ═══ 8) CONFERÊNCIA contra a venda — quem volta pela reserva ═════════════════
const plano = (ref, over = {}) => ({ ref, reserva: { ref, produto_sku: 'premium47', tecido_sku: 't21' }, venda: { como_a_venda: true, produto_sku: 'premium47' }, ...over });
{
  const planos = [plano('1:1'), plano('1:2'), plano('1:3'), plano('1:4', { reserva: null }), plano('1:5', { venda: { como_a_venda: false, produto_sku: 'premium47' } }), plano('1:6', { venda: { como_a_venda: true, produto_sku: null } })];
  const resp = [
    { ref: '1:1', ok: true, produto_sku: 'premium47' },                                      // igual à venda
    { ref: '1:2', ok: false, error: 'colecao_nao_encontrada', motivo: 'Tecido/coleção "X" não encontrado' },
    { ref: '1:3', ok: true, produto_sku: 'premium', produto_nome: 'Rolô Premium' },          // outra estrutura
    { ref: '1:4', ok: false, error: 'peca_excede_rolo' },                                    // sem reserva
    { ref: '1:5', ok: true, produto_sku: 'soft' },                                           // corpo já era o fixo
    { ref: '1:6', ok: true, produto_sku: 'soft' },                                           // venda sem sku gravado
  ];
  const m = pecasParaReserva(planos, resp);
  igual([...m.keys()], ['1:2', '1:3'], 'só voltam pela reserva: a que NÃO calculou e a que calculou OUTRA estrutura (com reserva)');
  ok(m.get('1:2').motivo === 'nao_calculou' && m.get('1:3').motivo === 'estrutura_diferente' && m.get('1:3').estrutura === 'premium', 'motivos: nao_calculou · estrutura_diferente');
  ok(pecasParaReserva(planos, null).size === 0 && pecasParaReserva(null, resp).size === 0, 'resposta/planos ausentes → nada marcado (não lança)');
  // qualquer erro vale (não só "não encontrado"): peça que calculava com o corpo antigo tem de seguir calculando
  ok(pecasParaReserva([plano('9:9')], [{ ref: '9:9', ok: false, error: 'medida_exige_motor' }]).has('9:9'), 'trava (422) no corpo como a venda também volta pela reserva');

  const d = decidirReserva(m, planos, [{ ref: '1:2', ok: true, produto_sku: 'premium47' }, { ref: '1:3', ok: true, produto_sku: 'premium47' }]);
  ok(d.get('1:2').usar === 'reserva' && /não calculou pela coleção\/tipo da venda \(Tecido\/coleção "X" não encontrado\)/.test(d.get('1:2').nota), 'reserva que CALCULOU vale; a nota diz o motivo da 1ª tentativa');
  ok(d.get('1:3').usar === 'reserva' && /hoje o Motor escolheria «Rolô Premium».*a venda saiu em «premium47».*estrutura VENDIDA/.test(d.get('1:3').nota), 'estrutura diferente: lista pela estrutura VENDIDA, com nota');
  const d2 = decidirReserva(m, planos, [{ ref: '1:2', ok: false, error: 'tecido_nao_encontrado' }, { ref: '1:3', ok: false, error: 'produto_nao_encontrado', motivo: 'Produto "premium47" não encontrado' }]);
  ok(d2.get('1:2').usar === 'venda' && d2.get('1:2').nota === null, 'reserva que também falha: fica a 1ª resposta (o motivo que a venda mostraria)');
  ok(d2.get('1:3').usar === 'venda' && /hoje não calcula \(Produto "premium47" não encontrado\).*confira com o Comercial/.test(d2.get('1:3').nota), 'estrutura vendida que não calcula mais: fica a de hoje, com nota para conferir');
}

// ═══ 9) calcularComReserva — quantas chamadas e qual resposta vale ═══════════
{
  const pecas = [
    { corpo: { ref: 'a', colecao: 'BK COLISEU' }, reserva: { ref: 'a', produto_sku: 'premium47', tecido_sku: 't21' }, venda: { como_a_venda: true, produto_sku: 'premium47' } },
    { corpo: { ref: 'b', colecao: 'RENOMEADA' }, reserva: { ref: 'b', produto_sku: 'soft', tecido_sku: 't76' }, venda: { como_a_venda: true, produto_sku: 'soft' } },
    { corpo: { ref: 'c', colecao: 'AM 3059' }, reserva: { ref: 'c', produto_sku: 'saiu', tecido_sku: 't0' }, venda: { como_a_venda: true, produto_sku: 'saiu' } },
  ];
  // o "Núcleo" de mentira: coleção RENOMEADA não existe; produto `saiu` não existe; AM 3059 automático dá premium
  const nucleo = (log) => async (corpos) => {
    log.push(corpos.map((c) => (c.produto_sku ? `${c.ref}:fixo` : `${c.ref}:venda`)).join(' '));
    return { marca: log.length, pecas: corpos.map((c) => {
      if (c.colecao === 'RENOMEADA') return { ref: c.ref, ok: false, error: 'colecao_nao_encontrada', motivo: 'não encontrado' };
      if (c.produto_sku === 'saiu') return { ref: c.ref, ok: false, error: 'produto_nao_encontrado', motivo: 'Produto "saiu" não encontrado' };
      return { ref: c.ref, ok: true, produto_sku: c.produto_sku || (c.colecao === 'AM 3059' ? 'premium' : 'premium47') };
    }) };
  };
  let log = [];
  let r = await calcularComReserva([pecas[0]], nucleo(log));
  ok(r.chamadas === 1 && log.length === 1 && r.decisoes.size === 0 && r.data.marca === 1, 'caso normal (bate com a venda): UMA chamada, como sempre');
  log = [];
  r = await calcularComReserva([pecas[0], pecas[1]], nucleo(log));
  igual(log, ['a:venda b:venda', 'a:venda b:fixo'], 'peça que não calculou: 2ª chamada do bloco só com ELA pela reserva');
  ok(r.chamadas === 2 && r.data.marca === 2 && r.decisoes.get('b').usar === 'reserva' && r.data.pecas.every((p) => p.ok), 'a reserva calculou → vale a 2ª resposta');
  log = [];
  r = await calcularComReserva(pecas, nucleo(log));
  igual(log, ['a:venda b:venda c:venda', 'a:venda b:fixo c:fixo', 'a:venda b:fixo c:venda'], 'resultado MISTO (b pela reserva, c não): 3ª chamada com a escolha final');
  ok(r.chamadas === 3 && r.data.marca === 3 && r.decisoes.get('b').usar === 'reserva' && r.decisoes.get('c').usar === 'venda', 'vale a 3ª resposta: agregados de UMA chamada só');
  ok(r.data.pecas.find((p) => p.ref === 'c').ok === true, 'a peça cuja estrutura vendida não calcula mais NÃO deixa de calcular (fica a de hoje)');
  // só a "c": a reserva não calcula → fica a 1ª (2 chamadas, sem 3ª)
  log = [];
  r = await calcularComReserva([pecas[2]], nucleo(log));
  ok(r.chamadas === 2 && r.data.marca === 1 && r.decisoes.get('c').usar === 'venda', 'nenhuma reserva calculou → fica a 1ª resposta (sem 3ª chamada)');
  // rede: Núcleo fora na 1ª, na 2ª e na 3ª
  r = await calcularComReserva(pecas, async () => null);
  ok(r.data === null && r.chamadas === 1, 'Núcleo fora na 1ª chamada → data null (quem chama avisa, como sempre)');
  let k = 0;
  r = await calcularComReserva([pecas[0], pecas[1]], async (c) => (++k === 1 ? nucleo([])(c) : null));
  ok(r.chamadas === 2 && r.data && r.data.pecas.find((p) => p.ref === 'b').ok === false && r.decisoes.size === 0, 'Núcleo fora na 2ª chamada → vale a 1ª resposta (nada piora)');
  k = 0;
  r = await calcularComReserva(pecas, async (c) => (++k === 3 ? null : nucleo([])(c)));
  ok(r.chamadas === 3 && r.data && r.data.pecas.filter((p) => p.ok).length === 2, 'Núcleo fora na 3ª chamada → a resposta em que MAIS peças calcularam');
  r = await calcularComReserva([], nucleo([]));
  ok(r.data && r.data.pecas.length === 0, 'bloco vazio não lança');
}

console.log(`\n${n} verificações — nucleo-spec OK`);
