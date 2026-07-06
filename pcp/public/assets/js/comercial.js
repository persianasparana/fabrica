/**
 * PCP — aba "Pedidos Comercial" (ciclo do pedido, Fase B).
 * Ver agenda-consultores/docs/CICLO-DO-PEDIDO.md.
 *
 * "Para avaliar": pedidos aprovados no financeiro (EM_ANALISE_PCP) — o PCP
 * DEVOLVE ao vendedor (motivo) ou LIBERA pra produção (importa os itens
 * pra Fila de Produção automaticamente, sem digitar de novo).
 * "Em produção": estado federado dos pedidos liberados — avança
 * EM_PRODUCAO → EMBALADO → NA_EXPEDICAO (o rastreio fino por setor continua
 * na Fila de Produção/Bipagem, que é soberana aqui dentro).
 *
 * Usa os globais do app.js: api(), esc(), toast(), podeEditar().
 */
/* global api, esc, toast, podeEditar */

let comAbaAtual = 'avaliar';
const COM_STATUS_LABEL = {
  EM_ANALISE_PCP: 'Em análise do PCP',
  LIBERADO_PRODUCAO: 'Liberado p/ produção',
  EM_PRODUCAO: 'Em produção',
  EMBALADO: 'Embalado',
  NA_EXPEDICAO: 'Na expedição',
};
const COM_PROXIMO = {
  LIBERADO_PRODUCAO: 'EM_PRODUCAO',
  EM_PRODUCAO: 'EMBALADO',
  EMBALADO: 'NA_EXPEDICAO',
};

function comercialAba(aba) {
  comAbaAtual = aba;
  document.querySelectorAll('[data-com-aba]').forEach((b) => {
    b.classList.toggle('btn-outline', b.dataset.comAba !== aba);
    b.classList.toggle('btn-black', b.dataset.comAba === aba);
  });
  renderComercial();
}

