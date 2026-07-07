/**
 * Regras de seleção automática da Estrutura do Produto (F3) — UI.
 *
 * Renderizada dentro da aba "Estrutura do Produto" (#regras-box). Usa os
 * globais do app.js: api(), esc(), toast(), podeVer(), podeEditar(),
 * ESTRUTURA (catálogo), carregarDados(), renderAll().
 *
 * A primeira regra (menor prioridade) cujas condições TODAS casem vence.
 * "Testar com uma peça de exemplo" mostra qual regra venceria sem gravar.
 */

let rgRegras = [];
let rgCampos = null;   // { campos: [...], operadores: { texto, numero } }
let rgEditor = null;   // estado do editor (null = tabela)
let rgTesteResultado = '';

async function renderRegrasEstrutura() {
  const box = document.getElementById('regras-box');
  if (!box) return;
  if (!ehAdmin() && !podeVer('estrutura')) { box.innerHTML = ''; return; }
  try {
    if (!rgCampos) rgCampos = await api('pcp/estrutura-regras/campos');
    const r = await api('pcp/estrutura-regras');
    rgRegras = r.data || [];
  } catch (e) {
    box.innerHTML = `<div class="card" style="color:var(--red);font-size:12px">${esc(e.message)}</div>`;
    return;
  }
  if (rgEditor) { rgRenderEditor(box); return; }
  rgRenderTabela(box);
}

function rgOpRotulo(op) {
  const todos = [...rgCampos.operadores.texto, ...rgCampos.operadores.numero];
  const o = todos.find((x) => x.op === op);
  return o ? o.rotulo : op;
}

function rgCampoRotulo(campo) {
  if (String(campo).startsWith('attr:')) return `atributo “${campo.slice(5)}”`;
  const c = rgCampos.campos.find((x) => x.chave === campo);
  return c ? c.rotulo : campo;
}

function rgResumoConds(conds) {
  return (conds || []).map((c) =>
    `${rgCampoRotulo(c.campo)} <b>${esc(rgOpRotulo(c.operador))}</b> ${esc(String(c.valor))}` +
    (c.operador === 'entre' ? ` e ${esc(String(c.valor2))}` : '')
  ).join(' <span style="color:var(--text3)">E</span> ');
}

