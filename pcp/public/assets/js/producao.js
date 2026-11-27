/**
 * PRODUÇÃO POR ETAPAS — os documentos do pedido, um por aba e um por impressão (27/11/2026).
 * Uso: producao.html?pedido=PED-2026/0002[&doc=partes|compra|tecido|perfis|montagem][&parte=PARTE 3]
 *
 * Pedido do cliente: imprimir o corte do TECIDO separado do corte dos PERFIS e, no fim, a MONTAGEM —
 * o tecido do pedido inteiro por largura de rolo (para não ficar trocando de tecido), os perfis do pedido
 * inteiro por perfil, a montagem por PARTE (o pedido é instalado por partes). E o layout: claro, objetivo,
 * visual e dentro de padrões internacionais.
 *
 * O padrão dos cinco documentos (o CSS está em producao.html):
 *   · bloco de identificação com os campos da ISO 7200 — dono (logo), tipo e título do documento, número
 *     de identificação, emissão, emitente, via; a folha x/y sai no rodapé de cada página;
 *   · controle de emissão e reimpressão por documento (ISO 9001, 7.5): a via impressa fica registrada;
 *   · A4 (ISO 216); unidade sempre escrita (m, cm), vírgula decimal;
 *   · gestão visual: desenho do rolo com as faixas, a barra com os cortes em escala, andamento em barras,
 *     caixa de "feito" por linha, visto no fim. A cor nunca vai sozinha: a PARTE é um número num quadro.
 *
 * Tudo vem de GET /api/pcp/pedido/producao (server/src/producao.js — a regra mora lá, com teste); esta
 * página só desenha. Nada de dinheiro.
 */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v, c) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: c == null ? 2 : c, maximumFractionDigits: c == null ? 2 : c }));
  const cm = (v) => num(v, 1);
  const qtd = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const pct = (a, b) => (Number(b) > 0 ? Math.round((Number(a) / Number(b)) * 100) : 0);
  const dataBR = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const quando = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2})$/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}` : String(s || ''); };
  const agora = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return `${z(d.getDate())}/${z(d.getMonth() + 1)}/${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`; };

  let csrfToken = '';
  async function api(path, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    opts.headers = opts.headers || {};
    if (opts.method && opts.method !== 'GET') {
      opts.headers['X-CSRF-Token'] = csrfToken;
      if (opts.body && typeof opts.body !== 'string') {
        opts.body = JSON.stringify(opts.body);
        opts.headers['Content-Type'] = 'application/json';
      }
    }
    const res = await fetch('../api/' + path, opts);
    if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Não autenticado'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro na requisição');
    return data;
  }

  // os documentos, na ordem das abas; `etapa` = a ordem de trabalho na fábrica
  const DOCS = [
    { k: 'partes', aba: 'Visão geral', titulo: 'ANDAMENTO DO PEDIDO', tipo: 'Acompanhamento da produção', cod: 'AP', sub: 'Andamento por parte · documentos do pedido' },
    { k: 'compra', aba: 'Lista de compra', titulo: 'LISTA DE COMPRA', tipo: 'Lista de materiais do pedido', cod: 'LC', sub: 'Tecido em rolos · perfis em barras · componentes em unidades' },
    { k: 'tecido', aba: 'Corte do tecido', curto: 'Tecido', titulo: 'CORTE DO TECIDO', tipo: 'Plano de corte', cod: 'CT', etapa: 1, sub: 'Pedido inteiro · uma largura de rolo por vez, rolo a rolo' },
    { k: 'perfis', aba: 'Corte dos perfis', curto: 'Perfis', titulo: 'CORTE DOS PERFIS', tipo: 'Plano de corte', cod: 'CP', etapa: 2, sub: 'Pedido inteiro · um perfil por vez, barra a barra' },
    { k: 'montagem', aba: 'Montagem', curto: 'Montagem', titulo: 'MONTAGEM E EMBALAGEM', tipo: 'Ordem de montagem', cod: 'MT', etapa: 3, sub: 'Uma parte por vez · cômodo a cômodo' },
  ];
  const DOC = (k) => DOCS.find((x) => x.k === k) || DOCS[0];
  const ETAPAS = DOCS.filter((x) => x.etapa).sort((a, b) => a.etapa - b.etapa);
  const estado = { pedido: '', doc: 'partes', parte: '', d: null, porId: new Map(), usuario: '', emissao: '', quadro: new Map(), quadroPeloNome: false };

  const peca = (id) => estado.porId.get(Number(id)) || null;
  /** "PP961-1" ou, sem etiqueta, "Item 3 · #2" */
  const idDaPeca = (p) => `<span class="etq">${p && p.etiqueta ? esc(p.etiqueta) : `Item ${p && p.item_seq != null ? p.item_seq : '?'} · #${p && p.numero != null ? p.numero : '?'}`}</span>`;

  // ── a PARTE num quadro com número: "PARTE 3" → 3; outros nomes → a ordem da parte no pedido ──
  function montarQuadros(partes) {
    const nomes = (partes || []).map((p) => p.parte);
    const pelosNomes = nomes.map((n) => { const m = /^parte\s+(\d{1,3})$/i.exec(String(n).trim()); return m ? m[1] : null; });
    const usaONome = pelosNomes.every(Boolean) && new Set(pelosNomes).size === pelosNomes.length;
    estado.quadroPeloNome = usaONome;
    estado.quadro = new Map(nomes.map((n, i) => [n, usaONome ? pelosNomes[i] : String(i + 1)]));
  }
  const temPartes = () => estado.quadro.size > 1;
  const pb = (parte) => (temPartes() && estado.quadro.has(parte) ? `<i class="pb" title="${esc(parte)}">${esc(estado.quadro.get(parte))}</i>` : '');
  function legendaDasPartes() {
    if (!temPartes()) return '';
    const exemplo = [...estado.quadro.entries()][0];
    const itens = estado.quadroPeloNome
      ? `<span><i class="pb">${esc(exemplo[1])}</i> = ${esc(exemplo[0])} — o número no quadro é a <b>parte</b> do pedido a que a peça pertence</span>`
      : [...estado.quadro.entries()].map(([nome, q]) => `<span><i class="pb">${esc(q)}</i> ${esc(nome)}</span>`).join('');
    return `<div class="legenda"><span class="rot">Parte</span>${itens}</div>`;
  }

  // ── o que já foi impresso deste documento (a montagem, também por parte) ──
  function registroDoDoc(k, parte) {
    const imp = (estado.d && estado.d.impressoes) || {};
    const reg = imp[k];
    if (!reg) return null;
    if (k === 'montagem') return (reg.partes || {})[parte || ''] || null;
    return reg;
  }

  // ── bloco de identificação (campos da ISO 7200) ──
  const idDoDocumento = (doc) => `PCP-${doc.cod}-${String(estado.pedido).replace(/^PED-/i, '')}${doc.k === 'montagem' && estado.parte ? ` · ${estado.parte}` : ''}`;
  function qrDoDocumento() {
    try {
      if (typeof qrcode !== 'function') return '';
      const u = new URL(window.location.href);
      u.searchParams.set('doc', estado.doc);
      const qr = qrcode(0, 'M');
      qr.addData(u.toString());
      qr.make();
      const n = qr.getModuleCount();
      const celulas = [];
      for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) celulas.push(`<rect x="${c}" y="${r}" width="1" height="1"/>`);
      return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" fill="#000" role="img" aria-label="Código QR: abre este documento atualizado"><title>Abre este documento atualizado</title>${celulas.join('')}</svg>`;
    } catch (e) { return ''; }
  }
  function bloco(opts) {
    const d = estado.d; const doc = DOC(estado.doc); const o = opts || {};
    const reg = registroDoDoc(doc.k, estado.parte);
    const via = !reg || !reg.vezes ? '<dd>ainda não impresso</dd>'
      : reg.vezes === 1 ? '<dd>1ª via</dd>' : `<dd class="reimp">REIMPRESSÃO · ${reg.vezes}ª via</dd>`;
    const etapas = doc.etapa
      ? `<div class="etapas">${ETAPAS.map((e, i) => `${i ? '<span class="seta"></span>' : ''}<span class="e${e.k === doc.k ? ' atual' : ''}"><i>${e.etapa}</i>${esc(e.curto)}</span>`).join('')}</div>`
      : `<div class="tb-tipo">${esc(doc.tipo)}</div>`;
    return `<header class="tb">
      <div class="tb-logo"><img src="assets/brand/logos/logo-preto.png" alt="Persianas Paraná"></div>
      <div class="tb-titulo">${etapas}<h1>${esc(o.titulo || doc.titulo)}</h1><div class="tb-sub">${esc(o.sub || doc.sub)}</div></div>
      <div class="tb-pedido"><span class="rot">Pedido</span><b>${esc(d.pedido)}</b><span class="cli">${esc(d.cliente || '')}</span><span class="qt">${d.resumo.pecas} peça(s) · ${d.resumo.itens} item(ns)${d.resumo.partes > 1 ? ` · ${d.resumo.partes} partes` : ''}</span></div>
      <div class="tb-qr">${qrDoDocumento()}</div>
      <dl class="tb-campos">
        <div><dt>Documento nº</dt><dd>${esc(idDoDocumento(doc))}</dd></div>
        <div><dt>Emissão</dt><dd>${esc(estado.emissao)}</dd></div>
        <div><dt>Emitido por</dt><dd>${esc(estado.usuario || '—')}</dd></div>
        <div><dt>Via</dt>${via}</div>
        <div><dt>Data prometida</dt><dd>${esc(dataBR(d.data_cliente) || '—')}</dd></div>
      </dl>
    </header>`;
  }
  /** rodapé de TODA folha impressa: documento · emissão, e "Folha x / y" */
  function cssDaFolha() {
    const doc = DOC(estado.doc);
    const s = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ');
    const esq = `${idDoDocumento(doc)}  ·  ${doc.titulo}  ·  emissão ${estado.emissao}  ·  Persianas Paraná — PCP`;
    const st = $('#css-folha');
    if (st) {
      st.textContent = `@page { size: A4; margin: 10mm 9mm 13mm 9mm;
        @bottom-left { content: "${s(esq)}"; font: 600 8px Manrope, Arial, sans-serif; color: #4B4B48; }
        @bottom-right { content: "Folha " counter(page) " / " counter(pages); font: 800 9px Manrope, Arial, sans-serif; color: #1D1D1B; } }`;
    }
  }

  // ── avisos (palavra de sinal), instruções numeradas, visto ──
  const atencao = (html) => `<div class="nt atencao"><span class="sinal">ATENÇÃO</span><div>${html}</div></div>`;
  function avisos(lista) {
    const l = lista || [];
    if (!l.length) return '';
    return l.slice(0, 8).map((a) => atencao(esc(a))).join('')
      + (l.length > 8 ? atencao(`… e mais ${l.length - 8} aviso(s) — veja a Ficha de Produção do pedido.`) : '');
  }
  const comoFazer = (passos) => `<div class="nt instr"><span class="sinal">COMO FAZER</span><ol>${passos.map((p) => `<li>${p}</li>`).join('')}</ol></div>`;
  const visto = (campos) => `<div class="visto">${campos.map((c) => `<div>${esc(c)}</div>`).join('')}</div>`;
  const fim = () => `<div class="fim"><span>PCP — Persianas Paraná · medidas e materiais pelo Núcleo de Produtos</span><span>${esc(idDoDocumento(DOC(estado.doc)))}</span></div>`;
  const kpi = (rot, valor, det) => `<div class="kpi"><div class="rot">${esc(rot)}</div><b>${valor}</b>${det ? `<div class="det">${det}</div>` : ''}</div>`;

  // ── VISÃO GERAL — andamento das partes e os documentos do pedido ─────────────────────────────
  function docPartes() {
    const d = estado.d;
    const setores = d.setores || [];
    const prog = (feitas, total, emCurso) => `<div class="pg"><span class="v">${feitas}<small> / ${total}</small></span><div class="trilho"><span style="width:${pct(feitas, total)}%"></span></div></div>${emCurso > 0 ? `<div class="sec2">+ ${emCurso} em curso</div>` : ''}`;
    const situacao = (a) => (a.na_expedicao ? '<span class="sit expedicao">Na expedição</span>'
      : a.pronta ? '<span class="sit pronta">Pronta</span><div class="sec2">avisar a expedição</div>'
        : (a.embaladas > 0 || a.setores.some((s) => s.iniciadas > 0)) ? '<span class="sit andando">Em produção</span>' : '<span class="sit">Aguardando</span>');
    const linha = (p) => {
      const a = p.andamento;
      const nComodos = p.comodos.filter((c) => c.comodo).length;
      return `<tr>
        <td class="parte"><b>${esc(p.parte)}</b>${nComodos ? `<div class="sec2">${nComodos} cômodo(s)</div>` : ''}</td>
        <td class="n forte">${p.pecas}</td>
        ${setores.map((s) => { const x = a.setores.find((y) => y.setor_id === s.id) || {}; return `<td>${prog(x.concluidas || 0, p.pecas, (x.iniciadas || 0) - (x.concluidas || 0))}</td>`; }).join('')}
        <td>${prog(a.embaladas, p.pecas, 0)}</td>
        <td>${prog(a.guardadas, p.pecas, 0)}</td>
        <td>${situacao(a)}</td></tr>`;
    };
    const imp = d.impressoes || {};
    const impressao = (k) => {
      const reg = imp[k];
      if (!reg || !reg.vezes) return '<span class="sec2">ainda não impresso</span>';
      const partes = k === 'montagem' ? Object.keys(reg.partes || {}).filter(Boolean) : [];
      return `<b>impresso ${reg.vezes}×</b> · última em ${esc(quando(reg.ultima))}${reg.por ? ` · ${esc(reg.por)}` : ''}${partes.length ? `<br><span class="sec2">partes já impressas: ${partes.map((x) => esc(x)).join(', ')}</span>` : ''}`;
    };
    const paraQuem = { compra: 'Compras · almoxarifado', tecido: 'Mesa de corte do tecido', perfis: 'Serra dos perfis', montagem: 'Bancada de montagem · embalagem' };
    const oQue = {
      compra: 'O que o pedido consome: tecido em rolos, perfis em barras, componentes.',
      tecido: 'O tecido do pedido inteiro: largura de rolo → rolo → faixa → peças.',
      perfis: 'Os perfis do pedido inteiro: perfil → barra → cortes.',
      montagem: 'Parte a parte: cômodo → peça, com as medidas e os componentes da parte.',
    };
    const t = d.tecido || [];
    return `${bloco()}
      ${avisos(d.avisos)}
      <div class="kpis">
        ${kpi('Peças', d.resumo.pecas, `${d.resumo.itens} item(ns) · ${d.resumo.partes} parte(s)`)}
        ${kpi('Embaladas', `${d.resumo.embaladas}<small> / ${d.resumo.pecas}</small>`, `${pct(d.resumo.embaladas, d.resumo.pecas)}% do pedido`)}
        ${kpi('Na expedição (gaveta)', `${d.resumo.guardadas}<small> / ${d.resumo.pecas}</small>`, `${pct(d.resumo.guardadas, d.resumo.pecas)}% do pedido`)}
        ${kpi('Partes prontas', `${d.resumo.partes_prontas}<small> / ${d.resumo.partes}</small>`, 'pronta = todas as peças embaladas')}
      </div>
      <h2>Andamento por parte</h2>
      <table class="andamento">
        <thead><tr><th>Parte</th><th class="n">Peças</th>${setores.map((s) => `<th>${esc(s.nome)}</th>`).join('')}<th>Embaladas</th><th>Na expedição</th><th style="width:112px">Situação</th></tr></thead>
        <tbody>${d.partes.map(linha).join('')}</tbody>
      </table>
      <div class="nota">Os setores contam as peças com a etapa concluída na bipagem. A parte fica <b>pronta</b> quando a última peça dela recebe a baixa da embalagem — é a hora de avisar a expedição para agendar a instalação daquela parte.</div>
      <h2>Documentos do pedido</h2>
      <table class="docs">
        <thead><tr><th class="c" style="width:46px">Etapa</th><th style="width:112px">Documento</th><th>O que traz</th><th style="width:150px">Para quem</th><th style="width:170px">Impressão</th><th class="no-print" style="width:70px"></th></tr></thead>
        <tbody>${['compra', 'tecido', 'perfis', 'montagem'].map((k) => { const x = DOC(k); return `<tr>
          <td class="c forte">${x.etapa || '—'}</td><td><b>${esc(x.aba)}</b></td><td>${esc(oQue[k])}</td><td>${esc(paraQuem[k])}</td><td class="st">${impressao(k)}</td>
          <td class="no-print c"><button class="btn" style="padding:4px 10px;font-size:11px" data-doc="${k}">Abrir</button></td></tr>`; }).join('')}</tbody>
      </table>
      ${t.length ? `<h2>Tecido do pedido</h2>
      <table><thead><tr><th>Coleção</th><th>Cor</th><th class="n">Largura do rolo</th><th class="n">Metros no plano</th><th class="n">Rolos</th><th class="n">Peças</th></tr></thead>
      <tbody>${t.map((x) => x.larguras.map((l) => `<tr><td><b>${esc(x.colecao)}</b></td><td>${esc(x.cor || '—')}</td><td class="n forte">${num(l.largura_rolo)} m</td><td class="n">${num(l.metros)} m</td><td class="n forte">${l.n_rolos != null ? `${l.n_rolos} × ${num(l.metros_rolo, 0)} m` : '—'}</td><td class="n">${l.pecas}</td></tr>`).join('')).join('')}</tbody></table>` : ''}
      ${fim()}`;
  }

  // ── CORTE DO TECIDO ──────────────────────────────────────────────────────────────────────────
  /** hachura a 45° de um retângulo, num traço só (um <pattern> do SVG deixava o PDF do pedido com 3,5 MB) */
  function hachura(x, y, w, h) {
    const passo = 5; const f1 = (v) => (Math.round(v * 10) / 10);
    let d = '';
    for (let c = passo; c < w + h; c += passo) {
      const x1 = c <= h ? x : x + c - h; const y1 = c <= h ? y + h - c : y;
      const x2 = c <= w ? x + c : x + w; const y2 = c <= w ? y + h : y + h - (c - w);
      d += `M${f1(x1)} ${f1(y1)}L${f1(x2)} ${f1(y2)}`;
    }
    return d ? `<path d="${d}" stroke="#B9B9B4" stroke-width="0.9" fill="none"/>` : '';
  }
  /** o rolo desenhado: as faixas na ordem, em escala no comprimento; dentro da faixa, as peças lado a lado */
  function desenhoDoRolo(l, r) {
    const W = 760; const topo = 15; const H = 78; const pe = 15;
    const usado = r.faixas.reduce((s, f) => s + f.comprimento_m, 0);
    const total = Math.max(Number(l.metros_rolo) || 0, usado) || 1;
    const sx = W / total;
    const larguraCm = Number(l.largura_rolo) * 100 || 1;
    const f2 = (v) => (Math.round(v * 100) / 100);
    const out = [];
    let x = 0;
    for (const f of r.faixas) {
      const w = f.comprimento_m * sx;
      // o fundo hachurado é o que sobra da faixa (lateral do rolo e fim da faixa)
      out.push(`<rect x="${f2(x)}" y="${topo}" width="${f2(w)}" height="${H}" fill="#fff" stroke="none"/>${hachura(x, topo, w, H)}`);
      let y = topo;
      for (const ref of f.pecas) {
        const p = peca(ref.id); const t = p ? p.tecido : null;
        const reservado = Number(t ? t.reservado_cm : ref.reservado_cm) || 0;
        const aoLongo = t ? (t.deitada ? t.corte_largura_cm : t.corte_altura_cm) : ref.corte_altura_cm;
        const h = Math.max(0, Math.min(topo + H - y, (reservado / larguraCm) * H));
        const wp = aoLongo ? Math.min(w, (Number(aoLongo) / 100) * sx) : w;
        if (h <= 0) continue;
        out.push(`<rect x="${f2(x)}" y="${f2(y)}" width="${f2(wp)}" height="${f2(h)}" fill="#F6F1E1" stroke="#1D1D1B" stroke-width="0.8"/>`);
        const rot = t && t.corte_largura_cm != null ? cm(t.deitada ? t.corte_altura_cm : t.corte_largura_cm) : '';
        if (rot && wp >= rot.length * 5.6 + 4 && h >= 11) out.push(`<text x="${f2(x + wp / 2)}" y="${f2(y + h / 2 + 3.4)}" text-anchor="middle" class="dz-p">${rot}</text>`);
        y += h;
      }
      out.push(`<rect x="${f2(x)}" y="${topo}" width="${f2(w)}" height="${H}" fill="none" stroke="#1D1D1B" stroke-width="1.1"/>`);
      const curto = String(f.n); const longo = `${f.n} · ${num(f.comprimento_m)} m`;
      const rotF = w >= longo.length * 5.9 + 4 ? longo : (w >= curto.length * 6.2 + 2 ? curto : '');
      if (rotF) out.push(`<text x="${f2(x + w / 2)}" y="${topo - 4}" text-anchor="middle" class="dz-f">${rotF}</text>`);
      x += w;
    }
    // a ponta que sobra no rolo
    if (W - x > 1) {
      out.push(`<rect x="${f2(x)}" y="${topo}" width="${f2(W - x)}" height="${H}" fill="#fff" stroke="#8E8E89" stroke-width="1" stroke-dasharray="4 3"/>`);
      if (W - x >= 74) out.push(`<text x="${f2(x + (W - x) / 2)}" y="${topo + H / 2 + 3.4}" text-anchor="middle" class="dz-s">sobra ${num(total - usado)} m</text>`);
    }
    // régua do comprimento
    const passo = total <= 12 ? 1 : (total <= 35 ? 5 : 10);
    for (let m = 0; m <= total + 0.001; m += passo) {
      const px = f2(m * sx);
      out.push(`<line x1="${px}" y1="${topo + H}" x2="${px}" y2="${topo + H + 4}" stroke="#6F6F69" stroke-width="1"/><text x="${px}" y="${topo + H + 13}" text-anchor="${m === 0 ? 'start' : (m >= total - 0.001 ? 'end' : 'middle')}" class="dz-r">${m} m</text>`);
    }
    return `<svg viewBox="0 0 ${W} ${topo + H + pe}" role="img" aria-label="Desenho do rolo${r.n != null ? ` ${r.n}` : ''}: ${r.faixas.length} faixa(s)">${out.join('')}</svg>`;
  }
  function linhasDaFaixa(f) {
    const n = f.pecas.length || 1;
    return f.pecas.map((ref, i) => {
      const p = peca(ref.id);
      const t = p ? p.tecido : {};
      const larg = p ? (t.corte_largura_cm != null ? t.corte_largura_cm : t.reservado_cm) : ref.reservado_cm;
      const alt = p ? (t.corte_altura_cm != null ? t.corte_altura_cm : t.altura_plano_cm) : ref.corte_altura_cm;
      const parte = p ? p.parte : ref.parte; const comodo = p ? p.comodo : ref.comodo;
      const deitada = p ? t.deitada : ref.deitada;
      return `<tr>
        ${i === 0 ? `<td class="fx" rowspan="${n}">${f.n}</td><td class="px" rowspan="${n}">${num(f.comprimento_m)} m</td>` : ''}
        <td>${p ? idDaPeca(p) : `<span class="etq">peça ${esc(ref.id)}</span>`}</td>
        <td class="n forte">${cm(larg)}</td>
        <td class="n forte">${cm(alt)}</td>
        <td><div class="onde">${pb(parte)}<span>${esc(comodo || (temPartes() ? '' : parte) || '')}${deitada ? ' <span class="sit">deitada</span>' : ''}</span></div></td>
        <td class="c"><span class="cx"></span></td></tr>`;
    }).join('');
  }
  function docTecido() {
    const d = estado.d;
    if (!d.tecido.length) {
      return `${bloco()}${avisos(d.avisos)}${atencao('Este pedido não tem plano de corte de tecido: o Núcleo de Produtos não respondeu, ou nenhuma peça entra no aproveitamento de rolo.')}${fim()}`;
    }
    const larguras = d.tecido.flatMap((t) => t.larguras.map((l) => ({ t, l })));
    const totRolos = larguras.every(({ l }) => l.n_rolos != null) ? larguras.reduce((s, { l }) => s + l.n_rolos, 0) : null;
    const totMetros = larguras.reduce((s, { l }) => s + l.metros, 0);
    const totPontas = larguras.every(({ l }) => l.ponta_m != null) ? larguras.reduce((s, { l }) => s + l.ponta_m, 0) : null;
    const porLargura = larguras.slice(0, larguras.length > 2 ? 4 : 2).map(({ t, l }) => kpi(`Rolo de ${num(l.largura_rolo)} m${d.tecido.length > 1 ? ` · ${t.colecao}` : ''}`,
      l.n_rolos != null ? `${l.n_rolos}<small> rolo(s) de ${num(l.metros_rolo, 0)} m</small>` : `${num(l.metros)}<small> m</small>`,
      `${num(l.metros)} m no plano · ${l.faixas} faixa(s) · ${l.pecas} peça(s)`)).join('');
    const doPedido = larguras.length <= 2 ? kpi('Tecido do pedido', totRolos != null ? `${totRolos}<small> rolo(s)</small>` : `${num(totMetros)}<small> m</small>`, `${num(totMetros)} m no plano · ${d.resumo.pecas} peça(s)`)
      + (totPontas != null ? kpi('Sobra nas pontas dos rolos', `${num(totPontas)}<small> m</small>`, 'volta ao estoque') : '') : '';
    const cartoes = porLargura + doPedido;
    let primeira = true;
    const blocos = larguras.map(({ t, l }) => {
      const quebra = primeira ? '' : ' quebra'; primeira = false;
      const semCadastro = l.metros_rolo_origem === 'padrao';
      const rolos = l.rolos.map((r) => `<section class="rolo">
          <div class="rolo-cab"><span class="g">${r.n != null ? `ROLO ${r.n} <span class="sec2" style="font-weight:600">de ${l.rolos.length}</span>` : 'FAIXAS'}</span>
            <span class="d">largura ${num(l.largura_rolo)} m · ${r.faixas.length} faixa(s) · usar ${num(r.usado_m)} m</span>
            <span class="dir">${r.excede ? 'FAIXA MAIOR QUE O ROLO' : (r.ponta_m != null ? `sobra no rolo ${num(r.ponta_m)} m` : '')}</span></div>
          <div class="rolo-dz">${desenhoDoRolo(l, r)}</div>
          <table>
            <thead><tr><th class="c">Faixa</th><th class="n">Puxar do rolo</th><th style="width:100px">Etiqueta</th><th class="n" style="width:84px">Largura (cm)</th><th class="n" style="width:84px">Altura (cm)</th><th>${temPartes() ? 'Parte · cômodo' : 'Ambiente'}</th><th class="c" style="width:46px">Feito</th></tr></thead>
            <tbody>${r.faixas.map(linhasDaFaixa).join('')}</tbody>
          </table>
        </section>`).join('');
      return `<div class="sec${quebra}"><span class="g">ROLO DE ${num(l.largura_rolo)} m</span><span class="d">${esc(t.colecao || '')}${t.cor ? ` · ${esc(t.cor)}` : ''}</span>
          <span class="dir">${l.n_rolos != null ? `${l.n_rolos} rolo(s) de ${num(l.metros_rolo, 0)} m · ` : ''}${num(l.metros)} m · ${l.pecas} peça(s)</span></div>
        ${semCadastro ? `<div class="nota">O tamanho do rolo (${num(l.metros_rolo, 0)} m) é o padrão geral: os metros por rolo desta largura não estão cadastrados no Núcleo de Produtos (Cadastros → Tecidos (coleções)). Se o rolo comprado tiver outro tamanho, cadastre e gere o plano de novo.</div>` : ''}
        ${rolos}`;
    }).join('');
    const fora = (d.tecido_fora_do_plano || []).map(peca).filter(Boolean);
    const blocoFora = fora.length ? `<div class="sec quebra"><span class="g">PEÇAS FORA DO PLANO</span><span class="d">cortar à parte, cada uma no seu rolo</span><span class="dir">${fora.length} peça(s)</span></div>
      <div class="nota">Peças que não entram no aproveitamento de rolo (Romana, painel, cortina, peça com emenda…).</div>
      <table><thead><tr><th style="width:118px">Etiqueta</th><th>Tecido</th><th class="n">Largura do rolo</th><th class="n">Largura (cm)</th><th class="n">Altura (cm)</th><th class="n">Metros</th><th>${temPartes() ? 'Parte · cômodo' : 'Ambiente'}</th><th class="c" style="width:48px">Feito</th></tr></thead>
      <tbody>${fora.map((p) => `<tr><td>${idDaPeca(p)}</td><td>${esc(p.colecao || '—')}${p.cor ? ` · ${esc(p.cor)}` : ''}</td><td class="n">${p.tecido.largura_rolo_m ? `${num(p.tecido.largura_rolo_m)} m` : '—'}</td><td class="n forte">${cm(p.tecido.corte_largura_cm)}</td><td class="n forte">${cm(p.tecido.corte_altura_cm)}</td><td class="n">${p.tecido.metros != null ? `${num(p.tecido.metros)} m` : '—'}</td><td><div class="onde">${pb(p.parte)}<span>${esc(p.comodo || (temPartes() ? '' : p.parte) || '')}</span></div></td><td class="c"><span class="cx"></span></td></tr>`).join('')}</tbody></table>` : '';
    const parecidos = d.tecido.flatMap((t) => t.nomes_parecidos || []);
    return `${bloco()}
      ${avisos(d.avisos)}
      ${parecidos.length ? atencao(`Cômodos de nomes parecidos em larguras de rolo diferentes: ${parecidos.map((g) => esc((g.comodos || []).map((c) => `${c.ambiente} (${num(c.largura_rolo)} m)`).join(' × '))).join(' · ')}. Se for o mesmo cômodo, corrija o Ambiente da peça na fila e gere o plano de novo.`) : ''}
      <div class="kpis">${cartoes}</div>
      ${comoFazer([
    '<b>Uma largura de rolo por vez.</b> Monte o rolo indicado e siga os rolos e as faixas na ordem.',
    '<b>Puxe do rolo</b> o comprimento da faixa e corte as peças dela lado a lado, na largura e na altura da linha.',
    `<b>Cole a etiqueta</b> na peça cortada, marque “feito” e separe ${temPartes() ? 'pela <b>parte</b> (o número no quadro) — a montagem é por parte' : 'para a montagem'}.`,
  ])}
      <div class="legenda"><span class="rot">Desenho</span><span><span class="amostra peca"></span>peça (o número é a largura de corte, em cm)</span><span><span class="amostra sobra"></span>sobra da faixa</span><span><span class="amostra ponta"></span>ponta do rolo</span></div>
      ${legendaDasPartes()}
      ${blocos}
      ${blocoFora}
      ${visto(['Cortado por', 'Data', 'Conferido por', 'Visto'])}
      ${fim()}`;
  }

  // ── CORTE DOS PERFIS ─────────────────────────────────────────────────────────────────────────
  // A barra desenhada tem ~530 px na folha A4 (a tela é mais larga): o que cabe em cada corte é decidido
  // pelo PAPEL. Corte curto demais para a etiqueta leva só a medida, e a etiqueta vai na linha de baixo.
  const BARRA_NO_PAPEL = 530;
  function linhaDaBarra(x, b) {
    const barraCm = Number(x.barra_m) * 100 || 600;
    const curtos = [];
    const segs = b.cortes.map((c) => {
      const p = peca(c.id);
      const naBarra = c.cm_na_barra != null ? c.cm_na_barra : c.cm;
      const larg = (Number(naBarra) / barraCm) * 100;
      const px = (larg / 100) * BARRA_NO_PAPEL - 5;
      const medida = cm(naBarra);
      const etiqueta = p ? (p.etiqueta || `Item ${p.item_seq != null ? p.item_seq : '?'} · #${p.numero != null ? p.numero : '?'}`) : '';
      const emenda = c.emenda ? `emenda ${c.emenda} · ` : '';
      const linha1 = medida.length * 7.4 + (p && pb(p.parte) ? 21 : 0);
      const linha2 = (emenda.length + etiqueta.length) * 5.9;
      if (px >= Math.max(linha1, linha2)) {
        return `<div class="seg" style="width:${larg.toFixed(3)}%"><b>${medida}${p ? pb(p.parte) : ''}</b><span class="etq">${esc(emenda)}${esc(etiqueta)}</span></div>`;
      }
      curtos.push(`<b>${medida}</b> ${esc(emenda)}<span class="etq">${esc(etiqueta)}</span> ${p ? pb(p.parte) : ''}`);
      return `<div class="seg estreito" style="width:${larg.toFixed(3)}%">${px >= medida.length * 5.9 ? `<b>${medida}</b>` : ''}</div>`;
    }).join('');
    const sobra = (Number(b.sobra_cm) / barraCm) * 100;
    const rotSobra = `sobra ${cm(b.sobra_cm)}`;
    const segSobra = sobra > 0.3 ? `<div class="seg sobra" style="width:${sobra.toFixed(3)}%">${(sobra / 100) * BARRA_NO_PAPEL >= rotSobra.length * 5.4 + 12 ? `<b>${rotSobra}</b>` : ''}</div>` : '';
    return `<div class="b-lin">
      <div class="bn">${b.n}</div>
      <div class="bd"><div class="bar">${segs}${segSobra}</div>${curtos.length ? `<div class="b-obs">cortes curtos, na ordem: ${curtos.join(' &nbsp;·&nbsp; ')}</div>` : ''}</div>
      <div class="bs">${cm(b.sobra_cm)}</div>
      <div class="bx"><span class="cx"></span></div>
    </div>`;
  }
  function docPerfis() {
    const d = estado.d;
    if (!d.perfis.length) {
      return `${bloco()}${avisos(d.avisos)}${atencao('Este pedido não tem cortes de perfil: o plano de corte por peça não veio do Núcleo de Produtos, ou as peças não têm plano de corte cadastrado.')}${fim()}`;
    }
    const totBarras = d.perfis.reduce((s, x) => s + x.n_barras, 0);
    const totCortes = d.perfis.reduce((s, x) => s + x.cortes, 0);
    const totMetros = d.perfis.reduce((s, x) => s + x.metros, 0);
    const totBarraM = d.perfis.reduce((s, x) => s + x.n_barras * x.barra_m, 0);
    const uso = (x) => pct(x.metros, x.n_barras * x.barra_m);
    const resumo = d.perfis.map((x) => `<tr><td><b>${esc(x.perfil)}</b></td><td class="n">${x.cortes}</td><td class="n">${num(x.metros)} m</td><td class="n forte">${x.n_barras} × ${num(x.barra_m)} m</td><td class="n">${num(x.sobra_m)} m</td><td><span class="uso"><span style="width:${uso(x)}%"></span></span>${uso(x)}%</td></tr>`).join('');
    const blocos = d.perfis.map((x, i) => `<div class="sec${i ? ' quebra' : ''}"><span class="g">${esc(String(x.perfil).toUpperCase())}</span><span class="d">barra de ${num(x.barra_m)} m</span>
        <span class="dir">${x.n_barras} barra(s) · ${x.cortes} corte(s) · ${num(x.metros)} m · sobra ${num(x.sobra_m)} m</span></div>
      <div class="barras">
        <div class="b-cab"><div>Barra</div><div>Cortes na ordem, em cm · etiqueta${temPartes() ? ' · parte' : ''}</div><div style="text-align:right">Sobra (cm)</div><div style="text-align:center">Feito</div></div>
        ${x.barras.map((b) => linhaDaBarra(x, b)).join('')}
      </div>`).join('');
    const formulas = (d.itens_por_formula || []).length ? `<h2>Itens por fórmula (sem medida de barra)</h2>
      <table><thead><tr><th>Item</th><th>Fórmula</th><th class="n">Peças</th></tr></thead><tbody>${d.itens_por_formula.map((f) => `<tr><td>${esc(f.perfil)}</td><td>${esc(f.formula || '')}</td><td class="n">${f.pecas}</td></tr>`).join('')}</tbody></table>` : '';
    const semCadastro = d.perfis.some((x) => x.barra_origem !== 'cadastro');
    return `${bloco()}
      ${avisos(d.avisos)}
      <div class="kpis">
        ${kpi('Barras', totBarras, `${d.perfis.length} perfil(is)`)}
        ${kpi('Cortes', totCortes, `${d.resumo.pecas} peça(s)`)}
        ${kpi('Metros cortados', `${num(totMetros)}<small> m</small>`, `de ${num(totBarraM)} m em barras`)}
        ${kpi('Aproveitamento', `${pct(totMetros, totBarraM)}<small> %</small>`, 'metros cortados ÷ metros de barra')}
      </div>
      ${comoFazer([
    '<b>Um perfil por vez.</b> Cada linha é uma barra: corte da esquerda para a direita, do maior para o menor.',
    `<b>Marque a etiqueta</b> da peça no corte${temPartes() ? ' e separe pela <b>parte</b> (o número no quadro), junto com o tecido' : ''}.`,
    'Marque “feito” na barra. A <b>sobra</b> hachurada volta ao estoque.',
  ])}
      <h2>Resumo por perfil</h2>
      <table><thead><tr><th>Perfil</th><th class="n">Cortes</th><th class="n">Metros</th><th class="n">Barras</th><th class="n">Sobra</th><th style="width:150px">Aproveitamento</th></tr></thead><tbody>${resumo}</tbody>
        <tfoot><tr><th>Total</th><th class="n">${totCortes}</th><th class="n">${num(totMetros)} m</th><th class="n">${totBarras} barra(s)</th><th class="n">${num(totBarraM - totMetros)} m</th><th><span class="uso"><span style="width:${pct(totMetros, totBarraM)}%"></span></span>${pct(totMetros, totBarraM)}%</th></tr></tfoot></table>
      ${semCadastro ? '<div class="nota">Barra de 6,00 m = padrão geral: o comprimento da barra deste perfil não está cadastrado no Núcleo de Produtos (Componentes → tamanho da barra). Se a barra comprada tiver outro tamanho, cadastre e gere o plano de novo.</div>' : ''}
      <div class="legenda"><span class="rot">Desenho</span><span><span class="amostra peca"></span>corte: a medida em cm e, embaixo, a etiqueta da peça</span><span><span class="amostra sobra"></span>sobra da barra</span></div>
      ${legendaDasPartes()}
      ${blocos}
      ${formulas}
      ${visto(['Cortado por', 'Data', 'Conferido por', 'Visto'])}
      ${fim()}`;
  }

  // ── MONTAGEM (por parte) ─────────────────────────────────────────────────────────────────────
  function docMontagem() {
    const d = estado.d;
    const partes = d.partes.filter((p) => !estado.parte || p.parte === estado.parte);
    // o que é igual nas peças sai UMA vez, numa linha de especificação (com os itens a que vale);
    // a peça fica numa linha só
    const especificacao = (p) => {
      const opcoes = [p.acionamento, p.acabamento, p.cor_perfil ? `perfil ${p.cor_perfil}` : null].filter(Boolean).join(' · ');
      const tecido = [p.colecao, p.cor].filter(Boolean).join(' · ');
      return `${esc(p.produto_nome || p.produto || '')}${p.modo === 'motor' ? ' · <b>MOTORIZADA</b>' : ''}${opcoes ? ` · ${esc(opcoes)}` : ''}${tecido ? ` · tecido <b>${esc(tecido)}</b>` : ''}${p.observacoes ? ` · <b>Obs.: ${esc(p.observacoes)}</b>` : ''}`;
    };
    const rotuloDosItens = (nums) => {
      const u = [...new Set(nums.filter((n) => n != null))].sort((a, b) => a - b);
      if (!u.length) return 'Item ?';
      if (u.length === 1) return `Item ${u[0]}`;
      const faixas = []; let ini = u[0]; let ant = u[0];
      for (let i = 1; i <= u.length; i += 1) {
        if (u[i] === ant + 1) { ant = u[i]; continue; }
        faixas.push(ini === ant ? `${ini}` : (ant === ini + 1 ? `${ini}, ${ant}` : `${ini} a ${ant}`));
        ini = u[i]; ant = u[i];
      }
      return `Itens ${faixas.join(', ')}`;
    };
    const linhaPeca = (p) => {
      const t = p.tecido;
      const cortes = p.cortes.map((c) => `<span class="corte">${esc(c.comp)} <b>${c.cm != null ? cm(c.cm) : esc(c.formula || '')}</b></span>`);
      if (t.corte_largura_cm != null || t.corte_altura_cm != null) {
        cortes.push(`<span class="corte">Tecido <b>${cm(t.corte_largura_cm)} × ${cm(t.corte_altura_cm)}</b>${t.rolo_m ? ` <span class="sec2">(rolo de ${num(t.rolo_m)} m${t.rolo_n != null ? ` · rolo ${t.rolo_n}` : ''}${t.faixa_n != null ? ` · faixa ${t.faixa_n}` : ''})</span>` : ''}</span>`);
      }
      return `<tr>
        <td>${idDaPeca(p)}${p.etiqueta && p.item_seq != null ? `<span class="doitem">item ${p.item_seq}</span>` : ''}</td>
        <td class="n forte">${cm(p.largura_cm)} × ${cm(p.altura_cm)}</td>
        <td>${cortes.join(' ') || '<span class="sec2">sem plano de corte no Núcleo — ver a Ficha de Produção</span>'}${p.aviso ? `<br><b>ATENÇÃO:</b> ${esc(p.aviso)}` : ''}</td>
        <td class="c"><span class="cx"></span></td><td class="c"><span class="cx"></span></td></tr>`;
    };
    const blocos = partes.map((parte, i) => {
      // a parte inteira com a mesma especificação: ela sai UMA vez, no cabeçalho da tabela (e se repete
      // sozinha a cada folha); senão, uma linha de especificação a cada grupo de peças iguais
      const specs = new Set(parte.comodos.flatMap((c) => c.pecas.map((id) => { const p = peca(id); return p ? especificacao(p) : null; })).filter(Boolean));
      const unica = specs.size === 1 ? [...specs][0] : null;
      const comodos = parte.comodos.map((c) => {
        // peças seguidas com a mesma especificação ficam sob um cabeçalho só
        const grupos = [];
        for (const id of c.pecas) {
          const p = peca(id);
          if (!p) continue;
          const spec = especificacao(p);
          const g = grupos[grupos.length - 1];
          if (g && g.spec === spec) { g.pecas.push(p); g.itens.push(p.item_seq); } else grupos.push({ spec, pecas: [p], itens: [p.item_seq] });
        }
        const linhas = grupos.map((g) => `${unica ? '' : `<tr class="item"><td colspan="5"><b>${rotuloDosItens(g.itens)}</b> · ${g.spec}</td></tr>`}${g.pecas.map(linhaPeca).join('')}`).join('');
        return `${c.comodo ? `<tr class="grupo"><th colspan="5"><span class="rot">Cômodo</span>${esc(c.comodo)} <span class="sec2">· ${c.pecas.length} peça(s)</span></th></tr>` : ''}${linhas}`;
      }).join('');
      const comp = parte.componentes.length ? `<h2>Componentes da ${esc(parte.parte)} — separar antes de montar</h2>
        <table><thead><tr><th style="width:170px">Código</th><th>Componente</th><th class="n" style="width:96px">Quantidade</th><th style="width:44px">Un.</th><th class="c" style="width:60px">Separado</th></tr></thead>
        <tbody>${parte.componentes.map((m) => `<tr><td class="etq" style="font-weight:500">${esc(m.sku || '—')}</td><td>${esc(m.descricao)}</td><td class="n forte">${qtd(m.qtd)}</td><td>${esc(m.un || '')}</td><td class="c"><span class="cx"></span></td></tr>`).join('')}</tbody></table>` : '';
      const nComodos = parte.comodos.filter((c) => c.comodo).length;
      const a = parte.andamento;
      return `<div class="sec${i ? ' quebra' : ''}"><span class="g">${esc(String(parte.parte).toUpperCase())}</span><span class="d">${parte.pecas} peça(s)${nComodos ? ` · ${nComodos} cômodo(s)` : ''}</span>
          <span class="dir">embaladas ${a.embaladas} / ${parte.pecas}</span></div>
        <table><thead>${unica ? `<tr class="item"><th colspan="5"><span class="rot">Todas as peças desta parte</span>${unica}</th></tr>` : ''}<tr><th style="width:104px">Etiqueta</th><th class="n" style="width:118px">Medida L × A (cm)</th><th>Conferir os cortes (cm) — perfis · tecido</th><th class="c" style="width:52px">Mont.</th><th class="c" style="width:52px">Emb.</th></tr></thead>
        <tbody>${comodos}</tbody></table>
        ${comp}
        ${visto(['Montado por', 'Data', 'Conferido e embalado por', 'Visto'])}`;
    }).join('');
    return `${bloco(estado.parte ? { sub: `${estado.parte} · cômodo a cômodo` } : null)}
      ${avisos(d.avisos)}
      ${comoFazer([
    '<b>Uma parte por vez.</b> Separe os componentes da parte (lista no fim da parte) antes de começar.',
    '<b>Confira pela etiqueta</b> o tecido e os perfis cortados com as medidas da linha, e monte.',
    'Marque <b>Mont.</b> e <b>Emb.</b> e dê a baixa da embalagem na bipagem. A última peça fecha a parte: <b>avise a expedição</b>.',
  ])}
      ${blocos || atencao('Nenhuma parte com este nome neste pedido.')}
      ${fim()}`;
  }

  // ── LISTA DE COMPRA ──────────────────────────────────────────────────────────────────────────
  function docCompra() {
    const d = estado.d; const c = d.compra;
    const rolos = c.tecido.reduce((s, t) => s + (t.n_rolos || 0), 0);
    const metrosComprar = c.tecido.reduce((s, t) => s + (Number(t.metros_a_comprar) || 0), 0);
    const metrosPlano = c.tecido.reduce((s, t) => s + (Number(t.metros) || 0), 0);
    const barras = c.perfis.reduce((s, x) => s + x.n_barras, 0);
    const tecido = c.tecido.length ? `<h2>Tecido — comprar em rolos</h2>
      <table><thead><tr><th>Coleção · cor</th><th class="n">Largura do rolo</th><th class="n">Comprar</th><th class="n">Metros a comprar</th><th class="n">No plano de corte</th><th class="n">Sobra nas pontas</th></tr></thead>
      <tbody>${c.tecido.map((t) => `<tr><td><b>${esc(t.colecao)}</b>${t.cor ? ` · ${esc(t.cor)}` : ''}</td><td class="n forte">${num(t.largura_rolo)} m</td><td class="n forte">${t.n_rolos != null ? `${t.n_rolos} rolo(s) de ${num(t.metros_rolo, 0)} m${t.metros_rolo_origem === 'padrao' ? ' *' : ''}` : '—'}</td><td class="n forte">${num(t.metros_a_comprar)} m</td><td class="n">${num(t.metros)} m</td><td class="n">${t.ponta_m != null ? `${num(t.ponta_m)} m` : '—'}</td></tr>`).join('')}</tbody></table>
      ${c.tecido.some((t) => t.metros_rolo_origem === 'padrao') ? '<div class="nota">* Tamanho padrão do rolo: os metros por rolo desta largura não estão cadastrados no Núcleo de Produtos (Cadastros → Tecidos (coleções)). Confirme o tamanho do rolo do fornecedor antes de comprar.</div>' : ''}` : '';
    const fora = (c.tecido_fora_do_plano || []).length ? `<h2>Tecido das peças fora do plano de corte</h2>
      <table><thead><tr><th>Coleção</th><th>Cor</th><th class="n">Largura do rolo</th><th class="n">Metros</th><th class="n">Peças</th></tr></thead>
      <tbody>${c.tecido_fora_do_plano.map((t) => `<tr><td><b>${esc(t.colecao || '—')}</b></td><td>${esc(t.cor || '—')}</td><td class="n">${t.largura_rolo ? `${num(t.largura_rolo)} m` : '—'}</td><td class="n forte">${num(t.metros)} m</td><td class="n">${t.pecas}</td></tr>`).join('')}</tbody></table>` : '';
    const perfis = c.perfis.length ? `<h2>Perfis e tubos — comprar em barras</h2>
      <table><thead><tr><th>Perfil</th><th class="n">Comprar</th><th class="n">Metros cortados</th><th class="n">Cortes</th><th class="n">Sobra</th></tr></thead>
      <tbody>${c.perfis.map((x) => `<tr><td><b>${esc(x.perfil)}</b></td><td class="n forte">${x.n_barras} barra(s) de ${num(x.barra_m)} m</td><td class="n">${num(x.metros)} m</td><td class="n">${x.cortes}</td><td class="n">${num(x.sobra_m)} m</td></tr>`).join('')}</tbody></table>` : '';
    const comp = c.componentes.length ? `<h2>Componentes — nas unidades da receita</h2>
      <div class="nota">Lista de materiais do Núcleo de Produtos, somada no pedido. Os perfis aparecem aqui pelo consumo da receita; para comprar perfil, valem as <b>barras</b> da tabela acima.</div>
      <table><thead><tr><th style="width:170px">Código</th><th>Componente</th><th class="n" style="width:110px">Quantidade</th><th style="width:48px">Un.</th></tr></thead>
      <tbody>${c.componentes.map((m) => `<tr><td class="etq" style="font-weight:500">${esc(m.sku || '—')}</td><td>${esc(m.descricao)}</td><td class="n forte">${qtd(m.qtd)}</td><td>${esc(m.un || '')}</td></tr>`).join('')}</tbody></table>` : '';
    const vazio = !tecido && !perfis && !comp ? atencao('A lista de materiais deste pedido não veio do Núcleo de Produtos.') : '';
    return `${bloco()}
      ${avisos(d.avisos)}
      <div class="kpis">
        ${kpi('Tecido', rolos ? `${rolos}<small> rolo(s)</small>` : `${num(metrosPlano)}<small> m</small>`, rolos ? `${num(metrosComprar)} m a comprar · ${num(metrosPlano)} m no plano` : 'pelos metros do plano de corte')}
        ${kpi('Perfis e tubos', `${barras}<small> barra(s)</small>`, `${c.perfis.length} perfil(is)`)}
        ${kpi('Componentes', c.componentes.length, 'itens da lista de materiais')}
        ${kpi('Peças do pedido', d.resumo.pecas, `${d.resumo.itens} item(ns) · ${d.resumo.partes} parte(s)`)}
      </div>
      <div class="nt instr"><span class="sinal">COMO USAR</span><div>Esta lista é o que o pedido <b>consome</b>, sem descontar o estoque. A <b>solicitação de compra</b> sai pelo PCP → <b>Necessidade de materiais</b> → horizonte “Pedidos” → <b>${esc(d.pedido)}</b> → Requisitar ao Compras (desconta o saldo, quando o de-para com o Compras existe).</div></div>
      ${vazio}${tecido}${fora}${perfis}${comp}
      ${visto(['Conferido por (PCP)', 'Data', 'Recebido por (Compras)', 'Visto'])}
      ${fim()}`;
  }

  const RENDER = { partes: docPartes, compra: docCompra, tecido: docTecido, perfis: docPerfis, montagem: docMontagem };

  // ── CONTROLE DE IMPRESSÃO — cada documento registra a sua (a montagem, também por parte) ──
  function avisoDeImpressao() {
    const imp = estado.d.impressoes || {};
    const linhas = [];
    const reg = imp[estado.doc];
    const nome = DOC(estado.doc).aba;
    if (estado.doc === 'montagem' && reg) {
      const partes = reg.partes || {};
      const inteiro = partes[''];
      const daParte = estado.parte ? partes[estado.parte] : null;
      if (estado.parte && daParte) linhas.push(`A montagem da <b>${esc(estado.parte)}</b> JÁ FOI impressa ${daParte.vezes}× — última em ${esc(quando(daParte.ultima))}${daParte.por ? ` por ${esc(daParte.por)}` : ''}.`);
      if (inteiro) linhas.push(`A montagem do <b>pedido inteiro</b> JÁ FOI impressa ${inteiro.vezes}× — última em ${esc(quando(inteiro.ultima))}${inteiro.por ? ` por ${esc(inteiro.por)}` : ''}.`);
      const outras = Object.keys(partes).filter((k) => k && k !== estado.parte);
      if (!estado.parte && outras.length) linhas.push(`Partes já impressas em separado: ${outras.map((k) => `${esc(k)} (${partes[k].vezes}×)`).join(', ')}.`);
    } else if (reg) {
      linhas.push(`O documento <b>${esc(nome)}</b> deste pedido JÁ FOI impresso ${reg.vezes}× — última em ${esc(quando(reg.ultima))}${reg.por ? ` por ${esc(reg.por)}` : ''}.`);
    }
    // o Plano de corte antigo (um documento só, por peça) também corta tecido e perfil
    if ((estado.doc === 'tecido' || estado.doc === 'perfis') && imp.plano_por_peca) {
      linhas.push(`O <b>Plano de corte por peça</b> deste pedido já foi impresso ${imp.plano_por_peca.vezes}× (última em ${esc(quando(imp.plano_por_peca.ultima))}) — confira se o corte já não foi feito por ele.`);
    }
    return linhas.length ? `<div class="nt atencao no-print" id="aviso-impressao"><span class="sinal">JÁ IMPRESSO</span><div>${linhas.join('<br>')}<br>Imprimir de novo fica registrado como REIMPRESSÃO e sai escrito na via.</div></div>` : '';
  }
  async function imprimirERegistrar() {
    try {
      const r = await api('pcp/pedido/producao/impressao', { method: 'POST', body: { pedido: estado.pedido, doc: estado.doc, parte: estado.doc === 'montagem' ? (estado.parte || null) : null } });
      if (r && r.impressoes) estado.d.impressoes = r.impressoes;
    } catch (e) {
      // sem registro o documento sai do mesmo jeito — a produção não para por causa do log
      window.alert('Não consegui registrar a impressão (' + e.message + ') — o documento será impresso sem registro.');
    }
    estado.emissao = agora();
    render(); // a via e a hora da emissão saem no papel
    window.print();
  }

  function render() {
    $('#abas').innerHTML = DOCS.map((x) => {
      const reg = (estado.d.impressoes || {})[x.k];
      return `<button class="aba${estado.doc === x.k ? ' ativa' : ''}" data-doc="${x.k}">${x.etapa ? `<span class="n">${x.etapa}</span>` : ''}${esc(x.aba)}${reg && reg.vezes ? `<span class="imp">impresso ${reg.vezes}×</span>` : ''}</button>`;
    }).join('');
    $('#filtro-parte').innerHTML = estado.doc === 'montagem' && estado.d.partes.length > 1
      ? `<select id="sel-parte" title="imprimir a montagem de uma parte só"><option value="">Todas as partes</option>${estado.d.partes.map((p) => `<option value="${esc(p.parte)}"${estado.parte === p.parte ? ' selected' : ''}>${esc(p.parte)} (${p.pecas} peças)</option>`).join('')}</select>` : '';
    $('#conteudo').innerHTML = avisoDeImpressao() + RENDER[estado.doc]();
    cssDaFolha();
    document.title = `${DOC(estado.doc).aba} — ${estado.d.pedido}`;
    const sel = $('#sel-parte');
    if (sel) {
      sel.onchange = () => {
        estado.parte = sel.value;
        const u = new URL(window.location.href);
        if (estado.parte) u.searchParams.set('parte', estado.parte); else u.searchParams.delete('parte');
        window.history.replaceState(null, '', u.toString());
        render();
      };
    }
  }

  function irPara(doc) {
    estado.doc = RENDER[doc] ? doc : 'partes';
    const u = new URL(window.location.href);
    u.searchParams.set('doc', estado.doc);
    window.history.replaceState(null, '', u.toString());
    render();
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-doc]');
    if (b) irPara(b.getAttribute('data-doc'));
  });

  (async () => {
    $('#btn-imprimir').onclick = imprimirERegistrar;
    $('#btn-fechar').onclick = () => window.close();
    const qs = new URLSearchParams(window.location.search);
    const pedido = qs.get('pedido');
    if (!pedido) {
      $('#conteudo').innerHTML = atencao('Informe o pedido na URL: <code>producao.html?pedido=PED-2026/0002</code>');
      return;
    }
    estado.pedido = pedido;
    estado.doc = RENDER[qs.get('doc')] ? qs.get('doc') : 'partes';
    estado.parte = qs.get('parte') || '';
    estado.emissao = agora();
    try {
      const sess = await api('auth/session');
      csrfToken = sess.csrf_token;
      estado.usuario = (sess.user && (sess.user.full_name || sess.user.username)) || '';
      estado.d = await api('pcp/pedido/producao?pedido=' + encodeURIComponent(pedido));
      estado.porId = new Map((estado.d.pecas || []).map((p) => [Number(p.id), p]));
      montarQuadros(estado.d.partes);
      if (estado.parte && !estado.d.partes.some((p) => p.parte === estado.parte)) estado.parte = '';
      render();
    } catch (e) {
      if (e.message !== 'Não autenticado') $('#conteudo').innerHTML = `<div class="nt atencao"><span class="sinal">ERRO</span><div>${esc(e.message)}</div></div>`;
    }
  })();
})();
