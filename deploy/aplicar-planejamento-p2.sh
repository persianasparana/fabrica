#!/usr/bin/env bash
# Deploy — P2 do PLANEJAMENTO DE PRODUÇÃO no PCP: planejamento de CARGA por setor
# (06/11/2026; espec docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.2 f).
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-planejamento-p2.sh
# Sem migration manual: o db.js roda os ALTERs idempotentes no boot (pcp_setores.capacidade_dia,
# pcp_itens.prioridade, pcp_config.carga_cfg). Cobre o P0 se ele ainda não foi aplicado (mesmo boot).
# Não depende de versão do Núcleo. Depois do deploy: cadastrar a CAPACIDADE de cada setor (aba Setores
# ou no card da tela) e os ROTEIROS nas estruturas — sem roteiro a peça passa por todos os setores.
set -euo pipefail
cd /var/www/fabrica

grep -q "export function sequenciar" server/src/carga.js \
  || { echo "ERRO: server/src/carga.js ausente — rode git pull antes"; exit 1; }
grep -q "export async function roteiroDaLinha" server/src/roteiro.js \
  || { echo "ERRO: server/src/roteiro.js ausente"; exit 1; }
grep -q "'/carga'" server/src/routes/pcp.js \
  || { echo "ERRO: rota /pcp/carga ausente"; exit 1; }
grep -q "ADD COLUMN IF NOT EXISTS capacidade_dia" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna capacidade_dia"; exit 1; }
grep -q "ADD COLUMN IF NOT EXISTS prioridade" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna prioridade"; exit 1; }
grep -q "carga_cfg" server/src/db.js \
  || { echo "ERRO: db.js sem o seed de carga_cfg"; exit 1; }
grep -q "capacidadeDia(d.capacidade_dia)" server/src/routes/admin.js \
  || { echo "ERRO: PUT /setores sem capacidade_dia"; exit 1; }
grep -q "async function renderCarga" pcp/public/assets/js/carga.js \
  || { echo "ERRO: tela carga.js ausente"; exit 1; }
grep -q 'data-page="carga"' pcp/public/index.html \
  || { echo "ERRO: index.html sem a aba Planejamento de carga"; exit 1; }
grep -q "ed-prioridade" pcp/public/assets/js/app.js \
  || { echo "ERRO: modal da fila sem o campo Prioridade"; exit 1; }
echo "== commit do P2 confirmado =="

node server/test/carga.test.mjs >/dev/null || { echo "ERRO: teste do sequenciador falhou"; exit 1; }
echo "== teste do sequenciador OK =="

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

echo "== conferencia (banco) =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'colunas: '||count(*)||'/2' FROM information_schema.columns WHERE (table_name='pcp_setores' AND column_name='capacidade_dia') OR (table_name='pcp_itens' AND column_name='prioridade');" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'carga_cfg: '||valor FROM pcp_config WHERE chave='carga_cfg';" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'setores com capacidade: '||count(*) FILTER (WHERE capacidade_dia IS NOT NULL)||'/'||count(*) FROM pcp_setores WHERE ativo;" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'estruturas SEM roteiro: '||count(*) FILTER (WHERE roteiro IS NULL OR roteiro::text IN ('[]','null'))||'/'||count(*) FROM pcp_produtos WHERE ativo;" || true
CARGA=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3020/api/pcp/carga || true)
[ "$CARGA" = "401" ] || echo "AVISO: GET /api/pcp/carga respondeu $CARGA (esperado 401 sem sessao)"

[ -f deploy/REGISTRO-DEPLOYS.md ] || cat > deploy/REGISTRO-DEPLOYS.md <<'EOT'
# Registro de deploys — produção `aplicativos` (append-only)

> Formato: `- AAAA-MM-DD HH:MM | commit <hash> | <processos> | <o que subiu> | <resultado>`

<!-- linhas novas ABAIXO desta marca (não editar as anteriores) -->
EOT
echo "- $(date '+%Y-%m-%d %H:%M') | commit $(git rev-parse --short HEAD) | fabrica-server | P2 do planejamento de producao: aba Planejamento de carga (capacidade por setor, prioridade do item, calendario por data prometida, itens que vao atrasar, gravar previsoes) | health OK" >> deploy/REGISTRO-DEPLOYS.md
git add deploy/REGISTRO-DEPLOYS.md
git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" commit -m "deploy: registro — P2 do planejamento de produção (fabrica-server)"
git push origin claude/unified-server-status-7633oz
echo "OK P2 do planejamento DEPLOYADO e registrado"