function rgRenderTabela(box) {
  const podeEd = ehAdmin() || podeEditar('estrutura');
  const linhas = rgRegras.map((r) => `<tr style="${r.ativo ? '' : 'opacity:.5'}">
    <td style="text-align:center;font-weight:700">${r.prioridade}</td>
    <td>${esc(r.descricao)}${r.ativo ? '' : ' <span class="st" style="font-size:9px">inativa</span>'}</td>
    <td style="font-size:11px">${rgResumoConds(r.condicoes)}</td>
    <td><b>${esc(r.produto_nome)}</b>${r.produto_ativo ? '' : ' <span class="st st-atencao" style="font-size:9px">produto inativo</span>'}</td>
    ${podeEd ? `<td style="white-space:nowrap">
      <button class="btn btn-outline" style="font-size:10px" onclick="rgEditar(${r.id})">Editar</button>
      <button class="btn btn-outline" style="font-size:10px;color:var(--red);border-color:var(--red)" onclick="rgExcluir(${r.id})">Excluir</button>
    </td>` : ''}
  </tr>`).join('');

  box.innerHTML = `<div class="card" style="border-left:4px solid var(--red)">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">
      <div class="card-title" style="margin:0">Seleção automática da estrutura (regras)</div>
      ${podeEd ? `<div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-outline" style="font-size:11px" onclick="rgAplicar(false)">▶ Aplicar nos itens sem estrutura</button>
        <button class="btn btn-outline" style="font-size:11px" onclick="rgAplicar(true)" title="Reavalia TODOS os itens em aberto — sobrescreve escolhas manuais">⟳ Reavaliar tudo</button>
        <button class="btn btn-red" style="font-size:11px" onclick="rgEditar(null)">+ Nova regra</button>
      </div>` : ''}
    </div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
      Ao liberar um pedido do Comercial, a PRIMEIRA regra (menor prioridade) cujas condições todas
      casem define a Estrutura do Produto do item — os cortes da Ordem de Corte saem sozinhos.
      Sem regra que case, o item entra como <b>“estrutura pendente”</b> na fila (escolha manual, nada trava).
    </div>
    ${rgRegras.length ? `<div class="tbl-wrap"><table style="font-size:12px">
      <thead><tr><th style="width:50px">Prior.</th><th>Regra</th><th>Condições (todas = E)</th><th>Estrutura destino</th>${podeEd ? '<th></th>' : ''}</tr></thead>
      <tbody>${linhas}</tbody>
    </table></div>` : '<div style="font-size:12px;color:var(--text3);padding:6px 0">Nenhuma regra cadastrada ainda.</div>'}

    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:10px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">🧪 Testar com uma peça de exemplo (não grava nada)</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        ${rgTesteInput('produto', 'Tipo da peça', 'Ex: Persiana Rolô Premium', 200)}
        ${rgTesteInput('colecao', 'Coleção', 'Ex: Luminous Sheer', 150)}
        ${rgTesteInput('cor_tecido', 'Cor do tecido', '', 120)}
        ${rgTesteInput('acionamento', 'Acionamento', '', 110)}
        ${rgTesteInput('largura', 'Largura (cm)', '', 90, 'number')}
        ${rgTesteInput('altura', 'Altura (cm)', '', 90, 'number')}
        ${rgTesteInput('qnt', 'Qtd', '', 60, 'number')}
        <button class="btn btn-black" style="font-size:11px" onclick="rgTestar()">Testar</button>
      </div>
      <div id="rg-teste-resultado" style="margin-top:8px">${rgTesteResultado}</div>
    </div>
  </div>`;
}

function rgTesteInput(id, label, ph, w, type) {
  return `<div>
    <label style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:3px">${esc(label)}</label>
    <input type="${type || 'text'}" id="rg-t-${id}" placeholder="${esc(ph)}" style="width:${w}px;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text)">
  </div>`;
}

async function rgTestar() {
  const v = (id) => document.getElementById('rg-t-' + id).value.trim();
  const spec = {
    produto: v('produto'), colecao: v('colecao'), cor_tecido: v('cor_tecido'),
    acionamento: v('acionamento'),
    largura: v('largura') || null, altura: v('altura') || null, qnt: v('qnt') || null,
  };
  const el = document.getElementById('rg-teste-resultado');
  try {
    const r = await api('pcp/estrutura-regras/testar', { method: 'POST', body: { spec } });
    rgTesteResultado = r.vencedora
      ? `<div style="background:var(--surface);border:2px solid #2E7D32;border-radius:8px;padding:8px 12px;font-size:12px">
          ✅ Venceria a regra <b>#${r.vencedora.prioridade} — ${esc(r.vencedora.descricao)}</b>
          → estrutura <b>${esc(r.vencedora.estrutura)}</b></div>`
      : `<div style="background:var(--amber-bg);border:1px solid #FFA000;border-radius:8px;padding:8px 12px;font-size:12px">
          ⚠ Nenhuma das ${r.total_regras} regra(s) ativa(s) casa com essa spec — o item ficaria como <b>estrutura pendente</b>.</div>`;
    el.innerHTML = rgTesteResultado;
  } catch (e) { el.innerHTML = `<div style="color:var(--red);font-size:12px">${esc(e.message)}</div>`; }
}

