/**
 * Confere a LISTA DE MATERIAIS "como a venda cotou" (25/11/2026) — usado pelo
 * script de deploy e por quem quiser conferir o servidor.
 *
 *   node bin/conferir-lista-materiais.js --sonda
 *     Sonda os dois PROVEDORES com a configuração do próprio fabrica-server
 *     (server/.env), sem gravar nada:
 *       · Núcleo de Produtos v14.95 — pede uma troca de tela (`so_tecido`) e
 *         confere que a lista volta SÓ com o tecido (eco `so_tecido: true`);
 *       · Comercial v2.139.2 — lê um pedido que está na fila e confere que os
 *         itens trazem `nucleoCotacao`.
 *     Saída: 0 = os dois prontos · 3 = Núcleo anterior à v14.95 · 4 = Comercial
 *     anterior à v2.139.2 · 5 = não deu para sondar (sem chave / fora do ar /
 *     sem pedido na fila) — o texto diz qual.
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
    if (pc.so_tecido === true && comps === 0) return { rc: 0, msg: `Núcleo v14.95 OK — troca de tela de "${colecao}" volta só com o tecido` };
    return { rc: 3, msg: `Núcleo ANTERIOR à v14.95 — a troca de tela de "${colecao}" voltou com ${comps} componente(s) da estrutura. Aplique antes, no repo produtos: cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-95-troca-de-tela-lista.sh` };
  }
  return { rc: 5, msg: 'Núcleo: nenhuma das 12 primeiras coleções cotou uma troca de tela de 1,00 × 1,60 — não deu para sondar' };
}

async function sondarComercial() {
  if (!comercialConfigurado()) return { rc: 5, msg: 'Comercial: COMERCIAL_API_BASE/COMERCIAL_SERVICE_KEY ausentes em server/.env — nada a sondar' };
  const { rows } = await q(`SELECT pedido, comercial_id FROM pcp_pedido_info WHERE comercial_id IS NOT NULL ORDER BY updated_at DESC LIMIT 5`);
  if (!rows.length) return { rc: 5, msg: 'Comercial: nenhum pedido liberado na fila (pcp_pedido_info vazia) — não deu para sondar; a 1ª liberação já traz a informação se o Comercial estiver na v2.139.2' };
  let ultimoErro = null;
  for (const r of rows) {
    let det;
    try { det = await chamar('GET', `/pedidos/${encodeURIComponent(r.comercial_id)}`); } catch (e) { ultimoErro = e.message; continue; }
    const pecas = (Array.isArray(det && det.itens) ? det.itens : []).filter((i) => i && i.isAcessorio !== true);
    if (!pecas.length) continue;
    if (pecas.some((i) => i.nucleoCotacao && typeof i.nucleoCotacao === 'object')) return { rc: 0, msg: `Comercial v2.139.2 OK — os itens do ${r.pedido} trazem nucleoCotacao` };
    return { rc: 4, msg: `Comercial ANTERIOR à v2.139.2 — os itens do ${r.pedido} não trazem nucleoCotacao. Aplique antes, no repo agenda-consultores: cd /var/www/agenda/agenda-consultores && git pull --ff-only origin claude/trusting-johnson-K7jQ7 && bash deploy/aplicar-v2.139.2.sh` };
  }
  return { rc: 5, msg: `Comercial: não deu para ler um pedido da fila (${ultimoErro || 'pedidos sem peças'})` };
}

let rc = 0;
try {
  if (args.includes('--sonda')) {
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
