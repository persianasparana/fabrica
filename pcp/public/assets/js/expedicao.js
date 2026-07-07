/**
 * Expedição — gavetas (Fase C do ciclo do pedido) — UI.
 *
 * Usa os globais do app.js: api(), esc(), toast(), ehAdmin(), podeVer(),
 * podeEditar(). Fluxo do dia a dia: escolher a gaveta → bipar a etiqueta da
 * peça embalada → feedback grande. "Retirar" dá saída na instalação.
 * Mapa mostra o conteúdo de cada gaveta; a busca localiza um pedido inteiro.
 */

let expModo = 'guardar';   // 'guardar' | 'retirar'
let expGavetas = [];
let expEdGaveta = null;    // estado do editor de gaveta (admin)

function expSetModo(m) {
  expModo = m;
  const bg = document.getElementById('exp-modo-guardar');
  const br = document.getElementById('exp-modo-retirar');
  bg.className = m === 'guardar' ? 'btn btn-red' : 'btn btn-outline';
  br.className = m === 'retirar' ? 'btn btn-red' : 'btn btn-outline';
  document.getElementById('exp-gaveta-wrap').style.display = m === 'guardar' ? '' : 'none';
  document.getElementById('exp-codigo').focus();
}

async function renderExpedicao() {
  if (!ehAdmin() && !podeVer('expedicao')) return;
  await expCarregarGavetas();
  expSetModo(expModo);
  expCarregarMapa();
  if (ehAdmin() || podeEditar('expedicao')) expRenderGavetasAdmin();
}

async function expCarregarGavetas() {
  try {
    const r = await api('pcp/expedicao/gavetas');
    expGavetas = r.data || [];
  } catch (e) { toast(e.message); return; }
  const sel = document.getElementById('exp-gaveta');
  const atual = sel.value;
  sel.innerHTML = expGavetas.length
    ? expGavetas.map((g) => `<option value="${g.id}">${esc(g.nome)}${g.pecas ? ` (${g.pecas})` : ''}</option>`).join('')
    : '<option value="">— cadastre uma gaveta abaixo —</option>';
  if (atual && expGavetas.some((g) => String(g.id) === atual)) sel.value = atual;
}

// ─── Bipagem guardar/retirar ─────────────────────────────────────────────────
async function expBipar() {
  if (!ehAdmin() && !podeEditar('expedicao')) { toast('Sem permissão para a Expedição.'); return; }
  const inp = document.getElementById('exp-codigo');
  const codigo = inp.value.trim();
  if (!codigo) { toast('Bipe/digite o código da peça.'); return; }
  const fb = document.getElementById('exp-feedback');
  try {
    let r;
    if (expModo === 'guardar') {
      const gavetaId = Number(document.getElementById('exp-gaveta').value || 0);
      if (!gavetaId) { toast('Escolha a gaveta.'); return; }
      r = await api('pcp/expedicao/guardar', { method: 'POST', body: { codigo, gaveta_id: gavetaId } });
    } else {
      r = await api('pcp/expedicao/retirar', { method: 'POST', body: { codigo } });
    }
    expRenderFeedback(r);
    inp.value = '';
    inp.focus();
    expCarregarGavetas();
    expCarregarMapa();
  } catch (e) {
    fb.innerHTML = `<div style="background:#FDECEA;border:2px solid var(--red);border-radius:10px;padding:14px 16px;font-size:14px;font-weight:700;color:var(--red)">✕ ${esc(e.message)}</div>`;
    inp.select();
  }
}

const EXP_ACAO_LABEL = {
  guardada: '✔ GUARDADA', transferencia: '⇄ TRANSFERIDA',
  ja_estava: '• JÁ ESTAVA NESTA GAVETA', retirada: '⇧ RETIRADA',
};

