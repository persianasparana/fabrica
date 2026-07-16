/**
 * Etiquetas próprias do PCP (F2) — substituem as etiquetas do SYSOP.
 *
 * Usa os helpers globais do app.js (api, esc, toast, ehAdmin, podeVer,
 * podeEditar, SETORES) e o gerador de QR vendorizado (assets/vendor/qrcode.js).
 * O código de barras (Code 128 B) é gerado aqui mesmo, em SVG, sem lib.
 *
 * Fluxo do dia a dia: digitar o(s) pedido(s) → pré-visualizar (grupos por
 * setor, cada um com seu modelo) → imprimir tudo (uma janela por formato de
 * etiqueta) ou um setor por vez. Reimpressão avulsa por peça. O admin edita
 * os modelos (formato em mm, campos, tipo de código) no fim da página.
 */

let etqDados = null;      // última prévia { grupos, pedidos, avisos }
let etqPedidos = [];
let etqModelos = [];
let etqCampos = [];       // dicionário de campos do backend
let etqEditor = null;     // estado do editor de modelo (admin)

// ─── Code 128 (subset B) em SVG ──────────────────────────────────────────────
// Tabela padrão de larguras (índices 0..106; 106 = stop com barra final).
const C128 = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];

/** SVG do Code 128 B (largura proporcional; estica via CSS). */
function etqBarcodeSVG(texto) {
  const vals = [104]; // Start B
  for (const ch of String(texto)) {
    const v = ch.charCodeAt(0) - 32;
    if (v < 0 || v > 95) return null; // fora do subset B
    vals.push(v);
  }
  let soma = vals[0];
  for (let i = 1; i < vals.length; i++) soma += vals[i] * i;
  vals.push(soma % 103);
  vals.push(106); // Stop
  const seq = vals.map((v) => C128[v]).join('');
  let x = 0; const rects = []; let barra = true;
  for (const d of seq) {
    const w = Number(d);
    if (barra) rects.push(`<rect x="${x}" y="0" width="${w}" height="10" fill="#000"/>`);
    x += w; barra = !barra;
  }
  return `<svg viewBox="0 0 ${x} 10" preserveAspectRatio="none" ` +
    `style="width:100%;height:100%;display:block" xmlns="http://www.w3.org/2000/svg">${rects.join('')}</svg>`;
}

/** SVG do QR (conteúdo = link p/ abrir a peça no PCP pelo celular). */
function etqQRSVG(codigo) {
  try {
    const url = new URL('?codigo=' + encodeURIComponent(codigo), document.baseURI).href;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const cells = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) cells.push(`<rect x="${c}" y="${r}" width="1" height="1"/>`);
    }
    return `<svg viewBox="0 0 ${n} ${n}" style="width:100%;height:100%;display:block" ` +
      `shape-rendering="crispEdges" fill="#000" xmlns="http://www.w3.org/2000/svg">${cells.join('')}</svg>`;
  } catch (e) { return null; }
}

// ─── Valores dos campos ──────────────────────────────────────────────────────
function etqFmtData(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return (d && m && a) ? `${d}/${m}/${a.slice(2)}` : String(iso);
}

