/**
 * PLANEJAMENTO DE CARGA — P2 do planejamento de produção (06/11/2026; espec
 * docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.2 f).
 *
 * Sequencia as PEÇAS abertas da fila nos SETORES do roteiro delas, dia a dia,
 * respeitando a capacidade cadastrada por setor (`pcp_setores.capacidade_dia`,
 * peças por dia útil; vazia = sem limite), por ordem de PRIORIDADE
 * (`pcp_itens.prioridade`: 2 urgente · 1 alta · 0 normal), peça especial, data
 * prometida (`data_cliente`) e chegada. Devolve o calendário por setor (quanto
 * cabe × quanto está programado em cada dia), a previsão de término de cada
 * peça/item e os alertas: setor estourado, item que vai atrasar (previsão
 * depois da data prometida − folga), peça sem roteiro, item sem data.
 *
 * `sequenciar()` é PURO (testável sem banco); `carregarCarga()` lê a fila.
 * Regras: dias úteis e folga em `pcp_config.carga_cfg` (JSON, editável).
 */
import { q } from './db.js';
import { roteiroDaLinha } from './roteiro.js';
import { linhaDoSku, semEstruturaLocal } from './nucleo-spec.js';

export const CARGA_CFG_PADRAO = { dias_uteis: [1, 2, 3, 4, 5], folga_dias: 1, semanas: 2 };

