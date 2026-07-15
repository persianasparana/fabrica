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

  function blocoItem(item, ix, estruturaPorId) {
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
    </div>`;
  }

  function render(pedido, dados, estruturaPorId) {
    const itens = dados.itens || [];
    const emitida = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const cliente = itens.map((i) => i.cliente).find(Boolean) || '—';
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
        <div><b>Data prometida</b><span>${fmtData(dataCliente)}</span></div>
        <div><b>Itens</b><span>${itens.length}</span></div>
        <div><b>Peças</b><span>${totalPecas}</span></div>
      </div>
      ${avisos.map((a) => `<div class="alerta">${a}</div>`).join('')}
      ${itens.map((it, ix) => blocoItem(it, ix, estruturaPorId)).join('') || '<div class="alerta">Pedido sem itens.</div>'}
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
      const [dados, estrutura] = await Promise.all([
        api('pcp/pedido?pedido=' + encodeURIComponent(pedido)),
        api('pcp/estrutura'),
      ]);
      const porId = new Map((estrutura.data || []).map((p) => [Number(p.id), p]));
      render(pedido, dados, porId);
    } catch (e) {
      if (e.message !== 'Não autenticado')
        $('#conteudo').innerHTML = `<div class="alerta">Erro: ${esc(e.message)}</div>`;
    }
  })();
})();