async function rgAplicar(sobrescrever) {
  const msg = sobrescrever
    ? 'Reavaliar TODOS os itens em aberto da fila?\n\nATENÇÃO: estruturas já definidas (inclusive escolhidas manualmente) serão sobrescritas quando alguma regra casar.'
    : 'Aplicar as regras nos itens em aberto que estão SEM estrutura?';
  if (!confirm(msg)) return;
  try {
    const r = await api('pcp/estrutura-regras/aplicar', { method: 'POST', body: { sobrescrever } });
    toast(`Regras aplicadas: ${r.avaliados} avaliado(s), ${r.aplicados} atualizado(s), ${r.pendentes} pendente(s).`);
    if (typeof carregarDados === 'function') { await carregarDados(); if (typeof renderAll === 'function') renderAll(); }
  } catch (e) { toast('Erro ao aplicar: ' + e.message); }
}

// ─── Editor ──────────────────────────────────────────────────────────────────
function rgEditar(id) {
  const r = id != null ? rgRegras.find((x) => Number(x.id) === Number(id)) : null;
  rgEditor = r
    ? { id: Number(r.id), descricao: r.descricao, produto_id: Number(r.produto_id),
        prioridade: Number(r.prioridade), ativo: r.ativo !== false,
        condicoes: (r.condicoes || []).map((c) => ({ ...c })) }
    : { id: null, descricao: '', produto_id: '', prioridade: rgProximaPrioridade(), ativo: true,
        condicoes: [{ campo: 'produto', operador: 'e', valor: '' }] };
  renderRegrasEstrutura();
}

function rgProximaPrioridade() {
  const max = rgRegras.reduce((m, r) => Math.max(m, Number(r.prioridade) || 0), 0);
  return max + 10;
}

function rgCondRow(c, ix) {
  const ehAttr = String(c.campo).startsWith('attr:');
  const tipo = ehAttr ? 'texto'
    : ((rgCampos.campos.find((x) => x.chave === c.campo) || {}).tipo || 'texto');
  const ops = rgCampos.operadores[tipo];
  const optsCampo = rgCampos.campos.map((k) =>
    `<option value="${esc(k.chave)}" ${c.campo === k.chave ? 'selected' : ''}>${esc(k.rotulo)}</option>`).join('');
  return `<tr>
    <td style="white-space:nowrap">
      <select onchange="rgEdCond(${ix},'campo',this.value)" style="font-size:11px">
        ${optsCampo}
        <option value="attr:" ${ehAttr ? 'selected' : ''}>Atributo do Comercial…</option>
      </select>
      ${ehAttr ? `<input type="text" value="${esc(String(c.campo).slice(5))}" placeholder="chave do atributo"
        style="font-size:11px;width:110px" onchange="rgEdCond(${ix},'campo','attr:'+this.value.trim())">` : ''}
    </td>
    <td><select onchange="rgEdCond(${ix},'operador',this.value)" style="font-size:11px">
      ${ops.map((o) => `<option value="${o.op}" ${c.operador === o.op ? 'selected' : ''}>${esc(o.rotulo)}</option>`).join('')}
    </select></td>
    <td>
      <input type="${tipo === 'numero' ? 'number' : 'text'}" value="${esc(String(c.valor ?? ''))}"
        style="font-size:11px;width:${tipo === 'numero' ? 80 : 160}px" onchange="rgEdCond(${ix},'valor',this.value)">
      ${c.operador === 'entre' ? ` e <input type="number" value="${esc(String(c.valor2 ?? ''))}"
        style="font-size:11px;width:80px" onchange="rgEdCond(${ix},'valor2',this.value)">` : ''}
    </td>
    <td><button class="btn btn-outline" style="font-size:10px;padding:1px 6px;color:var(--red)" onclick="rgEdRemove(${ix})">✕</button></td>
  </tr>`;
}

