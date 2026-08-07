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

  function blocoItem(item, ix, estruturaPorId, cortesPorPeca, setorFiltro) {
    const prod = item.produto_id != null ? estruturaPorId.get(Number(item.produto_id)) : null;
    const atributos = (item.atributos && typeof item.atributos === 'object') ? item.atributos : {};
    const camposSpec = [
      ['Coleção', item.colecao],
      ['Cor do tecido', item.cor_tecido],
      ['Cor do perfil', item.cor_perfil],
      ['Acionamento', item.acionamento],
      ['Ambiente', item.ambiente],
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
        <span class="estrutura">${prod ? 'Estrutura: ' + esc(prod.nome) : '⚠ SEM ESTRUTURA — Ordem de Corte não sai para este item'}</span>
      </div>
      ${spec ? `<div class="spec">${spec}</div>` : ''}
      ${item.observacoes ? `<div class="obs"><b>Observações técnicas</b>${esc(item.observacoes)}</div>` : ''}
      <table class="pecas">
        <thead><tr><th style="width:44px">Peça</th><th style="width:150px">Medida (L × A)</th><th>Medidas extras</th><th style="width:130px">Etiqueta</th><th style="width:110px">Concluída</th></tr></thead>
        <tbody>${pecas || '<tr><td colspan="5" style="color:var(--text3)">Sem peças cadastradas.</td></tr>'}</tbody>
      </table>
      ${blocoCortes(item, cortesPorPeca, setorFiltro)}
    </div>`;
  }

  const estado = { setorFiltro: '', setores: [], cortesPorPeca: new Map(), desenhosFab: [], comercialId: null };

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
    const emitida = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const cliente = (info && info.cliente) || itens.map((i) => i.cliente).find(Boolean) || '—';
    const dataCliente = itens.map((i) => i.data_cliente).find(Boolean) || null;
    const totalPecas = itens.reduce((a, i) => a + ((i.pecas || []).length || Number(i.qnt) || 1), 0);
    const semEstrutura = itens.filter((i) => i.produto_id == null).length;
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
    try {
      await api('auth/session');
      const [dados, estrutura, oc] = await Promise.all([
        api('pcp/pedido?pedido=' + encodeURIComponent(pedido)),
        api('pcp/estrutura'),
        api('pcp/ordem-corte/preview?pedidos=' + encodeURIComponent(pedido)).catch(() => null),
      ]);
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
