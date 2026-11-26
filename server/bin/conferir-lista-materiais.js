/**
 * Confere a LISTA DE MATERIAIS "como a venda cotou" (25/11/2026) — usado pelo
 * script de deploy e por quem quiser conferir o servidor.
 *
 *   node bin/conferir-lista-materiais.js --sonda
 *     Sonda os dois PROVEDORES com a configuração do próprio fabrica-server
 *     (server/.env), sem gravar nada:
 *       · Núcleo de Produtos v14.97 — pede uma troca de tela (`so_tecido`) e
 *         confere que a lista volta SÓ com o tecido (eco `so_tecido: true`);
 *       · Comercial v2.140.1 — lê um pedido que está na fila e confere que os
 *         itens trazem `nucleoCotacao`.
 *     Saída: 0 = os dois prontos · 3 = Núcleo anterior à v14.97 · 4 = Comercial
 *     anterior à v2.140.1 · 5 = não deu para sondar (sem chave / fora do ar /
 *     sem pedido na fila) — o texto diz qual.
 *
 *   node bin/conferir-lista-materiais.js --sonda-plano
 *     Sonda o Núcleo de Produtos v14.98 (26/11/2026 — consumo de tecido pelo
 *     melhor aproveitamento do PEDIDO, uma largura de rolo por ambiente): pede
 *     duas peças de rolô de ambientes diferentes do mesmo pedido e confere que a
 *     resposta traz `plano_tecido`. Diz também se a regra está ligada no painel
 *     do Núcleo. Saída: 0 = pronto · 3 = Núcleo anterior à v14.98 · 5 = não deu
 *     para sondar.
 *
 *   node bin/conferir-lista-materiais.js [--pedido PED-AAAA/NNNN]
 *     Resumo da lista de um pedido (padrão: o pedido aberto mais recente com a
 *     especificação da venda): peças que calculam, peças pela reserva, itens
 *     sem "como foi cotada", avisos. Só leitura.
 */
import 'dotenv/config';
import { pool, q } from '../src/db.js';
import { chamar, configurado as comercialConfigurado } from '../src/comercial-client.js';
import { buscarListaMateriais, listaMateriaisHabilitado, erroListaMateriais } from '../src/produtos-client.js';
import { listaMateriaisDosPedidos } from '../src/lista-materiais.js';

const args = process.argv.slice(2);
const arg = (nome) => { const i = args.indexOf(nome); return i >= 0 && args[i + 1] ? String(args[i + 1]).trim() : null; };