function etqValor(chave, e) {
  if (chave.startsWith('attr:')) {
    const v = (e.atributos || {})[chave.slice(5)];
    return v == null ? '' : String(v);
  }
  switch (chave) {
    case 'pedido': return e.pedido || '';
    case 'cliente': return e.cliente || '';
    case 'produto': return e.produto || '';
    case 'peca': return `${String(e.peca_numero).padStart(2, '0')}/${String(e.peca_total).padStart(2, '0')}`;
    case 'medidas': {
      const l = e.largura != null ? e.largura : null;
      const a = e.altura != null ? e.altura : null;
      if (l == null && a == null) return '';
      return `${l != null ? l : '?'} × ${a != null ? a : '?'} cm`;
    }
    case 'colecao': return e.colecao || '';
    case 'cor_tecido': return e.cor_tecido || '';
    case 'cor_perfil': return e.cor_perfil || '';
    case 'acionamento': return e.acionamento || '';
    case 'ambiente': return e.ambiente || '';
    case 'chegada_pcp': return etqFmtData(e.chegada_pcp);
    case 'data_cliente': return etqFmtData(e.data_cliente);
    case 'tipo': return e.tipo || '';
    case 'observacoes': return e.observacoes || '';
    case 'setor': return e.setor || '';
    case 'acabamento': return (e.atributos || {}).acabamento || '';
    case 'lado': return (e.atributos || {}).acionamento_lado || (e.atributos || {}).lado || '';
    case 'cor_componentes': return (e.atributos || {}).cor_componentes || '';
    case 'janela': return (e.atributos || {}).janela || '';
    case 'atributos': {
      const CONHECIDOS = new Set(['acabamento', 'acionamento_lado', 'lado', 'cor_componentes', 'janela']);
      return Object.entries(e.atributos || {})
        .filter(([k, v]) => !CONHECIDOS.has(k) && v != null && v !== '')
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(' · ');
    }
    case 'marca': return 'Persianas Paraná · Produzido no Brasil';
    default: return '';
  }
}

// ─── HTML de uma etiqueta (compartilhado: prévia e impressão) ────────────────
const ETQ_FONT = { P: '5pt', M: '6.5pt', G: '8.5pt' };

function etqHTML(e, modelo) {
  const cod = modelo.codigo || 'AMBOS';
  const temBarras = cod === 'BARRAS' || cod === 'AMBOS';
  const temQR = cod === 'QR' || cod === 'AMBOS';
  const campos = (modelo.campos || []).map((c) => {
    const v = etqValor(c.chave, e);
    if (!v) return '';
    const rot = c.rotulo ? `<span class="et-rot">${esc(c.rotulo)}:</span> ` : '';
    return `<span class="et-cp" style="font-size:${ETQ_FONT[c.tam] || ETQ_FONT.M};` +
      `${c.negrito ? 'font-weight:800;' : ''}">${rot}${esc(v)}</span>`;
  }).filter(Boolean).join('');

  const barras = temBarras ? `<div class="et-bar">${etqBarcodeSVG(e.codigo) ||
    '<span style="font-size:5pt">código inválido p/ barras</span>'}</div>` : '';
  const qr = temQR ? `<div class="et-qr">${etqQRSVG(e.codigo) || ''}</div>` : '';
  const blocoCod = (temBarras || temQR)
    ? `<div class="et-cod">${temBarras ? `${barras}<div class="et-num">${esc(e.codigo)}</div>` : `<div class="et-num">${esc(e.codigo)}</div>`}</div>${qr}`
    : `<div class="et-cod"><div class="et-num">${esc(e.codigo)}</div></div>`;

  return `<div class="et"><div class="et-campos">${campos}</div>${blocoCod}</div>`;
}

function etqCSS(modelo, paraImpressao) {
  const W = Number(modelo.largura_mm) || 100;
  const H = Number(modelo.altura_mm) || 24;
  const qrLado = Math.max(10, Math.min(H - 3, 20));
  return `
  .et { width:${W}mm; height:${H}mm; box-sizing:border-box; overflow:hidden;
        display:flex; align-items:stretch; gap:1.5mm; padding:1.2mm 1.6mm;
        font-family:Arial,Helvetica,sans-serif; color:#000; background:#fff;
        ${paraImpressao ? 'page-break-after:always;' : 'border:1px dashed #bbb; margin:0 8px 8px 0;'} }
  .et-campos { flex:1; min-width:0; display:flex; flex-wrap:wrap; align-content:flex-start;
               column-gap:2.2mm; row-gap:0.4mm; overflow:hidden; }
  .et-cp { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; line-height:1.15; }
  .et-rot { font-weight:400; font-size:80%; text-transform:uppercase; color:#000; }
  .et-cod { width:${Math.min(W * 0.32, 34)}mm; display:flex; flex-direction:column; justify-content:center; }
  .et-bar { height:${Math.max(6, H * 0.45)}mm; }
  .et-num { font-size:5.5pt; text-align:center; letter-spacing:.06em; margin-top:0.4mm; }
  .et-qr { width:${qrLado}mm; height:${qrLado}mm; align-self:center; flex:0 0 auto; }`;
}