function rgRenderEditor(box) {
  const ed = rgEditor;
  const prods = (typeof ESTRUTURA !== 'undefined' ? ESTRUTURA : []);
  const optsProd = prods.map((p) =>
    `<option value="${p.id}" ${Number(ed.produto_id) === Number(p.id) ? 'selected' : ''}>${esc(p.nome)} (${esc(p.familia)})</option>`).join('');
  box.innerHTML = `<div class="card" style="border-left:4px solid var(--red)">
    <div class="card-title">${ed.id ? 'Editar regra' : 'Nova regra'} de estrutura</div>
    <div class="form-grid" style="margin-bottom:8px">
      <div class="form-group" style="grid-column:span 2"><label>Descrição *</label>
        <input type="text" id="rg-ed-desc" value="${esc(ed.descricao)}" placeholder="Ex: Rolô Premium com tecido Sheer"></div>
      <div class="form-group"><label>Estrutura destino *</label>
        <select id="rg-ed-produto"><option value="">— escolha —</option>${optsProd}</select></div>
      <div class="form-group"><label>Prioridade (menor avalia primeiro)</label>
        <input type="number" id="rg-ed-prio" value="${ed.prioridade}"></div>
      <div class="form-group"><label>Ativa</label>
        <select id="rg-ed-ativo"><option value="sim" ${ed.ativo ? 'selected' : ''}>Sim</option><option value="nao" ${!ed.ativo ? 'selected' : ''}>Não</option></select></div>
    </div>
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Condições — TODAS precisam casar (E)</div>
    <div class="tbl-wrap"><table style="font-size:11px">
      <thead><tr><th>Campo</th><th>Operador</th><th>Valor</th><th></th></tr></thead>
      <tbody>${ed.condicoes.map((c, ix) => rgCondRow(c, ix)).join('')}</tbody>
    </table></div>
    <button class="btn btn-outline" style="font-size:10px;margin-top:6px" onclick="rgEdAdd()">+ Adicionar condição</button>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn btn-red" onclick="rgSalvar()">Salvar regra</button>
      <button class="btn btn-outline" onclick="rgEditor=null; renderRegrasEstrutura()">Cancelar</button>
    </div>
  </div>`;
}

function rgEdCond(ix, prop, valor) {
  const c = rgEditor.condicoes[ix];
  if (!c) return;
  c[prop] = valor;
  if (prop === 'campo') {
    // troca de tipo pode invalidar o operador — volta pro primeiro do tipo
    const tipo = String(valor).startsWith('attr:') ? 'texto'
      : ((rgCampos.campos.find((x) => x.chave === valor) || {}).tipo || 'texto');
    if (!rgCampos.operadores[tipo].some((o) => o.op === c.operador)) c.operador = rgCampos.operadores[tipo][0].op;
    renderRegrasEstrutura();
  }
  if (prop === 'operador') renderRegrasEstrutura();
}

function rgEdAdd() { rgEditor.condicoes.push({ campo: 'colecao', operador: 'contem', valor: '' }); renderRegrasEstrutura(); }
function rgEdRemove(ix) { rgEditor.condicoes.splice(ix, 1); renderRegrasEstrutura(); }

async function rgSalvar() {
  const ed = rgEditor;
  const body = {
    descricao: document.getElementById('rg-ed-desc').value.trim(),
    produto_id: Number(document.getElementById('rg-ed-produto').value) || null,
    prioridade: Number(document.getElementById('rg-ed-prio').value),
    ativo: document.getElementById('rg-ed-ativo').value === 'sim',
    condicoes: ed.condicoes,
  };
  if (!body.descricao) { toast('Informe a descrição da regra.'); return; }
  if (!body.produto_id) { toast('Escolha a estrutura destino.'); return; }
  try {
    if (ed.id) await api('pcp/estrutura-regras?id=' + ed.id, { method: 'PUT', body });
    else await api('pcp/estrutura-regras', { method: 'POST', body });
    toast('Regra salva.');
    rgEditor = null;
    renderRegrasEstrutura();
  } catch (e) { toast('Erro ao salvar: ' + e.message); }
}

async function rgExcluir(id) {
  if (!confirm('Excluir esta regra? (os itens já classificados não mudam)')) return;
  try {
    await api('pcp/estrutura-regras?id=' + id, { method: 'DELETE' });
    toast('Regra excluída.');
    renderRegrasEstrutura();
  } catch (e) { toast(e.message); }
}
