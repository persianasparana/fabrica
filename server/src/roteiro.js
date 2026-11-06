/**
 * Roteiro por LINHA de construção (P0 do planejamento, 06/11/2026) — para as
 * peças SEM Estrutura do Produto local (cortina, cortina fixa, celular,
 * vertical, toldo). Cadastro em `pcp_config.roteiro_linhas` (JSON
 * `{ linha: [nomes de setor em ordem] }`, semeado em db.js); os nomes viram
 * ids de `pcp_setores` e o roteiro é SEQUENCIAL (cada setor depende do anterior).
 * Compartilhado pela bipagem (routes/pcp.js) e pelo planejamento de carga (carga.js).
 */
export async function roteiroDaLinha(exec, linha) {
  if (!linha) return [];
  const { rows } = await exec(`SELECT valor FROM pcp_config WHERE chave = 'roteiro_linhas'`);
  let cfg = {};
  try { cfg = rows[0] && rows[0].valor ? JSON.parse(rows[0].valor) : {}; } catch { cfg = {}; }
  const nomes = Array.isArray(cfg[linha]) ? cfg[linha] : [];
  if (!nomes.length) return [];
  const { rows: setores } = await exec('SELECT id, nome FROM pcp_setores WHERE ativo = TRUE');
  const idDe = (nome) => {
    const n = String(nome).trim().toLowerCase();
    const s = setores.find((x) => String(x.nome).trim().toLowerCase() === n);
    return s ? Number(s.id) : null;
  };
  const ids = nomes.map(idDe).filter((x) => x != null);
  return ids.map((id, i) => ({ setor_id: id, depende_de: i > 0 ? [ids[i - 1]] : [] }));
}
