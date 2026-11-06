// ─── PLANEJAMENTO DE CARGA (P2 do planejamento de produção, 06/11/2026) ──────
// Calendário por setor: capacidade cadastrada (peças/dia útil) × peças
// programadas, fila sequenciada por prioridade / peça especial / data
// prometida; itens que vão atrasar; clique no dia lista as peças.
// Tudo vem de GET /api/pcp/carga (server/src/carga.js) — a tela não calcula.
let CARGA = null;

function cargaFmtDia(iso) {
  const d = parseDate(iso); if (!d) return iso || '';
  const sem = ['dom','seg','ter','qua','qui','sex','sáb'][d.getDay()];
  return `${sem} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
}
function cargaCorDia(d) {
  if (d.capacidade == null) return d.total ? 'var(--blue)' : 'var(--text3)';
  if (d.estourado) return 'var(--red)';
  if (d.ocupacao_pct >= 80) return 'var(--amber)';
  return d.total ? 'var(--green)' : 'var(--text3)';
}

async function renderCarga() {
  const cont = document.getElementById('carga-setores');
  if (!cont) return;
  const ini = document.getElementById('carga-inicio');
  if (ini && !ini.value) ini.value = new Date().toISOString().slice(0, 10);
  const semanas = document.getElementById('carga-semanas').value;
  cont.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:12px">Calculando a carga…</div>';
  try {
    CARGA = await api(`pcp/carga?inicio=${encodeURIComponent(ini.value)}&semanas=${encodeURIComponent(semanas)}`);
  } catch (e) {
    cont.innerHTML = `<div style="color:var(--red);font-size:12px;padding:12px">Erro ao calcular a carga: ${esc(e.message)}</div>`;
    return;
  }
  const c = CARGA;
  document.getElementById('carga-info').textContent =
    `${c.dias.length} dias úteis (${cargaFmtDia(c.dias[0])} → ${cargaFmtDia(c.dias[c.dias.length-1])}) · folga ${c.cfg.folga_dias} dia(s) antes da data prometida`;
  const m = document.getElementById('metrics-carga');
  m.innerHTML = `
    <div class="metric"><div class="metric-label">Peças abertas</div><div class="metric-value">${c.totais.pecas.toLocaleString('pt-BR')}</div><div class="metric-sub">${c.totais.itens} itens</div></div>
    <div class="metric"><div class="metric-label">Itens que vão atrasar</div><div class="metric-value" style="color:${c.totais.itens_atrasam?'var(--red)':'var(--green)'}">${c.totais.itens_atrasam}</div><div class="metric-sub">previsão após a data − folga</div></div>
    <div class="metric"><div class="metric-label">Setores estourados</div><div class="metric-value" style="color:${c.alertas.setores_estourados.length?'var(--red)':'var(--green)'}">${c.alertas.setores_estourados.length}</div><div class="metric-sub">${c.totais.pecas_alem_horizonte} peça(s) não cabem no horizonte</div></div>
    <div class="metric"><div class="metric-label">Sem roteiro / sem data</div><div class="metric-value" style="color:${(c.alertas.sem_roteiro||c.alertas.sem_data)?'var(--amber)':'var(--text3)'}">${c.alertas.sem_roteiro} / ${c.alertas.sem_data}</div><div class="metric-sub">peças sem setor · itens sem data prometida${c.alertas.roteiro_padrao?` · ${c.alertas.roteiro_padrao} com roteiro padrão`:''}</div></div>`;
  const avisoRot = c.alertas.roteiro_padrao
    ? `<div class="card" style="border-left:4px solid var(--amber);font-size:12px">⚠ <b>${c.alertas.roteiro_padrao} peça(s) sem roteiro cadastrado</b> (estrutura com roteiro vazio e linha sem cadastro): programadas em TODOS os setores, em ordem. Cadastre o roteiro na <a href="#" onclick="goTo('estrutura');return false">Estrutura do Produto</a> para o planejamento ficar exato.</div>`
    : '';
  const avisoCap = c.alertas.sem_capacidade.length
    ? `<div class="card" style="border-left:4px solid var(--amber);font-size:12px">⚠ Setor(es) <b>sem capacidade cadastrada</b>: ${c.alertas.sem_capacidade.map(esc).join(', ')} — o planejamento não limita esses setores (tudo cai no 1º dia). Cadastre a capacidade em <a href="#" onclick="goTo('setores');return false">Setores</a>.</div>`
    : '';
  cont.innerHTML = avisoRot + avisoCap + c.setores.map((s) => {
    const semanas = [];
    for (let i = 0; i < s.dias.length; i += c.cfg.dias_uteis.length || 5) semanas.push(s.dias.slice(i, i + (c.cfg.dias_uteis.length || 5)));
    return `<div class="card carga-setor" data-setor="${s.id}">
      <div class="card-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span class="st-prod" style="background:${s.cor}22;color:${s.cor};border:1px solid ${s.cor}66">${esc(s.nome)}</span>
        <span style="font-weight:400;font-size:11px;color:var(--text3)">${s.total_pendente} peça(s) a passar · capacidade
          ${ehAdmin()
            ? `<input type="number" min="0" step="1" value="${s.capacidade_dia!=null?s.capacidade_dia:''}" placeholder="sem limite" data-cap-setor="${s.id}" style="width:70px;padding:2px 6px;font-size:11px" onchange="cargaSalvarCapacidade(${s.id}, this.value)"> peças/dia`
            : `<b>${s.capacidade_dia!=null?s.capacidade_dia:'sem limite'}</b>${s.capacidade_dia!=null?' peças/dia':''}`}
          ${s.capacidade_horizonte!=null?` · ${s.capacidade_horizonte} no horizonte`:''}</span>
        ${s.dias_estourados ? `<span class="st st-vencido" style="font-size:9px">${s.dias_estourados} dia(s) estourado(s)</span>` : ''}
        ${s.alem_horizonte ? `<span class="st st-vencido" style="font-size:9px">${s.alem_horizonte} peça(s) além do horizonte</span>` : ''}
      </div>
      ${semanas.map((sem) => `<div class="carga-semana">${sem.map((d) => `
        <div class="carga-dia" data-setor="${s.id}" data-dia="${d.data}" onclick="cargaVerDia(${s.id}, '${d.data}')" title="${d.total} peça(s)${d.capacidade!=null?` de ${d.capacidade}`:''} — clique para listar" style="border-color:${cargaCorDia(d)}">
          <div class="carga-dia-data">${cargaFmtDia(d.data)}</div>
          <div class="carga-dia-total" style="color:${cargaCorDia(d)}">${d.total}${d.capacidade!=null?`<span style="color:var(--text3);font-weight:400;font-size:10px">/${d.capacidade}</span>`:''}</div>
          ${d.capacidade!=null?`<div class="carga-barra"><div style="width:${Math.min(100,d.ocupacao_pct)}%;background:${cargaCorDia(d)}"></div></div>`:''}
        </div>`).join('')}</div>`).join('')}
    </div>`;
  }).join('');
  const at = document.getElementById('carga-atrasos');
  at.innerHTML = c.alertas.itens_atrasam.length ? `<table>
    <thead><tr><th>Pedido</th><th>Produto</th><th>Peças</th><th>Prioridade</th><th>Data prometida</th><th>Limite (− folga)</th><th>Previsão</th></tr></thead>
    <tbody>${c.alertas.itens_atrasam.map((i) => `<tr>
      <td>${esc(i.pedido)}</td><td>${badgePrioridade(i)}${i.especial?'★ ':''}${esc(i.produto)}</td><td style="text-align:center">${i.pecas}</td>
      <td>${PRIORIDADES[Number(i.prioridade)||0].n}</td><td>${fmtDate(i.data_cliente)}</td><td>${fmtDate(i.data_limite)}</td>
      <td style="color:var(--red);font-weight:600">${i.alem_horizonte ? 'além do horizonte' : fmtDate(i.previsao)}</td>
    </tr>`).join('')}</tbody></table>` : '<div style="color:var(--green);font-size:12px">Nenhum item vai atrasar com a capacidade cadastrada.</div>';
  document.getElementById('carga-dia-card').style.display = 'none';
}

function cargaVerDia(setorId, dia) {
  if (!CARGA) return;
  const s = CARGA.setores.find((x) => x.id === setorId); if (!s) return;
  const d = s.dias.find((x) => x.data === dia); if (!d) return;
  document.getElementById('carga-dia-titulo').textContent = `${s.nome} — ${cargaFmtDia(dia)}: ${d.total} peça(s)${d.capacidade!=null?` de ${d.capacidade}`:''}`;
  document.getElementById('carga-dia').innerHTML = d.pecas.length ? `<table>
    <thead><tr><th>#</th><th>Pedido</th><th>Produto</th><th>Peça</th><th>Prioridade</th><th>Data prometida</th></tr></thead>
    <tbody>${d.pecas.map((p, i) => `<tr><td>${i+1}</td><td>${esc(p.pedido)}</td><td>${badgePrioridade(p)}${p.especial?'★ ':''}${esc(p.produto)}</td><td>${p.numero}</td><td>${PRIORIDADES[Number(p.prioridade)||0].n}</td><td>${fmtDate(p.data_cliente)}</td></tr>`).join('')}</tbody></table>`
    : '<div style="color:var(--text3);font-size:12px">Nenhuma peça programada neste dia.</div>';
  const card = document.getElementById('carga-dia-card');
  card.style.display = '';
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function cargaSalvarCapacidade(setorId, valor) {
  try {
    await api('pcp/setores?id=' + setorId, { method: 'PUT', body: { capacidade_dia: valor === '' ? null : valor } });
    if (typeof recarregarSetores === 'function') await recarregarSetores();
    toast('Capacidade do setor atualizada.');
    renderCarga();
  } catch (e) { toast('Erro: ' + e.message); }
}

async function cargaGravarPrevisoes() {
  if (!CARGA) { toast('Recalcule a carga primeiro.'); return; }
  if (!podeEditar('fila')) { toast('Você não tem permissão para editar a fila.'); return; }
  if (!confirm(`Gravar a previsão de término em "Prev. produção" de ${CARGA.itens.length} item(ns) aberto(s)? (os que não cabem no horizonte ficam como estão)`)) return;
  try {
    const r = await api('pcp/carga/previsoes', { method: 'POST', body: { inicio: document.getElementById('carga-inicio').value, semanas: document.getElementById('carga-semanas').value } });
    toast(`Previsões gravadas em ${r.gravados} item(ns)${r.sem_previsao ? ` · ${r.sem_previsao} sem previsão (fora do horizonte)` : ''}.`);
    if (typeof carregarDados === "function") carregarDados().then(() => { if (typeof renderAll === "function") renderAll(); });
  } catch (e) { toast('Erro: ' + e.message); }
}

async function cargaEditarCfg() {
  if (!ehAdmin()) { toast('Só o administrador altera o calendário.'); return; }
  let cfg;
  try { cfg = (await api('pcp/carga/cfg')).cfg; } catch (e) { toast('Erro: ' + e.message); return; }
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  document.getElementById('modal-title').textContent = 'Calendário do planejamento de carga';
  document.getElementById('modal-body-content').innerHTML = `
    <div class="form-group" style="grid-column:1/-1"><label>Dias úteis</label>
      <div style="display:flex;gap:10px;flex-wrap:wrap;font-size:12px">${dias.map((n, i) => `<label style="display:flex;align-items:center;gap:4px;text-transform:none;cursor:pointer"><input type="checkbox" class="carga-cfg-dia" value="${i}" ${cfg.dias_uteis.includes(i)?'checked':''} style="width:14px;height:14px;accent-color:var(--red)">${n}</label>`).join('')}</div>
    </div>
    <div class="form-group"><label>Folga antes da data prometida (dias)</label><input type="number" id="carga-cfg-folga" min="0" max="30" value="${cfg.folga_dias}"></div>
    <div class="form-group"><label>Horizonte padrão (semanas)</label><input type="number" id="carga-cfg-semanas" min="1" max="8" value="${cfg.semanas}"></div>
    <div style="grid-column:1/-1;font-size:11px;color:var(--text3)">A folga é o "colchão": item cuja previsão cai depois de (data prometida − folga) aparece como "vai atrasar".</div>`;
  document.getElementById('modal-footer').innerHTML = `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button><button class="btn btn-red" onclick="cargaSalvarCfg()">Salvar</button>`;
  document.getElementById('modal-overlay').classList.add('open');
}
async function cargaSalvarCfg() {
  const dias_uteis = [...document.querySelectorAll('.carga-cfg-dia:checked')].map((e) => Number(e.value));
  try {
    const r = await api('pcp/carga/cfg', { method: 'PUT', body: { dias_uteis, folga_dias: Number(document.getElementById('carga-cfg-folga').value), semanas: Number(document.getElementById('carga-cfg-semanas').value) } });
    closeModal(); toast('Calendário salvo.');
    const sel = document.getElementById('carga-semanas'); if (sel && r.cfg) sel.value = String(r.cfg.semanas);
    renderCarga();
  } catch (e) { toast('Erro: ' + e.message); }
}