function expRenderFeedback(r) {
  const fb = document.getElementById('exp-feedback');
  const p = r.peca || {};
  const pr = r.progresso || {};
  const verde = r.acao === 'guardada' || r.acao === 'retirada';
  const cor = verde ? '#2E7D32' : '#FFA000';
  const cicloMsg = r.ciclo && r.ciclo.ok && r.ciclo.para === 'NA_EXPEDICAO' && r.ciclo.de !== 'NA_EXPEDICAO'
    ? `<div style="margin-top:6px;font-size:12px;font-weight:800;color:#2E7D32">🏁 Pedido ${esc(p.pedido)} completo na expedição — status NA EXPEDIÇÃO enviado ao Comercial.</div>`
    : (r.ciclo && !r.ciclo.ok && r.ciclo.motivo !== 'nao_e_pedido_comercial'
      ? `<div style="margin-top:6px;font-size:11px;color:var(--amber)">⚠ Não consegui avisar o Comercial (${esc(String(r.ciclo.motivo || ''))}) — avance o status na aba Pedidos Comercial.</div>` : '');
  fb.innerHTML = `<div style="background:var(--surface);border:2px solid ${cor};border-radius:10px;padding:14px 16px">
    <div style="font-size:16px;font-weight:800;color:${cor}">${EXP_ACAO_LABEL[r.acao] || esc(r.acao)}
      ${r.gaveta ? ` — gaveta <span style="text-decoration:underline">${esc(r.gaveta.nome)}</span>` : ''}</div>
    <div style="font-size:13px;margin-top:4px"><b>${esc(p.codigo)}</b> · peça ${p.numero} · ${esc(p.produto || '')} · pedido <b>${esc(p.pedido || '')}</b>${p.cliente ? ` · ${esc(p.cliente)}` : ''}</div>
    ${p.gaveta_anterior ? `<div style="font-size:11px;color:var(--text3);margin-top:2px">Estava na gaveta ${esc(p.gaveta_anterior)}.</div>` : ''}
    <div style="font-size:12px;color:var(--text2);margin-top:6px">Pedido: ${pr.guardadas ?? '?'}/${pr.total ?? '?'} peça(s) guardada(s) · ${pr.embaladas ?? '?'} embalada(s).</div>
    ${cicloMsg}
  </div>`;
}

