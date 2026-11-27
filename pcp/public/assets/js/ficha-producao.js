/**
 * Ficha de Produção — página imprimível por pedido.
 * Uso: ficha-producao.html?pedido=PED-2026/0002
 *
 * O documento que desce pra bancada: TODAS as informações que chegaram do
 * Comercial no PCP, item a item — produto, estrutura vinculada, coleção,
 * cores, acionamento, ambiente, atributos do formulário dinâmico, obs
 * técnicas e as peças com medidas/etiquetas. Complementa a Ordem de Corte
 * (que traz as medidas de corte por setor).
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fmtData(s) {
    if (!s) return '—';
    const [a, m, d] = String(s).split('-');
    return d ? `${d}/${m}/${a}` : s;
  }
  function medidaM(cm) {
    if (cm == null || cm === '' || !(Number(cm) > 0)) return null;
    return (Number(cm) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  }

  async function api(path) {
    const res = await fetch('../api/' + path, { credentials: 'same-origin' });
    if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Não autenticado'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  // rótulos amigáveis pros atributos do formulário dinâmico do Comercial
  function rotuloAtributo(chave) {
    return String(chave || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Cortes calculados (da Ordem de Corte) por peça deste item, filtrados pelo
  // setor escolhido — specs + medidas de corte na MESMA ficha da bancada.
  function blocoCortes(item, cortesPorPeca, setorFiltro) {
    const linhas = [];
    for (const p of (item.pecas || [])) {
      const doPeca = (cortesPorPeca.get(String(p.id)) || [])
        .filter((c) => !setorFiltro || String(c.setor_id) === String(setorFiltro));
      if (!doPeca.length) continue;
      linhas.push(`<tr><td class="num-p">#${p.numero}</td><td>${doPeca.map((c) =>
        `<span style="white-space:nowrap"><b>${esc(c.corte)}:</b> ${Number(c.valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${c.qtd > 1 ? ` (×${c.qtd})` : ''} ${esc(c.unidade || '')}</span>`
      ).join(' &nbsp;·&nbsp; ')}</td></tr>`);
    }
    if (!linhas.length) return '';
    return `<table class="pecas" style="border-top:2px solid var(--gold)">
      <thead><tr><th style="width:44px">Peça</th><th>✂ Cortes calculados${setorFiltro ? ' (setor filtrado)' : ''}</th></tr></thead>
      <tbody>${linhas.join('')}</tbody>
    </table>`;
  }

  // P0 do planejamento (06/11/2026) — LISTA DE MATERIAIS da peça, calculada pelo
  // Núcleo de Produtos (/lista-materiais) com a especificação da venda: receita,
  // tubo/kit/motor, box, bandô, tecido (metros de rolo, coleção × cor). Sem
  // dinheiro. Agregada por ITEM (Σ das peças) — é o que a bancada separa.
  const ROTULO_ORIGEM = {
    receita: 'receita', mecanismo: 'mecanismo', tubo: 'tubo', kit: 'kit motor', motor: 'motor', emissor: 'emissor',
    fonte: 'fonte', box: 'box', bando: 'bandô', bando_tira: 'tira do bandô', tecido: 'tecido', lamina: 'lâminas',
    terceirizado: 'fornecedor', vertical: 'vertical', avulso: 'avulso',
  };
  const fmtQtd = (q) => Number(q || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  function blocoMateriais(item, porItem) {
    const agg = porItem && porItem[String(item.id)];
    if (!agg) return '';
    const mats = agg.materiais || [];
    // 25/11/2026 — notas da conferência contra a venda (troca de tela = só o
    // tecido; peça listada pelos códigos gravados na venda…): saem na ficha
    // impressa, é o que a bancada precisa saber antes de separar.
    const notas = Array.isArray(agg.notas) ? agg.notas : [];
    if (!mats.length && !agg.erros.length && !notas.length) return '';
    const linhas = mats.map((m) => `<tr>
        <td style="font-family:monospace;font-size:11px">${esc(m.sku || '—')}</td>
        <td>${esc(m.descricao || '')}${m.tipo === 'tecido' && m.colecao ? ` <small style="color:var(--text3)">${esc(m.colecao)}${m.cor ? ' · ' + esc(m.cor) : ''}${m.largura_rolo ? ' · rolo ' + fmtQtd(m.largura_rolo) + ' m' : ''}</small>` : ''}</td>
        <td style="text-align:right;font-weight:800">${fmtQtd(m.qtd)}</td>
        <td>${esc(m.un || '')}</td>
        <td><small style="color:var(--text3)">${esc(ROTULO_ORIGEM[m.origem] || m.origem || '')}</small></td>
      </tr>`).join('');
    return `<table class="pecas" style="border-top:2px solid var(--gold)">
      <thead><tr><th style="width:150px">SKU</th><th>📦 Lista de materiais (${agg.pecas} peça${agg.pecas > 1 ? 's' : ''}, pelo Núcleo)</th><th style="width:80px;text-align:right">Qtd</th><th style="width:44px">Un</th><th style="width:90px">Origem</th></tr></thead>
      <tbody>${notas.map((t) => `<tr><td colspan="5" style="font-weight:700;background:#fff8e1">ℹ ${esc(t)}</td></tr>`).join('')}${linhas}${agg.erros.length ? `<tr><td colspan="5" style="color:var(--red)">⚠ ${esc(agg.erros.join(' · '))}</td></tr>` : ''}</tbody>
    </table>`;
  }

  function blocoItem(item, ix, estruturaPorId, cortesPorPeca, setorFiltro) {
    const prod = item.produto_id != null ? estruturaPorId.get(Number(item.produto_id)) : null;
    const atributos = (item.atributos && typeof item.atributos === 'object') ? item.atributos : {};
    const camposSpec = [
      ['Coleção', item.colecao],
      ['Cor do tecido', item.cor_tecido],
      ['Cor do perfil', item.cor_perfil],
      ['Acionamento', item.acionamento],
      ['Ambiente', item.ambiente],
      // 27/11/2026 — o bloco do pedido em que a peça foi lançada ("PARTE 1"), quando o ambiente é o cômodo escrito na peça
      ['Grupo no pedido', item.grupo_pedido && item.grupo_pedido !== item.ambiente ? item.grupo_pedido : null],
      ['Quantidade', item.qnt],
      ['Data prometida', fmtData(item.data_cliente)],
      ['Tipo', item.tipo],
    ];
    for (const [k, v] of Object.entries(atributos)) {
      if (v != null && v !== '') camposSpec.push([rotuloAtributo(k), v]);
    }
    const spec = camposSpec
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<div><b>${esc(k)}</b><span>${esc(v)}</span></div>`)
      .join('');

    const pecas = (item.pecas || []).map((p) => {
      const l = medidaM(p.largura);
      const a = medidaM(p.altura);
      const med = (p.medidas && typeof p.medidas === 'object') ? p.medidas : {};
      const extras = [];
      if (med.comando != null) extras.push(`comando ${medidaM(med.comando) || med.comando} m`);
      if (med.furos != null) extras.push(`${med.furos} furos`);
      if (med.modelo != null) extras.push(`modelo ${med.modelo}`);
      return `<tr>
        <td class="num-p">#${p.numero}</td>
        <td class="med">${l && a ? `${l} × ${a} m` : '<span style="color:var(--red)">sem medida</span>'}</td>
        <td>${extras.join(' · ') || '—'}</td>
        <td style="font-family:monospace">${esc(p.cod_barras || '—')}</td>
        <td>${p.conclusao ? '✔ ' + fmtData(p.conclusao) : ''}</td>
      </tr>`;
    }).join('');

    return `<div class="item">
      <div class="item-head">
        <span class="num">${ix + 1}</span>
        <span class="nome">${esc(item.produto || 'Peça')}${item.especial ? ' <span style="color:#ffd76e">★ ESPECIAL</span>' : ''}</span>
        <span class="estrutura">${prod ? 'Estrutura: ' + esc(prod.nome) : (/^(fixa_|cortina|celular|vertical|toldo)/i.test(String(item.produto_sku || '')) ? 'Cortes e materiais pelo Núcleo de Produtos (' + esc(item.produto_sku) + ')' : '⚠ SEM ESTRUTURA — Ordem de Corte não sai para este item')}</span>
      </div>
      ${spec ? `<div class="spec">${spec}</div>` : ''}
      ${item.observacoes ? `<div class="obs"><b>Observações técnicas</b>${esc(item.observacoes)}</div>` : ''}
      <table class="pecas">
        <thead><tr><th style="width:44px">Peça</th><th style="width:150px">Medida (L × A)</th><th>Medidas extras</th><th style="width:130px">Etiqueta</th><th style="width:110px">Concluída</th></tr></thead>
        <tbody>${pecas || '<tr><td colspan="5" style="color:var(--text3)">Sem peças cadastradas.</td></tr>'}</tbody>
      </table>
      ${blocoCortes(item, cortesPorPeca, setorFiltro)}
      ${blocoMateriais(item, estado.materiais && estado.materiais.por_item)}
    </div>`;
  }

  // PLANO DE CORTE DO TECIDO (Núcleo v14.98 — consumo pelo melhor aproveitamento do
  // pedido): de qual rolo sai cada peça e quais dividem a mesma faixa. O tecido da
  // lista acima foi calculado com as peças cortadas ASSIM — cortar ambiente por
  // ambiente gasta mais tecido do que o separado/comprado. Núcleo antigo ou regra
  // desligada: `plano_tecido` vazio e o bloco não aparece.
  //
  // 27/11/2026 (Núcleo v14.100, pedido do cliente — proposta 2026/1348):
  //  · o CÔMODO de cada peça é o Ambiente escrito nela (sem o nº da janela); o bloco diz
  //    de qual LARGURA de rolo sai cada cômodo e avisa os nomes parecidos que saíram de
  //    larguras diferentes (corrige-se o texto no modal "Ver" da fila);
  //  · o plano sai ROLO A ROLO: as faixas de cada largura distribuídas nos rolos de
  //    verdade (nenhuma faixa começa num rolo e termina em outro), com a sobra de cada um.
  // Núcleo anterior: sem `bobinas`/`ambientes_parecidos` — o bloco sai como antes.
  function blocoPlanoTecido(d) {
    const planos = (d.plano_tecido || []).filter((t) => t && Array.isArray(t.rolos) && t.rolos.length);
    if (!planos.length) return '';
    const m = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rotulo = (pc) => {
      const quem = estado.refRotulo.get(String(pc.ref)) || '';
      // o cômodo escrito na peça (com a janela) diz mais que o grupo do pedido em que ela foi lançada
      const onde = [pc.ambiente_peca || pc.ambiente, pc.janela].filter(Boolean).join(' · ');
      return `<b>${esc(quem || onde || 'peça')}</b>${quem && onde ? ' <small style="color:var(--text3)">' + esc(onde) + '</small>' : ''} ${m(pc.largura)} × ${m(pc.altura)} m${pc.rotacionado ? ' <small>(deitada)</small>' : ''}`;
    };
    const porNome = (a, b) => String(a.ambiente || '').localeCompare(String(b.ambiente || ''), 'pt-BR', { numeric: true });

    // de qual largura sai cada cômodo (só faz sentido com mais de um cômodo no plano)
    const blocoComodos = (t, titulo) => {
      const ambs = (t.ambientes || []).filter((a) => a && a.ambiente);
      if (ambs.length < 2) return '';
      const larguras = [...new Set(ambs.map((a) => Number(a.largura_rolo)))].sort((a, b) => a - b);
      const linhas = larguras.map((l) => {
        const daqui = ambs.filter((a) => Number(a.largura_rolo) === l).sort(porNome);
        const pecas = daqui.reduce((s2, a) => s2 + Number(a.pecas || 0), 0);
        const nomes = daqui.map((a) => {
          const grupos = Array.isArray(a.blocos) && a.blocos.length > 1 ? ` — ${a.blocos.map(esc).join(', ')}` : '';
          return `${esc(a.ambiente)} <small style="color:var(--text3)">(${a.pecas}${grupos})</small>`;
        }).join(' · ');
        return `<tr><td style="font-weight:800;vertical-align:top;white-space:nowrap">Rolo ${m(l)} m<br><small style="font-weight:400;color:var(--text3)">${daqui.length} cômodo(s) · ${pecas} peça(s)</small></td><td>${nomes}</td></tr>`;
      }).join('');
      return `<table class="pecas" style="margin-top:8px">
        <thead><tr><th style="width:130px">📍 Largura do rolo</th><th>Cômodos que saem dela — ${titulo} <small style="font-weight:400">(cada cômodo numa largura só; entre parênteses, as peças)</small></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table>`;
    };

    // nomes parecidos que saíram de larguras diferentes: aviso (nada é juntado sozinho)
    const blocoParecidos = (t) => (t.ambientes_parecidos || []).map((g) => {
      const lista = (g.comodos || []).map((c) => `«${esc(c.ambiente)}» <small>(rolo ${m(c.largura_rolo)} m)</small>`).join(' × ');
      const oQue = g.motivo === 'grafia' ? 'nomes quase iguais — pode ser erro de digitação' : 'o mesmo nome mudando só o número';
      return `<div class="alerta">⚠ <b>Cômodos de nomes parecidos em larguras de rolo diferentes</b>: ${lista} — ${oQue}. Se for o mesmo cômodo, deixe o <b>Ambiente</b> das peças escrito igual (modal "Ver" da fila) e abra a Ficha de novo; se forem cômodos diferentes, está certo assim.</div>`;
    }).join('');

    const tabelaDaLargura = (ro, larg, titulo) => {
      const cabeca = (primeira) => `<thead><tr><th style="width:150px">${primeira}</th><th style="width:110px;text-align:right">Faixa (comprimento)</th><th>Peças lado a lado na faixa (largura de corte × altura de fábrica)</th></tr></thead>`;
      if (!Array.isArray(ro.bobinas) || !ro.bobinas.length) {
        // Núcleo sem o rolo a rolo: a largura como um rolo só (como até 27/11)
        const linhas = ro.shelves.map((sh, i) => `<tr>
          ${i === 0 ? `<td rowspan="${ro.shelves.length}" style="font-weight:800;vertical-align:top">Rolo ${m(ro.largura_rolo)} m<br><small style="font-weight:400;color:var(--text3)">${m(ro.comprimento)} m de rolo</small></td>` : ''}
          <td style="text-align:right;white-space:nowrap">${i + 1} — ${m(sh.comprimento)} m</td>
          <td>${sh.pecas.map(rotulo).join(' &nbsp;+&nbsp; ')}</td>
        </tr>`).join('');
        return `<table class="pecas" style="margin-top:8px">${cabeca(`✂ Plano de corte — ${titulo}`)}<tbody>${linhas}</tbody></table>`;
      }
      const total = ro.bobinas.reduce((s2, b) => s2 + Number(b.bobinas || 1), 0);
      const origem = ro.metros_bobina_origem === 'cadastro' ? '' : ' <small style="font-weight:400">(tamanho padrão — o desta largura não está cadastrado)</small>';
      let n = 0;
      const linhas = ro.bobinas.map((b) => {
        const faixas = ro.shelves.filter((sh) => Number(sh.bobina) === Number(b.n));
        const cel = b.excede
          ? `Faixa maior que o rolo<br><small style="font-weight:400;color:var(--red)">${m(b.metros)} m — não sai de um rolo de ${m(ro.metros_bobina)} m (pede ${b.bobinas || 2} rolos / emenda)</small>`
          : `Rolo ${b.n} de ${ro.bobinas.length}<br><small style="font-weight:400;color:var(--text3);white-space:nowrap">${m(b.metros)} m usados<br>sobra ${m(b.ponta)} m</small>`;
        return faixas.map((sh, i) => {
          n += 1;
          return `<tr style="page-break-inside:avoid">
            ${i === 0 ? `<td rowspan="${faixas.length}" style="font-weight:800;vertical-align:top">${cel}</td>` : ''}
            <td style="text-align:right;white-space:nowrap">${n} — ${m(sh.comprimento)} m</td>
            <td>${sh.pecas.map(rotulo).join(' &nbsp;+&nbsp; ')}</td>
          </tr>`;
        }).join('');
      }).join('');
      const resumo = `Largura <b>${m(ro.largura_rolo)} m</b> — ${m(ro.comprimento)} m de tecido em <b>${total} rolo(s) de ${m(ro.metros_bobina)} m</b>${origem}${larg && larg.ponta_m != null ? ` · sobra nas pontas ${m(larg.ponta_m)} m` : ''}`;
      return `<table class="pecas" style="margin-top:8px">
        <thead><tr><th colspan="3" style="text-align:left">✂ Plano de corte — ${titulo} · ${resumo}</th></tr></thead>
        ${cabeca('Rolo')}
        <tbody>${linhas}</tbody>
      </table>`;
    };

    const roloARolo = planos.some((t) => t.rolos.some((ro) => Array.isArray(ro.bobinas) && ro.bobinas.length));
    const padrao = planos.some((t) => t.rolos.some((ro) => Array.isArray(ro.bobinas) && ro.metros_bobina_origem !== 'cadastro'));
    return planos.map((t) => {
      const titulo = `${esc(t.colecao || '')}${t.cor ? ' · ' + esc(t.cor) : ''}`;
      const fora = (t.fora_do_rolo || []).length
        ? `<div class="alerta">⚠ ${t.fora_do_rolo.length} peça(s) fora do plano (não cabem em nenhuma largura de rolo — corte próprio/emenda): ${t.fora_do_rolo.map(rotulo).join('; ')}</div>` : '';
      return `${blocoComodos(t, titulo)}${blocoParecidos(t)}${t.rolos.map((ro, ri) => tabelaDaLargura(ro, (t.larguras || [])[ri], titulo)).join('')}${fora}`;
    }).join('') + `<div class="alerta" style="background:#F3F7FF;border-color:#8FB1E6">✂ <b>Corte o tecido seguindo o plano acima</b>: os metros de tecido deste pedido foram calculados com as peças de cômodos diferentes dividindo o rolo (cada cômodo numa largura de rolo só). Cortar cômodo por cômodo gasta mais tecido do que o separado.${roloARolo ? ' Os rolos foram contados com as <b>faixas inteiras</b> — nenhuma faixa começa num rolo e termina em outro; a sobra de cada rolo volta para o estoque.' : ''}${padrao ? ' ⚠ Onde o tamanho do rolo é o <b>padrão</b>, cadastre os metros por rolo da largura no Núcleo de Produtos (Cadastros → Tecidos (coleções)) para a conta de rolos ficar exata.' : ''}</div>`;
  }

  // Resumo de materiais do PEDIDO inteiro (tecido por coleção × cor × rolo com
  // bobinas, perfis em barras, tubos, componentes consolidados)
  function blocoResumoMateriais() {
    const lm = estado.materiais;
    if (!lm) return '';
    if (!lm.habilitado || !lm.data) {
      return `<div class="alerta so-tela">📦 Lista de materiais indisponível: ${esc(lm.motivo || 'Núcleo de Produtos fora do ar')}</div>`;
    }
    const d = lm.data;
    const tecido = (d.tecido || []).map((t) => `<tr><td>${esc(t.colecao)}</td><td>${esc(t.cor || '—')}</td><td>${t.largura_rolo ? fmtQtd(t.largura_rolo) + ' m' : '—'}</td><td style="text-align:right;font-weight:800">${fmtQtd(t.metros)} m</td><td style="text-align:right">${t.bobinas}${t.metros_bobina ? ' × ' + fmtQtd(t.metros_bobina) + ' m' : ''}${t.bobinas_regra === 'rolo_a_rolo' && t.bobinas_por_metros != null && t.bobinas !== t.bobinas_por_metros ? ' <small style="color:var(--text3)">(pelos metros seriam ' + t.bobinas_por_metros + ')</small>' : ''}</td><td style="text-align:right">${fmtQtd(t.sobra)} m</td></tr>`).join('');
    const perfis = (d.perfis || []).map((x) => `<tr><td>${esc(x.componente)}</td><td style="text-align:right">${x.cortes}</td><td style="text-align:right;font-weight:800">${fmtQtd(x.metros)} m</td><td style="text-align:right">${x.barras} × ${fmtQtd(x.barra_m)} m</td><td style="text-align:right">${fmtQtd(x.sobra_m)} m</td></tr>`).join('');
    // os tubos já saem na saída de perfis (mesmo corte) — só entram aqui os que não estão lá
    const nomesPerfis = new Set((d.perfis || []).map((x) => String(x.componente || '').toLowerCase().replace(/\s+/g, '')));
    const tubos = (d.tubos || []).filter((t) => !nomesPerfis.has(String(t.corte || '').toLowerCase().replace(/\s+/g, ''))).map((t) => `<tr><td>Tubo ${t.tubo} mm</td><td style="text-align:right">${t.cortes}</td><td style="text-align:right;font-weight:800">${fmtQtd(t.metros)} m</td><td style="text-align:right">${t.barras} × ${fmtQtd(t.barra_m)} m</td><td></td></tr>`).join('');
    const comps = (d.materiais || []).filter((m) => m.tipo === 'componente').map((m) => `<tr><td style="font-family:monospace;font-size:11px">${esc(m.sku || '—')}</td><td>${esc(m.descricao || '')}</td><td style="text-align:right;font-weight:800">${fmtQtd(m.qtd)}</td><td>${esc(m.un || '')}</td><td><small style="color:var(--text3)">${(m.origens || []).map((o) => ROTULO_ORIGEM[o] || o).join(', ')}</small></td></tr>`).join('');
    const avisos = (lm.avisos || []).map((a) => `<div class="alerta">${esc(a)}</div>`).join('');
    return `<div class="resumo-materiais" style="margin-top:16px;page-break-inside:avoid">
      <h2 style="font-size:13px;letter-spacing:.04em;border-bottom:2px solid var(--gold);padding-bottom:4px">📦 MATERIAIS DO PEDIDO — separação (pelo Núcleo de Produtos)</h2>
      ${avisos}
      ${tecido ? `<table class="pecas" style="margin-top:8px"><thead><tr><th>Tecido — coleção</th><th>Cor</th><th>Largura do rolo</th><th style="text-align:right">Metros</th><th style="text-align:right">Rolos</th><th style="text-align:right">Sobra</th></tr></thead><tbody>${tecido}</tbody></table>` : ''}
      ${blocoPlanoTecido(d)}
      ${perfis || tubos ? `<table class="pecas" style="margin-top:8px"><thead><tr><th>Perfis / tubos (barras)</th><th style="text-align:right">Cortes</th><th style="text-align:right">Metros</th><th style="text-align:right">Barras</th><th style="text-align:right">Sobra</th></tr></thead><tbody>${perfis}${tubos}</tbody></table>` : ''}
      ${comps ? `<table class="pecas" style="margin-top:8px"><thead><tr><th style="width:150px">SKU</th><th>Componentes (consolidado)</th><th style="text-align:right">Qtd</th><th style="width:44px">Un</th><th style="width:120px">Origem</th></tr></thead><tbody>${comps}</tbody></table>` : ''}
    </div>`;
  }

  const estado = { setorFiltro: '', setores: [], cortesPorPeca: new Map(), desenhosFab: [], comercialId: null, materiais: null, refRotulo: new Map() };

  // Desenho de fabricação anexado no Comercial — servido pelo proxy do PCP
  // (mesma sessão). Imagens saem inline na impressão; PDF vira link (não sai).
  function blocoDesenhos() {
    if (!estado.desenhosFab.length || !estado.comercialId) return '';
    const partes = estado.desenhosFab.map((d) => {
      const url = `../api/comercial/pedidos/${encodeURIComponent(estado.comercialId)}/desenhos/${encodeURIComponent(d.id)}/arquivo`;
      if (String(d.mime || '').startsWith('image/')) {
        return `<img src="${url}" alt="Desenho de fabricação — ${esc(d.nomeOriginal || '')}" style="max-width:100%;border:1px solid var(--border);border-radius:6px;margin-top:8px">`;
      }
      return `<div class="alerta" style="margin:8px 0 0">📄 <a href="${url}" target="_blank" rel="noopener">Abrir PDF: ${esc(d.nomeOriginal || 'desenho')}</a> — <b>PDF não sai na impressão da ficha</b>; imprima-o separadamente pelo navegador.</div>`;
    }).join('');
    return `<div class="desenho-fab" style="margin-bottom:14px">
      <h2 style="font-size:13px;letter-spacing:.04em;border-bottom:2px solid var(--gold);padding-bottom:4px">📐 DESENHO DE FABRICAÇÃO</h2>
      ${partes}
    </div>`;
  }

  function render(pedido, dados, estruturaPorId) {
    const itens = dados.itens || [];
    const info = dados.info || null;
    // rótulo de cada peça no plano de corte do tecido: "Item 2 · peça #1" (ref do Núcleo = item:peca)
    estado.refRotulo = new Map();
    itens.forEach((it, ix) => (it.pecas || []).forEach((p) => estado.refRotulo.set(`${it.id}:${p.id}`, `Item ${ix + 1} · peça #${p.numero}`)));
    const emitida = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const cliente = (info && info.cliente) || itens.map((i) => i.cliente).find(Boolean) || '—';
    const dataCliente = itens.map((i) => i.data_cliente).find(Boolean) || null;
    const totalPecas = itens.reduce((a, i) => a + ((i.pecas || []).length || Number(i.qnt) || 1), 0);
    const semEstrutura = itens.filter((i) => i.produto_id == null && !/^(fixa_|cortina|celular|vertical|toldo)/i.test(String(i.produto_sku || ''))).length;
    const semMedida = itens.reduce((a, i) => a + (i.pecas || []).filter((p) => !(Number(p.largura) > 0)).length, 0);

    const avisos = [];
    if (semEstrutura) avisos.push(`⚠ ${semEstrutura} item(ns) sem Estrutura do Produto — vincule na Fila (Ver) ou na aba Estrutura do Produto para a Ordem de Corte sair completa.`);
    if (semMedida) avisos.push(`⚠ ${semMedida} peça(s) sem largura/altura — preencha em Editar Pedido → Medidas das peças.`);

    $('#conteudo').innerHTML = `
      <div class="doc-header">
        <img src="assets/brand/logos/logo-preto.png" alt="Persianas Paraná">
        <div class="titulo">
          <h1>FICHA DE PRODUÇÃO — ${esc(pedido)}</h1>
          <div class="sub">Emitida em ${emitida}</div>
        </div>
      </div>
      <div class="meta">
        <div><b>Pedido</b><span>${esc(pedido)}</span></div>
        <div><b>Cliente</b><span>${esc(cliente)}</span></div>
        ${info && info.vendedor ? `<div><b>Vendedor</b><span>${esc(info.vendedor)}</span></div>` : ''}
        ${info && info.modalidade ? `<div><b>Modalidade</b><span>${esc(String(info.modalidade).replace(/_/g, ' '))}</span></div>` : ''}
        <div><b>Data prometida</b><span>${fmtData(dataCliente)}${info && info.prazo_dias ? ` <small style="font-weight:400;color:var(--text3)">(${info.prazo_dias} dias)</small>` : ''}</span></div>
        <div><b>Itens</b><span>${itens.length}</span></div>
        <div><b>Peças</b><span>${totalPecas}</span></div>
      </div>
      ${info && info.observacoes ? `<div class="obs" style="border:1px solid #E9B44C;border-radius:6px;margin-bottom:10px"><b>Observações do pedido (vendedor)</b>${esc(info.observacoes)}</div>` : ''}
      ${estado.setores.length ? `<div id="filtro-setor" style="display:flex;gap:6px;align-items:center;margin-bottom:10px;font-size:12px" class="so-tela">
        <b>Imprimir ficha do setor:</b>
        <select onchange="window.__setorFiltro(this.value)" style="font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px">
          <option value="">Todos os setores</option>
          ${estado.setores.map((s2) => `<option value="${s2.id}" ${String(estado.setorFiltro) === String(s2.id) ? 'selected' : ''}>${esc(s2.nome)}</option>`).join('')}
        </select>
        <span style="color:var(--text3)">— filtra os cortes calculados; as specs saem sempre</span>
      </div>` : ''}
      ${avisos.map((a) => `<div class="alerta">${a}</div>`).join('')}
      ${itens.map((it, ix) => blocoItem(it, ix, estruturaPorId, estado.cortesPorPeca, estado.setorFiltro)).join('') || '<div class="alerta">Pedido sem itens.</div>'}
      ${blocoDesenhos()}
      ${blocoResumoMateriais()}
      <div class="assinatura">
        <div class="campo">Produzido por</div>
        <div class="campo">Conferido por</div>
        <div class="campo">Data / Hora</div>
      </div>
      <div class="rodape">
        <span>PCP — Persianas Paraná · Ficha de produção gerada a partir do pedido do Comercial</span>
        <span>${esc(pedido)}</span>
      </div>`;
    document.title = `Ficha de Produção — ${pedido}`;
  }

  (async () => {
    const pedido = new URLSearchParams(window.location.search).get('pedido');
    if (!pedido) {
      $('#conteudo').innerHTML = '<div class="alerta">Informe o pedido na URL: <code>ficha-producao.html?pedido=PED-2026/0002</code></div>';
      return;
    }
    const lnk = document.getElementById('lnk-producao');
    if (lnk) lnk.href = 'producao.html?pedido=' + encodeURIComponent(pedido);
    try {
      await api('auth/session');
      const [dados, estrutura, oc, materiais] = await Promise.all([
        api('pcp/pedido?pedido=' + encodeURIComponent(pedido)),
        api('pcp/estrutura'),
        api('pcp/ordem-corte/preview?pedidos=' + encodeURIComponent(pedido)).catch(() => null),
        // P0 do planejamento — lista de materiais pelo Núcleo (best-effort: sem ela a ficha sai como antes)
        api('pcp/pedido/materiais?pedido=' + encodeURIComponent(pedido)).catch((e2) => ({ habilitado: false, motivo: e2.message, data: null, por_item: {} })),
      ]);
      estado.materiais = materiais;
      const porId = new Map((estrutura.data || []).map((p) => [Number(p.id), p]));
      // Desenho de fabricação anexado no Comercial (flag gravada na liberação)
      const info = dados.info || null;
      if (info && info.desenho_fabricacao && info.comercial_id) {
        estado.comercialId = info.comercial_id;
        try {
          const r = await api('comercial/pedidos/' + encodeURIComponent(info.comercial_id) + '/desenhos');
          estado.desenhosFab = (r.data || []).filter((d) => d && d.tipo === 'FABRICACAO');
        } catch (e2) { /* Comercial fora do ar — a ficha sai sem o desenho */ }
      }
      // indexa os cortes calculados por peça (e a lista de setores presentes)
      for (const g of ((oc && oc.setores) || [])) {
        const st = g.setor || {};
        if (st.id != null && !estado.setores.some((x) => String(x.id) === String(st.id)))
          estado.setores.push({ id: st.id, nome: st.nome });
        for (const l of (g.linhas || [])) {
          if (l.peca_id == null || !(Number(l.valor) > 0)) continue;
          const k = String(l.peca_id);
          if (!estado.cortesPorPeca.has(k)) estado.cortesPorPeca.set(k, []);
          estado.cortesPorPeca.get(k).push({ setor_id: st.id, corte: l.corte, valor: l.valor, qtd: l.qtd, unidade: l.unidade });
        }
      }
      window.__setorFiltro = (v) => { estado.setorFiltro = v; render(pedido, dados, porId); };
      render(pedido, dados, porId);
    } catch (e) {
      if (e.message !== 'Não autenticado')
        $('#conteudo').innerHTML = `<div class="alerta">Erro: ${esc(e.message)}</div>`;
    }
  })();
})();