// ─── Prévia ──────────────────────────────────────────────────────────────────
function etqLerPedidos() {
  return document.getElementById('etq-pedidos').value.split(',').map((s) => s.trim()).filter(Boolean);
}

async function etqPreview() {
  if (!ehAdmin() && !podeVer('etiquetas')) { toast('Sem permissão para as Etiquetas.'); return; }
  const pedidos = etqLerPedidos();
  const cont = document.getElementById('etq-conteudo');
  if (!pedidos.length) { toast('Informe ao menos um pedido.'); return; }
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Carregando prévia...</div>';
  document.getElementById('etq-avisos').innerHTML = '';
  etqPedidos = pedidos;
  try {
    const dados = await api('pcp/etiquetas/dados?pedidos=' + encodeURIComponent(pedidos.join(',')));
    etqDados = dados;
    etqRenderAvisos(dados.avisos || []);
    etqRenderPreview(dados);
  } catch (e) {
    cont.innerHTML = `<div style="color:var(--red);font-size:12px;padding:8px 0">${esc(e.message)}</div>`;
  }
}

function etqRenderAvisos(avisos) {
  const el = document.getElementById('etq-avisos');
  if (!avisos.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div style="background:var(--amber-bg);border:1px solid #FFA000;border-radius:8px;padding:10px 14px;margin-bottom:14px">
    <div style="font-size:12px;font-weight:700;color:var(--amber);margin-bottom:4px">⚠ Avisos</div>
    <ul style="margin:0;padding-left:18px;font-size:11px;color:var(--text2)">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
  </div>`;
}

const ETQ_PREVIA_MAX = 6; // etiquetas mostradas por setor na prévia

function etqRenderPreview(dados) {
  const cont = document.getElementById('etq-conteudo');
  const grupos = dados.grupos || [];
  if (!grupos.length) {
    cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nada para exibir (verifique os avisos acima).</div>';
    return;
  }
  const podeImp = ehAdmin() || podeEditar('etiquetas');
  const totalPecas = new Set(grupos.flatMap((g) => g.etiquetas.map((e) => e.peca_id))).size;

  const cabecalho = `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
    <div style="font-size:13px;font-weight:700">Prévia — ${totalPecas} peça(s) × ${grupos.length} setor(es): ${esc((dados.pedidos || etqPedidos).join(', '))}</div>
    ${podeImp ? `<button class="btn btn-black" style="margin-left:auto" onclick="etqImprimir(null)">🖨 Imprimir tudo</button>` : ''}
  </div>`;

  const secoes = grupos.map((g) => {
    const cor = g.setor.cor || '#606060';
    const amostra = g.etiquetas.slice(0, ETQ_PREVIA_MAX);
    const resto = g.etiquetas.length - amostra.length;
    return `<div class="card" style="margin-bottom:14px;border-left:4px solid ${cor}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span class="st-prod" style="background:${cor}22;color:${cor};border:1px solid ${cor}66;font-size:12px">${esc(g.setor.nome)}</span>
        <span style="font-size:11px;color:var(--text3)">${g.etiquetas.length} etiqueta(s) · modelo “${esc(g.modelo.nome)}” (${g.modelo.largura_mm}×${g.modelo.altura_mm} mm)</span>
        ${podeImp ? `<button class="btn btn-outline" style="margin-left:auto;font-size:10px" onclick="etqImprimir(${g.setor.id})">🖨 Imprimir só este setor</button>` : ''}
      </div>
      <style>${etqCSS(g.modelo, false)}</style>
      <div style="display:flex;flex-wrap:wrap;overflow-x:auto">
        ${amostra.map((e) => `<div style="position:relative">${etqHTML(e, g.modelo)}
          ${podeImp ? `<button class="btn btn-outline" title="Reimprimir só esta peça" style="position:absolute;top:2px;right:10px;font-size:9px;padding:1px 6px" onclick="etqReimprimirPeca(${e.peca_id}, ${g.setor.id})">↻</button>` : ''}
        </div>`).join('')}
      </div>
      ${resto > 0 ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">… e mais ${resto} etiqueta(s) deste setor (saem todas na impressão).</div>` : ''}
    </div>`;
  }).join('');

  const historico = `<div class="card"><div class="card-title">Histórico de impressão</div>
    <div id="etq-historico" style="font-size:12px;color:var(--text3)">Carregando…</div></div>`;

  cont.innerHTML = cabecalho + secoes + historico;
  etqCarregarHistorico();
}

async function etqCarregarHistorico() {
  const el = document.getElementById('etq-historico');
  if (!el) return;
  try {
    const rs = await Promise.all(etqPedidos.map((p) =>
      api('pcp/etiquetas/log?pedido=' + encodeURIComponent(p)).then((r) => r.data || []).catch(() => [])
    ));
    const vistos = new Set(); const linhas = [];
    rs.flat().forEach((l) => { if (!vistos.has(l.id)) { vistos.add(l.id); linhas.push(l); } });
    if (!linhas.length) { el.innerHTML = '<div style="color:var(--text3)">Nenhuma impressão registrada ainda.</div>'; return; }
    el.innerHTML = `<div class="tbl-wrap"><table style="font-size:11px">
      <thead><tr><th>Pedido(s)</th><th>Tipo</th><th>Peças</th><th>Por</th><th>Quando</th></tr></thead>
      <tbody>${linhas.map((l) => `<tr>
        <td>${esc((l.pedidos || []).join(', ') || l.pedido || '—')}</td>
        <td>${String(l.tipo || '').includes('reimp') ? '<span class="st st-atencao" style="font-size:9px">reimpressão</span>' : '<span class="st st-ok" style="font-size:9px">impressão</span>'}</td>
        <td>${l.qtd_pecas != null ? l.qtd_pecas : '—'}</td>
        <td>${esc(l.por_nome || '—')}</td>
        <td>${esc(l.quando || '—')}</td>
      </tr>`).join('')}</tbody></table></div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red)">${esc(e.message)}</div>`;
  }
}