const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const deIso = (s) => { const [a, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const somarDias = (s, n) => { const d = deIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };

/** dias úteis a partir de `inicio` (ISO) cobrindo `semanas` semanas-calendário */
export function diasUteis(inicio, semanas, diasSemana) {
  const set = new Set((diasSemana && diasSemana.length ? diasSemana : CARGA_CFG_PADRAO.dias_uteis).map(Number));
  const out = [];
  for (let i = 0; i < Math.max(1, semanas) * 7; i += 1) {
    const dia = somarDias(inicio, i);
    if (set.has(deIso(dia).getUTCDay())) out.push(dia);
  }
  return out;
}

/**
 * @param entrada { inicio:'YYYY-MM-DD', semanas, cfg:{dias_uteis, folga_dias},
 *   setores:[{id,nome,cor,ordem,capacidade_dia}],
 *   pecas:[{peca_id,item_id,pedido,produto,numero,data_cliente,prioridade,especial,
 *           chegada_pcp, roteiro:[setor_id…], feitos:[setor_id…], em_andamento:[setor_id…]}] }
 */
export function sequenciar(entrada) {
  const cfg = { ...CARGA_CFG_PADRAO, ...(entrada.cfg || {}) };
  const inicio = entrada.inicio;
  const dias = diasUteis(inicio, entrada.semanas || cfg.semanas || 2, cfg.dias_uteis);
  const setores = [...(entrada.setores || [])].sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.id - b.id);
  const setorPorId = new Map(setores.map((s) => [Number(s.id), s]));
  const capDe = (sid) => { const s = setorPorId.get(Number(sid)); const c = s ? Number(s.capacidade_dia) : NaN; return Number.isFinite(c) && c > 0 ? c : null; };

  // ordem: urgente > alta > normal; especial; data prometida (sem data por último); chegada; id
  const pecas = [...(entrada.pecas || [])].sort((a, b) =>
    (Number(b.prioridade) || 0) - (Number(a.prioridade) || 0)
    || (b.especial ? 1 : 0) - (a.especial ? 1 : 0)
    || String(a.data_cliente || '9999').localeCompare(String(b.data_cliente || '9999'))
    || String(a.chegada_pcp || '9999').localeCompare(String(b.chegada_pcp || '9999'))
    || Number(a.peca_id) - Number(b.peca_id));

  const usado = new Map(); // setor_id → array por dia
  const porSetorDia = new Map(); // setor_id → Map(dia → [pecas])
  for (const s of setores) { usado.set(Number(s.id), dias.map(() => 0)); porSetorDia.set(Number(s.id), new Map()); }
  const alemHorizonte = new Map(); // setor_id → count

  // Peça SEM roteiro cadastrado (estrutura com roteiro vazio e linha sem
  // cadastro): na bipagem qualquer setor a aceita; aqui ela passa por TODOS os
  // setores ativos em ordem (roteiro padrão) e sai marcada `roteiro_padrao` —
  // senão o planejamento ficaria vazio até os roteiros serem cadastrados.
  const roteiroPadrao = setores.map((s) => Number(s.id));
  const saidaPecas = [];
  for (const p of pecas) {
    const feitos = new Set((p.feitos || []).map(Number));
    const cadastrado = (p.roteiro || []).map(Number).filter((sid) => setorPorId.has(sid));
    const roteiro = cadastrado.length ? cadastrado : roteiroPadrao;
    const pendentes = roteiro.filter((sid) => !feitos.has(sid));
    const etapas = [];
    let diaMin = 0;
    let fora = false;
    for (const sid of pendentes) {
      const cap = capDe(sid);
      const arr = usado.get(sid);
      let d = -1;
      for (let i = diaMin; i < dias.length; i += 1) {
        if (cap == null || arr[i] < cap) { d = i; break; }
      }
      if (d < 0) { fora = true; alemHorizonte.set(sid, (alemHorizonte.get(sid) || 0) + 1); etapas.push({ setor_id: sid, dia: null }); diaMin = dias.length; continue; }
      arr[d] += 1;
      const m = porSetorDia.get(sid);
      if (!m.has(dias[d])) m.set(dias[d], []);
      m.get(dias[d]).push(p);
      etapas.push({ setor_id: sid, dia: dias[d] });
      diaMin = d; // o setor seguinte pode começar no mesmo dia (fila contínua)
    }
    const previsao = fora ? null : (etapas.length ? etapas[etapas.length - 1].dia : null);
    const limite = p.data_cliente ? somarDias(p.data_cliente, -Number(cfg.folga_dias || 0)) : null;
    saidaPecas.push({
      ...p, roteiro, pendentes, etapas,
      sem_roteiro: roteiro.length === 0,
      roteiro_padrao: cadastrado.length === 0 && roteiro.length > 0,
      concluida_no_roteiro: roteiro.length > 0 && pendentes.length === 0,
      previsao, alem_horizonte: fora, data_limite: limite,
      atrasa: !!(limite && (fora || (previsao && previsao > limite))),
      ja_vencida: !!(limite && limite < inicio),
    });
  }

  const setoresSaida = setores.map((s) => {
    const sid = Number(s.id);
    const cap = capDe(sid);
    const m = porSetorDia.get(sid);
    const diasSaida = dias.map((dia) => {
      const lista = m.get(dia) || [];
      return {
        data: dia, total: lista.length, capacidade: cap,
        estourado: cap != null && lista.length > cap,
        ocupacao_pct: cap ? Math.round((lista.length / cap) * 100) : null,
        pecas: lista.map((p) => ({ peca_id: p.peca_id, item_id: p.item_id, pedido: p.pedido, produto: p.produto, numero: p.numero, data_cliente: p.data_cliente, prioridade: p.prioridade, especial: !!p.especial })),
      };
    });
    const totalPend = saidaPecas.filter((p) => p.pendentes.includes(sid)).length;
    return {
      id: sid, nome: s.nome, cor: s.cor, ordem: s.ordem, capacidade_dia: cap,
      total_pendente: totalPend, alem_horizonte: alemHorizonte.get(sid) || 0,
      dias: diasSaida,
      dias_estourados: diasSaida.filter((d) => d.estourado).length,
      capacidade_horizonte: cap != null ? cap * dias.length : null,
    };
  });

  // itens: previsão = maior previsão das peças
  const itens = new Map();
  for (const p of saidaPecas) {
    const k = String(p.item_id);
    if (!itens.has(k)) itens.set(k, { item_id: p.item_id, pedido: p.pedido, produto: p.produto, data_cliente: p.data_cliente, data_limite: p.data_limite, prioridade: p.prioridade, especial: !!p.especial, pecas: 0, previsao: null, alem_horizonte: false, atrasa: false, sem_roteiro: false });
    const it = itens.get(k);
    it.pecas += 1;
    if (p.alem_horizonte) it.alem_horizonte = true;
    if (p.previsao && (!it.previsao || p.previsao > it.previsao)) it.previsao = p.previsao;
    if (p.atrasa) it.atrasa = true;
    if (p.sem_roteiro) it.sem_roteiro = true;
    if (p.roteiro_padrao) it.roteiro_padrao = true;
  }
  const itensSaida = [...itens.values()].sort((a, b) => String(a.data_cliente || '9999').localeCompare(String(b.data_cliente || '9999')) || String(a.pedido).localeCompare(String(b.pedido)));

  return {
    inicio, dias, cfg,
    setores: setoresSaida,
    pecas: saidaPecas,
    itens: itensSaida,
    alertas: {
      setores_estourados: setoresSaida.filter((s) => s.dias_estourados > 0 || s.alem_horizonte > 0).map((s) => ({ id: s.id, nome: s.nome, dias_estourados: s.dias_estourados, alem_horizonte: s.alem_horizonte })),
      itens_atrasam: itensSaida.filter((i) => i.atrasa),
      sem_roteiro: saidaPecas.filter((p) => p.sem_roteiro).length,
      roteiro_padrao: saidaPecas.filter((p) => p.roteiro_padrao).length,
      sem_data: itensSaida.filter((i) => !i.data_cliente).length,
      sem_capacidade: setoresSaida.filter((s) => s.capacidade_dia == null).map((s) => s.nome),
    },
    totais: {
      pecas: saidaPecas.length, itens: itensSaida.length,
      itens_atrasam: itensSaida.filter((i) => i.atrasa).length,
      pecas_alem_horizonte: saidaPecas.filter((p) => p.alem_horizonte).length,
    },
  };
}

/** cfg do planejamento (pcp_config.carga_cfg) com os defaults do código */
export async function cargaCfg(exec = q) {
  const { rows } = await exec(`SELECT valor FROM pcp_config WHERE chave = 'carga_cfg'`);
  let cfg = {};
  try { cfg = rows[0] && rows[0].valor ? JSON.parse(rows[0].valor) : {}; } catch { cfg = {}; }
  const dias = Array.isArray(cfg.dias_uteis) ? cfg.dias_uteis.map(Number).filter((x) => x >= 0 && x <= 6) : CARGA_CFG_PADRAO.dias_uteis;
  return {
    dias_uteis: dias.length ? dias : CARGA_CFG_PADRAO.dias_uteis,
    folga_dias: Number.isFinite(Number(cfg.folga_dias)) ? Math.max(0, Number(cfg.folga_dias)) : CARGA_CFG_PADRAO.folga_dias,
    semanas: Number.isFinite(Number(cfg.semanas)) && Number(cfg.semanas) >= 1 ? Math.min(8, Number(cfg.semanas)) : CARGA_CFG_PADRAO.semanas,
  };
}

/** Lê a fila aberta e sequencia. `inicio` ISO (default hoje); `semanas` 1–8. */
export async function carregarCarga({ inicio, semanas } = {}) {
  const cfg = await cargaCfg();
  const hoje = iso(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const ini = inicio && /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : hoje;
  const sem = Number(semanas) >= 1 ? Math.min(8, Number(semanas)) : cfg.semanas;
  const { rows: setores } = await q(`SELECT id, nome, cor, ordem, capacidade_dia FROM pcp_setores WHERE ativo = TRUE ORDER BY ordem, id`);
  const { rows: pecas } = await q(
    `SELECT pp.id AS peca_id, pp.item_id, pp.numero, i.pedido, i.produto, i.produto_id, i.produto_sku,
            to_char(i.data_cliente, 'YYYY-MM-DD') AS data_cliente, to_char(i.chegada_pcp, 'YYYY-MM-DD') AS chegada_pcp,
            i.prioridade, i.especial, p.roteiro,
            COALESCE((SELECT json_agg(json_build_object('setor_id', e.setor_id, 'inicio', e.inicio, 'fim', e.fim)) FROM pcp_peca_etapas e WHERE e.peca_id = pp.id), '[]'::json) AS etapas
     FROM pcp_pecas pp JOIN pcp_itens i ON i.id = pp.item_id
     LEFT JOIN pcp_produtos p ON p.id = i.produto_id
     WHERE pp.conclusao IS NULL
     ORDER BY pp.item_id, pp.numero`);
  const cacheLinha = new Map();
  const entradaPecas = [];
  for (const p of pecas) {
    let roteiro = Array.isArray(p.roteiro) ? p.roteiro.map((r) => Number(r.setor_id)) : [];
    if (!roteiro.length && !p.produto_id && semEstruturaLocal(p.produto_sku)) {
      const linha = linhaDoSku(p.produto_sku);
      if (!cacheLinha.has(linha)) cacheLinha.set(linha, (await roteiroDaLinha(q, linha)).map((r) => Number(r.setor_id)));
      roteiro = cacheLinha.get(linha);
    }
    const etapas = Array.isArray(p.etapas) ? p.etapas : [];
    entradaPecas.push({
      peca_id: Number(p.peca_id), item_id: Number(p.item_id), numero: p.numero, pedido: p.pedido, produto: p.produto,
      data_cliente: p.data_cliente, chegada_pcp: p.chegada_pcp, prioridade: Number(p.prioridade) || 0, especial: p.especial === true,
      roteiro,
      feitos: etapas.filter((e) => e.fim).map((e) => Number(e.setor_id)),
      em_andamento: etapas.filter((e) => e.inicio && !e.fim).map((e) => Number(e.setor_id)),
    });
  }
  return sequenciar({ inicio: ini, semanas: sem, cfg, setores, pecas: entradaPecas });
}