// ─── Localizar pedido ────────────────────────────────────────────────────────
async function expBuscarPedido() {
  const pedido = document.getElementById('exp-busca-pedido').value.trim();
  const out = document.getElementById('exp-pedido-resultado');
  if (!pedido) { out.innerHTML = ''; return; }
  out.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:6px 0">Buscando…</div>';
  try {
    const r = await api('pcp/expedicao/pedido?pedido=' + encodeURIComponent(pedido));
    const pr = r.progresso;
    out.innerHTML = `<div class="card" style="margin-bottom:14px;border-left:4px solid var(--red)">
      <div class="card-title">Pedido ${esc(r.pedido)} — ${pr.guardadas}/${pr.total} guardada(s) · ${pr.embaladas} embalada(s)</div>
      <div class="tbl-wrap"><table style="font-size:12px">
        <thead><tr><th>Código</th><th>Produto</th><th>Peça</th><th>Embalada</th><th>Gaveta</th><th>Guardada em</th></tr></thead>
        <tbody>${r.pecas.map((p) => `<tr>
          <td>${esc(p.cod_barras || '—')}</td>
          <td>${esc(p.produto)}</td>
          <td style="text-align:center">#${p.numero}</td>
          <td>${p.conclusao ? '<span class="st st-ok" style="font-size:9px">sim</span>' : '<span class="st st-atencao" style="font-size:9px">não</span>'}</td>
          <td>${p.gaveta_nome ? `<b>${esc(p.gaveta_nome)}</b>` : '<span style="color:var(--text3)">—</span>'}</td>
          <td>${esc(p.guardada_em || '—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div style="color:var(--red);font-size:12px;padding:6px 0">${esc(e.message)}</div>`;
  }
}

// ─── Mapa das gavetas ────────────────────────────────────────────────────────
async function expCarregarMapa() {
  const el = document.getElementById('exp-mapa');
  if (!el) return;
  try {
    const r = await api('pcp/expedicao/mapa');
    const gavetas = r.data || [];
    if (!gavetas.length) {
      el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:8px 0">Nenhuma gaveta cadastrada — cadastre abaixo (admin).</div>';
      return;
    }
    const podeEd = ehAdmin() || podeEditar('expedicao');
    el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
      ${gavetas.map((g) => {
        const pecas = g.pecas || [];
        return `<div class="card" style="margin:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="font-size:14px;font-weight:800">📦 ${esc(g.nome)}</span>
            <span style="font-size:11px;color:var(--text3)">${pecas.length} peça(s)</span>
          </div>
          ${g.descricao ? `<div style="font-size:10px;color:var(--text3);margin-bottom:6px">${esc(g.descricao)}</div>` : ''}
          ${pecas.length ? `<div style="max-height:180px;overflow-y:auto">${pecas.map((p) => `
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(p.pedido)}</b> · ${esc(p.produto)} #${p.numero}</span>
              <span style="color:var(--text3)">${esc(p.codigo || '')}</span>
              ${podeEd ? `<button class="btn btn-outline" style="font-size:9px;padding:1px 6px" title="Retirar da gaveta" onclick="expRetirarDireto('${esc(String(p.codigo || ''))}')">⇧</button>` : ''}
            </div>`).join('')}</div>`
          : '<div style="font-size:11px;color:var(--text3)">Vazia.</div>'}
        </div>`;
      }).join('')}
    </div>`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--red);font-size:12px;padding:6px 0">${esc(e.message)}</div>`;
  }
}

async function expRetirarDireto(codigo) {
  if (!codigo) return;
  if (!confirm(`Retirar a peça ${codigo} da gaveta (saída para instalação)?`)) return;
  try {
    const r = await api('pcp/expedicao/retirar', { method: 'POST', body: { codigo } });
    expRenderFeedback(r);
    expCarregarGavetas();
    expCarregarMapa();
  } catch (e) { toast(e.message); }
}

// ─── Cadastro de gavetas (admin/perm editar) ─────────────────────────────────
function expRenderGavetasAdmin() {
  const box = document.getElementById('exp-gavetas-admin');
  if (!box) return;
  const ed = expEdGaveta;
  box.innerHTML = `<div class="card" style="margin-top:14px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div class="card-title" style="margin:0">Gavetas (cadastro)</div>
      <button class="btn btn-red" style="margin-left:auto;font-size:11px" onclick="expEditarGaveta(null)">+ Nova gaveta</button>
    </div>
    ${ed ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px">
      <div><label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:3px">NOME *</label>
        <input type="text" id="exp-g-nome" value="${esc(ed.nome || '')}" placeholder="Ex: G-01" style="width:120px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></div>
      <div style="flex:1;min-width:160px"><label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:3px">DESCRIÇÃO</label>
        <input type="text" id="exp-g-desc" value="${esc(ed.descricao || '')}" placeholder="Ex: estante A, prateleira 3" style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></div>
      <div><label style="font-size:10px;font-weight:700;color:var(--text3);display:block;margin-bottom:3px">ORDEM</label>
        <input type="number" id="exp-g-ordem" value="${ed.ordem || 0}" style="width:70px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></div>
      <button class="btn btn-red" style="font-size:11px" onclick="expSalvarGaveta()">Salvar</button>
      <button class="btn btn-outline" style="font-size:11px" onclick="expEdGaveta=null; expRenderGavetasAdmin()">Cancelar</button>
    </div>` : ''}
    <div class="tbl-wrap"><table style="font-size:12px">
      <thead><tr><th>Nome</th><th>Descrição</th><th>Ordem</th><th>Peças</th><th></th></tr></thead>
      <tbody>${expGavetas.map((g) => `<tr>
        <td><b>${esc(g.nome)}</b></td>
        <td>${esc(g.descricao || '')}</td>
        <td style="text-align:center">${g.ordem}</td>
        <td style="text-align:center">${g.pecas}</td>
        <td style="white-space:nowrap">
          <button class="btn btn-outline" style="font-size:10px" onclick="expEditarGaveta(${g.id})">Editar</button>
          <button class="btn btn-outline" style="font-size:10px;color:var(--red);border-color:var(--red)" onclick="expExcluirGaveta(${g.id})">Excluir</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="5" style="color:var(--text3)">Nenhuma gaveta cadastrada.</td></tr>'}</tbody>
    </table></div>
  </div>`;
}

function expEditarGaveta(id) {
  const g = id != null ? expGavetas.find((x) => Number(x.id) === Number(id)) : null;
  expEdGaveta = g
    ? { id: Number(g.id), nome: g.nome, descricao: g.descricao, ordem: Number(g.ordem) || 0 }
    : { id: null, nome: '', descricao: '', ordem: (expGavetas.length + 1) * 10 };
  expRenderGavetasAdmin();
  setTimeout(() => document.getElementById('exp-g-nome')?.focus(), 60);
}

async function expSalvarGaveta() {
  const ed = expEdGaveta;
  const body = {
    nome: document.getElementById('exp-g-nome').value.trim(),
    descricao: document.getElementById('exp-g-desc').value.trim(),
    ordem: Number(document.getElementById('exp-g-ordem').value) || 0,
  };
  if (!body.nome) { toast('Informe o nome da gaveta.'); return; }
  try {
    if (ed.id) await api('pcp/expedicao/gavetas?id=' + ed.id, { method: 'PUT', body });
    else await api('pcp/expedicao/gavetas', { method: 'POST', body });
    toast('Gaveta salva.');
    expEdGaveta = null;
    await expCarregarGavetas();
    expRenderGavetasAdmin();
    expCarregarMapa();
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

async function expExcluirGaveta(id) {
  if (!confirm('Excluir esta gaveta? (só é possível se estiver vazia)')) return;
  try {
    await api('pcp/expedicao/gavetas?id=' + id, { method: 'DELETE' });
    toast('Gaveta excluída.');
    await expCarregarGavetas();
    expRenderGavetasAdmin();
    expCarregarMapa();
  } catch (e) { toast(e.message); }
}