// ─── Impressão ───────────────────────────────────────────────────────────────
async function etqImprimir(setorId, pecaIds) {
  if (!ehAdmin() && !podeEditar('etiquetas')) { toast('Sem permissão para imprimir etiquetas.'); return; }
  const body = {};
  if (pecaIds && pecaIds.length) body.peca_ids = pecaIds;
  else {
    if (!etqPedidos.length) { toast('Pré-visualize antes de imprimir.'); return; }
    body.pedidos = etqPedidos;
  }
  if (setorId != null) body.setor_ids = [setorId];
  try {
    const r = await api('pcp/etiquetas/imprimir', { method: 'POST', body });
    if (r.codigos_gerados > 0) toast(`${r.codigos_gerados} peça(s) ganharam código próprio agora.`);
    if (r.reimpressao) toast('Atenção: REIMPRESSÃO (estas peças já tiveram etiqueta impressa).');
    etqAbrirImpressao(r.grupos || []);
    etqCarregarHistorico();
  } catch (e) { toast('Erro ao imprimir: ' + e.message); }
}

function etqReimprimirPeca(pecaId, setorId) {
  etqImprimir(setorId, [pecaId]);
}

/** Abre UMA janela de impressão por formato (mm) — cada @page tem um tamanho só. */
function etqAbrirImpressao(grupos) {
  if (!grupos.length) { toast('Nada para imprimir.'); return; }
  const porFormato = new Map();
  for (const g of grupos) {
    const k = `${g.modelo.largura_mm}x${g.modelo.altura_mm}`;
    if (!porFormato.has(k)) porFormato.set(k, []);
    porFormato.get(k).push(g);
  }
  for (const [, gs] of porFormato) {
    const modelo = gs[0].modelo;
    const W = Number(modelo.largura_mm) || 100;
    const H = Number(modelo.altura_mm) || 24;
    const corpo = gs.map((g) =>
      `<style>${etqCSS(g.modelo, true)}</style>` +
      g.etiquetas.map((e) => etqHTML(e, g.modelo)).join('')
    ).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Etiquetas — ${esc(etqPedidos.join(', '))}</title>
<style>
  * { box-sizing:border-box; } body { margin:0; padding:0; }
  @page { size:${W}mm ${H}mm; margin:0; }
  @media print { .et { border:none !important; margin:0 !important; } }
</style></head>
<body>${corpo}
<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 250); };<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast('Permita pop-ups para imprimir as etiquetas.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }
}