async function sondarNucleo() {
  if (!listaMateriaisHabilitado()) return { rc: 5, msg: 'Núcleo: PRODUTOS_SERVICE_KEY ausente (ou PRODUTOS_LISTA_MATERIAIS_ENABLED=0) em server/.env — a lista de materiais está desligada; nada a sondar' };
  const base = (process.env.PRODUTOS_API_BASE || 'http://127.0.0.1:3070/api/v1').replace(/\/+$/, '');
  let colecoes = [];
  try {
    const r = await fetch(`${base}/catalogo/colecoes?produto_sku=__auto`, { headers: { 'X-Service-Key': process.env.PRODUTOS_SERVICE_KEY || '' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { rc: 5, msg: `Núcleo: /catalogo/colecoes respondeu HTTP ${r.status} — confira a chave (PRODUTOS_SERVICE_KEY) e o produtos-api` };
    const j = await r.json();
    colecoes = (Array.isArray(j && j.data) ? j.data : []).map((c) => c && c.colecao).filter(Boolean);
  } catch (e) { return { rc: 5, msg: `Núcleo inacessível em ${base} (${e.message})` }; }
  if (!colecoes.length) return { rc: 5, msg: 'Núcleo: nenhuma coleção de rolô no catálogo — não deu para sondar a troca de tela' };
  // a 1ª coleção em que uma troca de tela de 1,00 × 1,60 calcula
  for (const colecao of colecoes.slice(0, 12)) {
    const data = await buscarListaMateriais([{ ref: 'sonda', qtd: 1, largura: 1.0, altura: 1.6, colecao, so_tecido: true }]);
    if (!data) return { rc: 5, msg: `Núcleo não respondeu o /lista-materiais (${erroListaMateriais() || 'sem detalhe'})` };
    const pc = Array.isArray(data.pecas) ? data.pecas[0] : null;
    if (!pc || pc.ok === false) continue;
    const comps = (pc.materiais || []).filter((m) => m.tipo !== 'tecido').length;
    if (pc.so_tecido === true && comps === 0) return { rc: 0, msg: `Núcleo v14.97 OK — troca de tela de "${colecao}" volta só com o tecido` };
    return { rc: 3, msg: `Núcleo ANTERIOR à v14.97 — a troca de tela de "${colecao}" voltou com ${comps} componente(s) da estrutura. Aplique antes, no repo produtos: cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-97-troca-de-tela-lista.sh` };
  }
  return { rc: 5, msg: 'Núcleo: nenhuma das 12 primeiras coleções cotou uma troca de tela de 1,00 × 1,60 — não deu para sondar' };
}

async function sondarPlano() {
  if (!listaMateriaisHabilitado()) return { rc: 5, msg: 'Núcleo: PRODUTOS_SERVICE_KEY ausente (ou PRODUTOS_LISTA_MATERIAIS_ENABLED=0) em server/.env — a lista de materiais está desligada; nada a sondar' };
  const base = (process.env.PRODUTOS_API_BASE || 'http://127.0.0.1:3070/api/v1').replace(/\/+$/, '');
  let colecoes = [];
  try {
    const r = await fetch(`${base}/catalogo/colecoes?produto_sku=__auto`, { headers: { 'X-Service-Key': process.env.PRODUTOS_SERVICE_KEY || '' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { rc: 5, msg: `Núcleo: /catalogo/colecoes respondeu HTTP ${r.status} — confira a chave (PRODUTOS_SERVICE_KEY) e o produtos-api` };
    const j = await r.json();
    colecoes = (Array.isArray(j && j.data) ? j.data : []).map((c) => c && c.colecao).filter(Boolean);
  } catch (e) { return { rc: 5, msg: `Núcleo inacessível em ${base} (${e.message})` }; }
  if (!colecoes.length) return { rc: 5, msg: 'Núcleo: nenhuma coleção de rolô no catálogo — não deu para sondar o plano de corte' };
  const ANTES = 'cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-98-consumo-tecido-pedido.sh';
  // a 1ª coleção em que duas peças de rolô (ambientes diferentes, mesmo pedido) calculam
  for (const colecao of colecoes.slice(0, 12)) {
    const data = await buscarListaMateriais([
      { ref: 'sonda:1', pedido: 'PED-SONDA', ambiente: 'Sala', qtd: 1, largura: 1.2, altura: 1.6, colecao },
      { ref: 'sonda:2', pedido: 'PED-SONDA', ambiente: 'Quarto', qtd: 1, largura: 0.8, altura: 1.6, colecao },
    ]);
    if (!data) return { rc: 5, msg: `Núcleo não respondeu o /lista-materiais (${erroListaMateriais() || 'sem detalhe'})` };
    if (!Array.isArray(data.plano_tecido)) return { rc: 3, msg: `Núcleo ANTERIOR à v14.98 — o /lista-materiais não devolve o plano de corte do tecido (plano_tecido). Aplique antes, no repo produtos: ${ANTES}` };
    const calculam = (Array.isArray(data.pecas) ? data.pecas : []).filter((p) => p && p.ok !== false).length;
    if (calculam < 2) continue;
    const ligada = data.parametros && data.parametros.consumo_tecido_pedido === true;
    if (!ligada) return { rc: 0, msg: 'Núcleo v14.98 OK — mas a regra está DESLIGADA no painel do Núcleo (Regras gerais → Parâmetros → "Consumo de tecido — melhor aproveitamento do pedido"): a Ficha sai sem o plano de corte e o tecido é calculado AMBIENTE POR AMBIENTE, sem dividir rolo entre ambientes (mais tecido do que no plano do pedido)' };
    const pl = data.plano_tecido.find((t) => t && t.pedido === 'PED-SONDA');
    const rolos = pl ? (pl.rolos || []).map((r) => `${Number(r.largura_rolo).toFixed(2)} m × ${Number(r.comprimento).toFixed(2)} m`).join(' + ') : '';
    return { rc: 0, msg: `Núcleo v14.98 OK — plano de corte de "${colecao}" (duas peças, dois ambientes): ${rolos || 'sem rolo compartilhado nesta coleção'}` };
  }
  return { rc: 5, msg: 'Núcleo: nenhuma das 12 primeiras coleções cotou as duas peças da sonda — não deu para conferir o plano de corte' };
}

async function sondarComercial() {
  if (!comercialConfigurado()) return { rc: 5, msg: 'Comercial: COMERCIAL_API_BASE/COMERCIAL_SERVICE_KEY ausentes em server/.env — nada a sondar' };
  const { rows } = await q(`SELECT pedido, comercial_id FROM pcp_pedido_info WHERE comercial_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5`);
  if (!rows.length) return { rc: 5, msg: 'Comercial: nenhum pedido liberado na fila (pcp_pedido_info vazia) — não deu para sondar; a 1ª liberação já traz a informação se o Comercial estiver na v2.140.1' };
  let ultimoErro = null;
  for (const r of rows) {
    let det;
    try { det = await chamar('GET', `/pedidos/${encodeURIComponent(r.comercial_id)}`); } catch (e) { ultimoErro = e.message; continue; }
    const pecas = (Array.isArray(det && det.itens) ? det.itens : []).filter((i) => i && i.isAcessorio !== true);
    if (!pecas.length) continue;
    if (pecas.some((i) => i.nucleoCotacao && typeof i.nucleoCotacao === 'object')) return { rc: 0, msg: `Comercial v2.140.1 OK — os itens do ${r.pedido} trazem nucleoCotacao` };
    return { rc: 4, msg: `Comercial ANTERIOR à v2.140.1 — os itens do ${r.pedido} não trazem nucleoCotacao. Aplique antes, no repo agenda-consultores: cd /var/www/agenda/agenda-consultores && git pull --ff-only origin claude/trusting-johnson-K7jQ7 && bash deploy/aplicar-v2.140.1.sh` };
  }
  return { rc: 5, msg: `Comercial: não deu para ler um pedido da fila (${ultimoErro || 'pedidos sem peças'})` };
}

let rc = 0;
try {
  if (args.includes('--sonda-plano')) {
    const n = await sondarPlano();
    console.log(`  ${n.rc === 0 ? '✓' : n.rc === 5 ? '?' : '✗'} ${n.msg}`);
    rc = n.rc;
  } else if (args.includes('--sonda')) {
    const n = await sondarNucleo();
    const c = await sondarComercial();
    console.log(`  ${n.rc === 0 ? '✓' : n.rc === 5 ? '?' : '✗'} ${n.msg}`);
    console.log(`  ${c.rc === 0 ? '✓' : c.rc === 5 ? '?' : '✗'} ${c.msg}`);
    rc = n.rc === 3 ? 3 : c.rc === 4 ? 4 : (n.rc === 5 || c.rc === 5) ? 5 : 0;
  } else {
    let pedido = arg('--pedido');
    if (!pedido) {
      const { rows } = await q(`SELECT i.pedido FROM pcp_itens i WHERE i.spec_nucleo IS NOT NULL AND i.conclusao IS NULL AND btrim(COALESCE(i.pedido, '')) <> '' ORDER BY i.id DESC LIMIT 1`);
      pedido = rows[0] ? rows[0].pedido : null;
    }
    if (!pedido) console.log('  nenhum pedido aberto com a especificação da venda na fila — nada a conferir (a 1ª liberação já sai pela regra nova).');
    else {
      const lm = await listaMateriaisDosPedidos([pedido]);
      if (!lm.habilitado || !lm.data) console.log(`  ${pedido}: lista indisponível — ${lm.motivo}`);
      else {
        const t = lm.data.totais || {};
        const trocas = Object.values(lm.por_item).filter((x) => x.so_tecido).length;
        console.log(`  ${pedido}: ${lm.itens} item(ns), ${lm.pecas} peça(s) — calculam ${t.pecas_ok}, não calculam ${t.pecas_erro}; pela reserva (códigos gravados na venda) ${lm.reservas.length}; itens sem "como foi cotada" ${lm.itens_sem_cotacao.length}; trocas de tela ${trocas}`);
        // 26/11/2026 — plano de corte do tecido (Núcleo v14.98) e ambientes das peças
        const planos = Array.isArray(lm.data.plano_tecido) ? lm.data.plano_tecido : null;
        const ambs = new Set((lm.data.pecas || []).map((p) => String(p.ambiente || '').trim()).filter(Boolean));
        const m2 = (v) => Number(v || 0).toFixed(2).replace('.', ',');
        if (planos === null) console.log('    · plano de corte do tecido: o Núcleo é anterior à v14.98 (sem plano_tecido)');
        else if (!planos.length) console.log('    · plano de corte do tecido: nenhum (regra desligada no painel do Núcleo, ou o pedido não tem peça de rolô que aninha)');
        else for (const t of planos) console.log(`    ✂ ${t.colecao}${t.cor ? ' · ' + t.cor : ''}: ${(t.rolos || []).map((r) => `rolo ${m2(r.largura_rolo)} m × ${m2(r.comprimento)} m`).join(' + ')} — ${(t.ambientes || []).length} ambiente(s)`);
        console.log(`    · ambientes nas peças: ${ambs.size ? [...ambs].slice(0, 8).join(', ') + (ambs.size > 8 ? '…' : '') : 'NENHUM (as peças estão sem ambiente — rode: node bin/completar-ambiente.js)'}`);
        for (const pc of (lm.data.pecas || []).filter((p) => p.ok === false).slice(0, 5)) console.log(`    ✗ peça ${pc.ref}: ${pc.motivo || pc.error}`);
        for (const a of lm.avisos.slice(0, 6)) console.log(`    · ${a}`);
      }
    }
  }
} catch (e) {
  console.error('ERRO:', e.message);
  rc = 1;
}
await pool.end();
process.exit(rc);
