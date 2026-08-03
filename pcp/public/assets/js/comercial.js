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
  const fichas = p.pedidoCodigo
    ? `<button class="btn btn-outline" style="font-size:10px" title="Ficha de produção (specs completas pra bancada)" onclick="abrirFichaProducao('${esc(p.pedidoCodigo)}')">🗒 Ficha</button>
       <button class="btn btn-outline" style="font-size:10px" title="Plano de corte calculado pelo Núcleo de Produtos" onclick="abrirPlanoCorteNucleo('${esc(p.pedidoCodigo)}')">📐 Plano de corte</button>`
    : '';
  return `<tr>
    <td><b>${esc(p.pedidoCodigo || '—')}</b></td>
    <td>${esc(p.client?.nome || '—')}</td>
    <td>${comBrl(p.valorTotal)}</td>
    <td>${esc(COM_STATUS_LABEL[p.pedidoStatus] || p.pedidoStatus || '—')}</td>
    <td>${comPrazo(p)}</td>
    <td style="white-space:nowrap">${fichas} ${btn}</td>
  </tr>`;
}

async function comDetalhe(id) {
  const alvo = document.getElementById('com-det-' + id);
  if (!alvo) return;
  if (alvo.innerHTML) { alvo.innerHTML = ''; return; } // toggle
  alvo.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:6px 0">Carregando peças…</div>';
  try {
    const [p, previa] = await Promise.all([
      api('comercial/pedidos/' + id),
      api('comercial/pedidos/' + id + '/estrutura-previa').catch(() => null),
    ]);
    const previaPorItem = new Map(((previa && previa.itens) || []).map((x) => [String(x.item_id), x]));
    const estruturas = (previa && previa.estruturas) || [];
    const podeEscolher = podeEditar('comercial') && estruturas.length > 0;

    // A Ordem de Corte depende da estrutura: mostra o que será usado
    // (regra/nome) e deixa o avaliador corrigir ANTES de liberar.
    const celEstrutura = (it) => {
      const pv = previaPorItem.get(String(it.id));
      if (!pv) return '<td>—</td>';
      const badge = pv.origem === 'regra'
        ? `<span class="st st-ok" style="font-size:9px" title="regra: ${esc(pv.regra_nome || '')}">regra</span>`
        : pv.origem === 'sku'
          ? '<span class="st st-ok" style="font-size:9px" title="SKU canônico do Núcleo de Produtos vindo do pedido (única estrutura com este SKU)">sku</span>'
        : pv.origem === 'nome'
          ? '<span class="st st-ok" style="font-size:9px" title="nome idêntico ao da Estrutura">nome</span>'
          : '<span class="st st-atencao" style="font-size:9px" title="nenhuma regra casou — escolha manualmente (sem estrutura a Ordem de Corte não sai para este item)">pendente</span>';
      const select = podeEscolher
        ? `<select data-est-item="${esc(String(it.id))}" style="font-size:11px;max-width:220px${pv.produto_id ? '' : ';border-color:var(--red)'}">
             <option value="">— sem estrutura —</option>
             ${estruturas.map((e2) => `<option value="${e2.id}" ${Number(pv.produto_id) === Number(e2.id) ? 'selected' : ''}>${esc(e2.nome)}</option>`).join('')}
           </select>`
        : esc(pv.produto_nome || '—');
      return `<td>${select} ${badge}</td>`;
    };

    const linhas = (p.itens || []).map((it) => {
      const med = Number(it.larguraCm) > 0
        ? `${(Number(it.larguraCm) / 100).toFixed(2)}×${(Number(it.alturaCm) / 100).toFixed(2)}m`
        : '—';
      return `<tr>
        <td>${it.quantidade}× ${esc(it.tipo || '—')}</td>
        <td>${esc([it.colecao, it.corTecido].filter(Boolean).join(' · ') || '—')}</td>
        <td>${med}</td>
        <td>${esc(it.ambiente || '—')}</td>
        ${celEstrutura(it)}
        <td>${esc(it.observacoesTecnicas || '')}</td>
      </tr>`;
    }).join('');
    const pendentes = [...previaPorItem.values()].filter((x) => !x.produto_id).length;
    alvo.innerHTML = `<table style="margin-top:8px"><thead><tr><th>Peça</th><th>Coleção · Cor</th><th>Med.</th><th>Ambiente</th><th title="Estrutura do Produto usada na Ordem de Corte">Estrutura p/ produção</th><th>Obs. técnicas</th></tr></thead><tbody>${linhas}</tbody></table>
      ${pendentes ? `<div style="font-size:11px;color:var(--amber,#b45309);margin-top:6px">⚠ ${pendentes} item(ns) sem estrutura — escolha acima (ou cadastre uma regra na aba Estrutura do Produto) para a Ordem de Corte sair completa.</div>` : ''}
      ${p.observacoes ? `<div style="font-size:12px;color:var(--text3);margin-top:6px">Obs. do pedido: ${esc(p.observacoes)}</div>` : ''}`;
  } catch (e) {
    alvo.innerHTML = `<div style="color:var(--danger,#c33);font-size:12px">${esc(e.message)}</div>`;
  }
}

async function comLiberar(id, codigo) {
  // Estrutura definida por item = Ordem de Corte correta. Confere ANTES de liberar.
  let estruturas = {};
  let pendentes = 0;
  const det = document.getElementById('com-det-' + id);
  const selects = det ? det.querySelectorAll('select[data-est-item]') : [];
  if (selects.length) {
    // detalhe aberto: usa o que o avaliador escolheu na tela
    selects.forEach((s) => {
      if (s.value) estruturas[s.dataset.estItem] = Number(s.value);
      else pendentes++;
    });
  } else {
    // detalhe fechado: consulta a prévia (regras + nome)
    try {
      const previa = await api(`comercial/pedidos/${id}/estrutura-previa`);
      for (const it of (previa.itens || [])) {
        if (it.produto_id) estruturas[it.item_id] = Number(it.produto_id);
        else pendentes++;
      }
    } catch (e) { /* prévia indisponível — segue com a seleção automática do backend */ }
  }
  if (pendentes > 0 && (!det || !det.innerHTML)) {
    toast(`${pendentes} item(ns) sem Estrutura do Produto — confira em "Ver peças" antes de liberar.`);
    comDetalhe(id);
    return;
  }
  const avisoPendente = pendentes > 0
    ? `\n\n⚠ ATENÇÃO: ${pendentes} item(ns) SEM estrutura — a Ordem de Corte NÃO vai sair para eles.`
    : '';
  if (!confirm(`Liberar o pedido ${codigo} para produção?\n\nOs itens serão importados automaticamente para a Fila de Produção.${avisoPendente}`)) return;
  try {
    const r = await api(`comercial/pedidos/${id}/liberar`, { method: 'POST', body: { estruturas } });
    toast(r.jaNaFila
      ? `${codigo} liberado (itens já estavam na fila).`
      : `${codigo} liberado — ${r.importados} item(ns) importado(s) pra Fila de Produção. Etiquetas prontas na aba Etiquetas.`);
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