// ─── Modelos (admin) ─────────────────────────────────────────────────────────
async function renderEtiquetas() {
  if (!ehAdmin() && !podeVer('etiquetas')) return;
  try {
    const [modelos, campos] = await Promise.all([
      api('pcp/etiquetas/modelos'), api('pcp/etiquetas/campos'),
    ]);
    etqModelos = modelos.data || [];
    etqCampos = campos.data || [];
  } catch (e) { toast(e.message); return; }
  if (ehAdmin()) etqRenderModelos();
}

function etqRenderModelos() {
  const box = document.getElementById('etq-modelos-box');
  if (!box) return;
  box.style.display = '';
  if (etqEditor) { etqRenderEditor(box); return; }
  const linhas = etqModelos.map((m) => {
    const setores = (m.setores || []).map((id) => {
      const s = (typeof SETORES !== 'undefined' ? SETORES : []).find((x) => Number(x.id) === Number(id));
      return s ? s.nome : `#${id}`;
    });
    return `<tr>
      <td><strong>${esc(m.nome)}</strong>${m.padrao ? ' <span class="st st-ok" style="font-size:9px">padrão</span>' : ''}</td>
      <td>${m.largura_mm} × ${m.altura_mm} mm</td>
      <td>${setores.length ? esc(setores.join(', ')) : '<span style="color:var(--text3)">todos os setores</span>'}</td>
      <td>${(m.campos || []).length} campo(s)</td>
      <td>${esc(m.codigo)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-outline" style="font-size:10px" onclick="etqEditarModelo(${m.id})">Editar</button>
        <button class="btn btn-outline" style="font-size:10px;color:var(--red);border-color:var(--red)" onclick="etqExcluirModelo(${m.id})">Excluir</button>
      </td>
    </tr>`;
  }).join('');
  box.innerHTML = `<div class="card" style="margin-top:6px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div class="card-title" style="margin:0">Modelos de etiqueta (admin)</div>
      <button class="btn btn-red" style="margin-left:auto;font-size:11px" onclick="etqEditarModelo(null)">+ Novo modelo</button>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:8px">
      Cada setor usa o primeiro modelo que o lista; um modelo com “todos os setores” é o coringa.
      Formato padrão atual: 100×24 mm (térmica contínua, Argox iX4-250). O código impresso pode ser
      barras (leitor da fábrica), QR (celular abre a peça no PCP) ou ambos.
    </div>
    <div class="tbl-wrap"><table style="font-size:12px">
      <thead><tr><th>Nome</th><th>Formato</th><th>Setores</th><th>Campos</th><th>Código</th><th></th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="6" style="color:var(--text3)">Nenhum modelo ativo.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

function etqEditarModelo(id) {
  const m = id != null ? etqModelos.find((x) => Number(x.id) === Number(id)) : null;
  etqEditor = m
    ? { id: Number(m.id), nome: m.nome, largura_mm: Number(m.largura_mm), altura_mm: Number(m.altura_mm),
        setores: (m.setores || []).map(Number), campos: (m.campos || []).map((c) => ({ ...c })),
        codigo: m.codigo, padrao: !!m.padrao }
    : { id: null, nome: '', largura_mm: 100, altura_mm: 24, setores: [], campos: [
        { chave: 'pedido', rotulo: 'Pedido', tam: 'G', negrito: true },
        { chave: 'peca', rotulo: 'Peça', tam: 'G', negrito: true },
        { chave: 'produto', rotulo: '', tam: 'G', negrito: true },
        { chave: 'medidas', rotulo: 'Med', tam: 'G', negrito: true },
      ], codigo: 'AMBOS', padrao: false };
  etqRenderModelos();
}

function etqEditorCampoRow(c, ix) {
  const opts = etqCampos.map((k) =>
    `<option value="${esc(k.chave)}" ${c.chave === k.chave ? 'selected' : ''}>${esc(k.rotulo)}</option>`
  ).join('');
  const ehAttr = String(c.chave).startsWith('attr:');
  return `<tr>
    <td style="white-space:nowrap">
      <select onchange="etqEdCampo(${ix},'chave',this.value)" style="font-size:11px">
        ${opts}
        <option value="attr:" ${ehAttr ? 'selected' : ''}>Atributo do Comercial…</option>
      </select>
      ${ehAttr ? `<input type="text" value="${esc(c.chave.slice(5))}" placeholder="chave do atributo"
        style="font-size:11px;width:110px" onchange="etqEdCampo(${ix},'chave','attr:'+this.value.trim())">` : ''}
    </td>
    <td><input type="text" value="${esc(c.rotulo || '')}" placeholder="(sem rótulo)" style="font-size:11px;width:90px"
        onchange="etqEdCampo(${ix},'rotulo',this.value)"></td>
    <td><select onchange="etqEdCampo(${ix},'tam',this.value)" style="font-size:11px">
      ${['P','M','G'].map((t) => `<option ${c.tam === t ? 'selected' : ''}>${t}</option>`).join('')}
    </select></td>
    <td style="text-align:center"><input type="checkbox" ${c.negrito ? 'checked' : ''} onchange="etqEdCampo(${ix},'negrito',this.checked)"></td>
    <td style="white-space:nowrap">
      <button class="btn btn-outline" style="font-size:10px;padding:1px 6px" onclick="etqEdMove(${ix},-1)">↑</button>
      <button class="btn btn-outline" style="font-size:10px;padding:1px 6px" onclick="etqEdMove(${ix},1)">↓</button>
      <button class="btn btn-outline" style="font-size:10px;padding:1px 6px;color:var(--red)" onclick="etqEdRemove(${ix})">✕</button>
    </td>
  </tr>`;
}

function etqRenderEditor(box) {
  const ed = etqEditor;
  const setores = (typeof SETORES !== 'undefined' ? SETORES : []);
  const setoresChk = setores.map((s) => `<label style="display:inline-flex;align-items:center;gap:4px;margin:2px 10px 2px 0;font-size:11px">
    <input type="checkbox" ${ed.setores.includes(Number(s.id)) ? 'checked' : ''} onchange="etqEdSetor(${Number(s.id)},this.checked)">${esc(s.nome)}
  </label>`).join('');
  box.innerHTML = `<div class="card" style="margin-top:6px;border-left:4px solid var(--red)">
    <div class="card-title">${ed.id ? 'Editar modelo' : 'Novo modelo'} de etiqueta</div>
    <div class="form-grid" style="margin-bottom:8px">
      <div class="form-group"><label>Nome *</label><input type="text" id="etq-ed-nome" value="${esc(ed.nome)}"></div>
      <div class="form-group"><label>Largura (mm)</label><input type="number" id="etq-ed-larg" value="${ed.largura_mm}" min="10" max="500" step="0.5"></div>
      <div class="form-group"><label>Altura (mm)</label><input type="number" id="etq-ed-alt" value="${ed.altura_mm}" min="10" max="500" step="0.5"></div>
      <div class="form-group"><label>Código impresso</label>
        <select id="etq-ed-codigo">${['AMBOS','BARRAS','QR','NENHUM'].map((c) => `<option ${ed.codigo === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
      </div>
      <div class="form-group"><label>Modelo padrão (coringa)</label>
        <select id="etq-ed-padrao"><option value="nao" ${!ed.padrao ? 'selected' : ''}>Não</option><option value="sim" ${ed.padrao ? 'selected' : ''}>Sim</option></select>
      </div>
    </div>
    <div style="margin-bottom:8px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Setores que usam este modelo (nenhum marcado = todos)</div>
      ${setoresChk || '<span style="font-size:11px;color:var(--text3)">Nenhum setor cadastrado.</span>'}
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Campos da etiqueta (na ordem de impressão)</div>
    <div class="tbl-wrap"><table style="font-size:11px">
      <thead><tr><th>Campo</th><th>Rótulo</th><th>Tam.</th><th>Negrito</th><th></th></tr></thead>
      <tbody>${ed.campos.map((c, ix) => etqEditorCampoRow(c, ix)).join('')}</tbody>
    </table></div>
    <button class="btn btn-outline" style="font-size:10px;margin-top:6px" onclick="etqEdAdd()">+ Adicionar campo</button>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-red" onclick="etqSalvarModelo()">Salvar modelo</button>
      <button class="btn btn-outline" onclick="etqEditor=null; etqRenderModelos()">Cancelar</button>
    </div>
  </div>`;
}

function etqEdCampo(ix, prop, valor) { if (etqEditor && etqEditor.campos[ix]) { etqEditor.campos[ix][prop] = valor; if (prop === 'chave') etqRenderModelos(); } }
function etqEdMove(ix, delta) {
  const c = etqEditor.campos; const j = ix + delta;
  if (j < 0 || j >= c.length) return;
  [c[ix], c[j]] = [c[j], c[ix]];
  etqRenderModelos();
}
function etqEdRemove(ix) { etqEditor.campos.splice(ix, 1); etqRenderModelos(); }
function etqEdAdd() { etqEditor.campos.push({ chave: 'pedido', rotulo: '', tam: 'M', negrito: false }); etqRenderModelos(); }
function etqEdSetor(id, on) {
  const s = etqEditor.setores;
  const ix = s.indexOf(Number(id));
  if (on && ix < 0) s.push(Number(id));
  if (!on && ix >= 0) s.splice(ix, 1);
}

async function etqSalvarModelo() {
  const ed = etqEditor;
  const body = {
    nome: document.getElementById('etq-ed-nome').value.trim(),
    largura_mm: Number(document.getElementById('etq-ed-larg').value),
    altura_mm: Number(document.getElementById('etq-ed-alt').value),
    codigo: document.getElementById('etq-ed-codigo').value,
    padrao: document.getElementById('etq-ed-padrao').value === 'sim',
    setores: ed.setores,
    campos: ed.campos.filter((c) => c.chave && c.chave !== 'attr:'),
  };
  if (!body.nome) { toast('Informe o nome do modelo.'); return; }
  try {
    if (ed.id) await api('pcp/etiquetas/modelos?id=' + ed.id, { method: 'PUT', body });
    else await api('pcp/etiquetas/modelos', { method: 'POST', body });
    toast('Modelo salvo.');
    etqEditor = null;
    await renderEtiquetas();
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

async function etqExcluirModelo(id) {
  if (!confirm('Desativar este modelo de etiqueta?')) return;
  try {
    await api('pcp/etiquetas/modelos?id=' + id, { method: 'DELETE' });
    toast('Modelo desativado.');
    await renderEtiquetas();
  } catch (e) { toast(e.message); }
}