function comBrl(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function renderComercial() {
  const alvo = document.getElementById('com-lista');
  alvo.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:12px 0">Carregando…</div>';
  try {
    if (comAbaAtual === 'avaliar') {
      const { data } = await api('comercial/pedidos?status=EM_ANALISE_PCP');
      document.getElementById('com-count').textContent = `${data.length} pedido(s) aguardando avaliação`;
      alvo.innerHTML = data.length
        ? data.map(comCardAvaliar).join('')
        : '<div style="color:var(--text3);font-size:12px;padding:12px 0">Nenhum pedido aguardando avaliação do PCP. 🎉</div>';
    } else {
      const statuses = ['LIBERADO_PRODUCAO', 'EM_PRODUCAO', 'EMBALADO'];
      const listas = await Promise.all(statuses.map((s) => api(`comercial/pedidos?status=${s}`)));
      const data = listas.flatMap((l) => l.data);
      document.getElementById('com-count').textContent = `${data.length} pedido(s) em produção`;
      alvo.innerHTML = data.length
        ? `<table><thead><tr><th>Pedido</th><th>Cliente</th><th>Valor</th><th>Status</th><th>Prazo</th><th></th></tr></thead><tbody>${data.map(comLinhaProducao).join('')}</tbody></table>`
        : '<div style="color:var(--text3);font-size:12px;padding:12px 0">Nenhum pedido do Comercial em produção.</div>';
    }
  } catch (e) {
    alvo.innerHTML = `<div style="color:var(--danger,#c33);font-size:12px;padding:12px 0">${esc(e.message)}</div>`;
  }
}

function comPrazo(p) {
  if (!p.aprovadoFinanceiroEm || p.prazoEntregaDias == null) return '—';
  const d = new Date(p.aprovadoFinanceiroEm);
  d.setDate(d.getDate() + Number(p.prazoEntregaDias));
  return d.toLocaleDateString('pt-BR');
}

function comCardAvaliar(p) {
  const acoes = podeEditar('comercial')
    ? `<div style="display:flex;gap:8px;margin-top:8px">
         <button class="btn btn-black" onclick="comLiberar('${p.id}','${esc(p.pedidoCodigo)}')">✓ Liberar produção</button>
         <button class="btn btn-outline" onclick="comDevolver('${p.id}','${esc(p.pedidoCodigo)}')">↩ Devolver ao vendedor</button>
         <button class="btn btn-outline" onclick="comDetalhe('${p.id}')">Ver peças</button>
       </div>`
    : `<div style="margin-top:8px"><button class="btn btn-outline" onclick="comDetalhe('${p.id}')">Ver peças</button></div>`;
  return `<div class="card" style="margin-bottom:10px">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:baseline">
      <b>${esc(p.pedidoCodigo || '—')}</b>
      <span>${esc(p.client?.nome || '—')}</span>
      <span style="color:var(--text3)">vendedor: ${esc(p.consultor?.nome || '—')}</span>
      <span>${comBrl(p.valorTotal)}</span>
      <span style="color:var(--text3)">prazo: ${comPrazo(p)}</span>
    </div>
    <div id="com-det-${p.id}"></div>
    ${acoes}
  </div>`;
}

function comLinhaProducao(p) {
  const prox = COM_PROXIMO[p.pedidoStatus];
  const btn = prox && podeEditar('comercial')
    ? `<button class="btn btn-outline" onclick="comStatus('${p.id}','${prox}')">→ ${esc(COM_STATUS_LABEL[prox])}</button>`
    : '';
  return `<tr>
    <td><b>${esc(p.pedidoCodigo || '—')}</b></td>
    <td>${esc(p.client?.nome || '—')}</td>
    <td>${comBrl(p.valorTotal)}</td>
    <td>${esc(COM_STATUS_LABEL[p.pedidoStatus] || p.pedidoStatus || '—')}</td>
    <td>${comPrazo(p)}</td>
    <td>${btn}</td>
  </tr>`;
}

async function comDetalhe(id) {
  const alvo = document.getElementById('com-det-' + id);
  if (!alvo) return;
  if (alvo.innerHTML) { alvo.innerHTML = ''; return; } // toggle
  alvo.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:6px 0">Carregando peças…</div>';
  try {
    const p = await api('comercial/pedidos/' + id);
    const linhas = (p.itens || []).map((it) => {
      const med = Number(it.larguraCm) > 0
        ? `${(Number(it.larguraCm) / 100).toFixed(2)}×${(Number(it.alturaCm) / 100).toFixed(2)}m`
        : '—';
      return `<tr>
        <td>${it.quantidade}× ${esc(it.tipo || '—')}</td>
        <td>${esc([it.colecao, it.corTecido].filter(Boolean).join(' · ') || '—')}</td>
        <td>${med}</td>
        <td>${esc(it.ambiente || '—')}</td>
        <td>${esc(it.observacoesTecnicas || '')}</td>
      </tr>`;
    }).join('');
    alvo.innerHTML = `<table style="margin-top:8px"><thead><tr><th>Peça</th><th>Coleção · Cor</th><th>Med.</th><th>Ambiente</th><th>Obs. técnicas</th></tr></thead><tbody>${linhas}</tbody></table>
      ${p.observacoes ? `<div style="font-size:12px;color:var(--text3);margin-top:6px">Obs. do pedido: ${esc(p.observacoes)}</div>` : ''}`;
  } catch (e) {
    alvo.innerHTML = `<div style="color:var(--danger,#c33);font-size:12px">${esc(e.message)}</div>`;
  }
}

async function comLiberar(id, codigo) {
  if (!confirm(`Liberar o pedido ${codigo} para produção?\n\nOs itens serão importados automaticamente para a Fila de Produção.`)) return;
  try {
    const r = await api(`comercial/pedidos/${id}/liberar`, { method: 'POST', body: {} });
    toast(r.jaNaFila
      ? `${codigo} liberado (itens já estavam na fila).`
      : `${codigo} liberado — ${r.importados} item(ns) importado(s) pra Fila de Produção.`);
    renderComercial();
    if (typeof carregarDados === 'function') carregarDados(); // refresca a fila local
  } catch (e) { toast('Erro: ' + e.message); }
}

async function comDevolver(id, codigo) {
  const motivo = prompt(`O que precisa ser corrigido no pedido ${codigo}?\n(O vendedor recebe este motivo e devolve o pedido corrigido.)`);
  if (!motivo || !motivo.trim()) return;
  try {
    await api(`comercial/pedidos/${id}/devolver`, { method: 'POST', body: { motivo: motivo.trim() } });
    toast(`${codigo} devolvido ao vendedor.`);
    renderComercial();
  } catch (e) { toast('Erro: ' + e.message); }
}

async function comStatus(id, status) {
  try {
    await api(`comercial/pedidos/${id}/status`, { method: 'POST', body: { status } });
    toast(`Status atualizado: ${COM_STATUS_LABEL[status]}.`);
    renderComercial();
  } catch (e) { toast('Erro: ' + e.message); }
}
