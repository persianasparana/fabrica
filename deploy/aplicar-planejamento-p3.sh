#!/usr/bin/env bash
# Deploy — P3 do PLANEJAMENTO DE PRODUÇÃO no PCP: integração com o COMPRAS
# (06/11/2026; espec docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.2 d/e + §3.3).
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-planejamento-p3.sh
# Sem migration manual: o db.js cria no boot pcp_compras_pendencias (outbox), pcp_requisicoes
# e pcp_pecas.materiais_baixados_em. Cobre P0/P1/P2 se ainda não aplicados (mesmo boot).
# ⚠ ORDEM: Compras `aplicar-solicitacoes-compra.sh` (migration 013 + SERVICE_KEY_PCP) ANTES;
#   depois este; depois o .env daqui: COMPRAS_API_BASE=http://127.0.0.1:3050/api/v1 e
#   COMPRAS_SERVICE_KEY=<SERVICE_KEY_PCP do Compras> + pm2 restart. Sem a chave a Necessidade
#   mostra "sem integração" (nada quebra, nada requisita, nada baixa).
set -euo pipefail
cd /var/www/fabrica

grep -q "export async function enviarComOutbox" server/src/compras-client.js \
  || { echo "ERRO: server/src/compras-client.js ausente — rode git pull antes"; exit 1; }
grep -q "pcp_compras_pendencias" server/src/db.js && grep -q "pcp_requisicoes" server/src/db.js && grep -q "materiais_baixados_em" server/src/db.js \
  || { echo "ERRO: db.js sem as tabelas/colunas do P3"; exit 1; }
grep -q "'/necessidade/requisitar'" server/src/routes/pcp.js && grep -q "'/pedido/baixa-materiais'" server/src/routes/pcp.js \
  || { echo "ERRO: rotas de requisicao/baixa ausentes"; exit 1; }
grep -q "baixarMateriaisDaPeca(peca.id" server/src/routes/pcp.js \
  || { echo "ERRO: bipagem sem a baixa de materiais"; exit 1; }
grep -q "export async function requisitarCompras" server/src/necessidade.js \
  || { echo "ERRO: necessidade.js sem requisitarCompras"; exit 1; }
grep -q "iniciarRetryCompras()" server/src/server.js \
  || { echo "ERRO: server.js sem o agendador do outbox do Compras"; exit 1; }
grep -q "function necAbrirRequisicao" pcp/public/assets/js/necessidade.js \
  || { echo "ERRO: tela sem o modal Requisitar"; exit 1; }
grep -q "ped-baixa-materiais" pcp/public/assets/js/app.js \
  || { echo "ERRO: Editar Pedido sem o botao de baixa manual"; exit 1; }
echo "== commit do P3 confirmado =="
node --check server/src/compras-client.js server/src/necessidade.js server/src/routes/pcp.js server/src/lista-materiais.js
node server/test/carga.test.mjs >/dev/null && echo "== teste do sequenciador OK =="

if ! grep -q '^COMPRAS_SERVICE_KEY=..*' server/.env 2>/dev/null; then
  echo "AVISO: COMPRAS_SERVICE_KEY ausente em server/.env — integracao com o Compras DESLIGADA"
  echo "       (Necessidade sem saldo/falta, sem Requisitar, sem baixa). Defina COMPRAS_API_BASE e"
  echo "       COMPRAS_SERVICE_KEY (= SERVICE_KEY_PCP do Compras) e rode pm2 restart fabrica-server."
fi
SVC=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:3050/api/v1/integracao/estoque/saldos?skus=x" || true)
if [ "$SVC" = "404" ]; then
  echo "AVISO: o Compras em :3050 NAO tem o /integracao (migration 013) — aplique aplicar-solicitacoes-compra.sh no repo compras."
fi

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

echo "== conferencia (banco) =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'tabelas do P3: '||count(*)||'/2' FROM information_schema.tables WHERE table_name IN ('pcp_compras_pendencias','pcp_requisicoes');" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'pendencias no outbox do Compras: '||count(*) FROM pcp_compras_pendencias;" || true

[ -f deploy/REGISTRO-DEPLOYS.md ] || cat > deploy/REGISTRO-DEPLOYS.md <<'EOT'
# Registro de deploys — produção `aplicativos` (append-only)

> Formato: `- AAAA-MM-DD HH:MM | commit <hash> | <processos> | <o que subiu> | <resultado>`

<!-- linhas novas ABAIXO desta marca (não editar as anteriores) -->
EOT
echo "- $(date '+%Y-%m-%d %H:%M') | commit $(git rev-parse --short HEAD) | fabrica-server | P3 do planejamento de producao: integracao com o Compras (saldo/falta na Necessidade, Requisitar ao Compras com outbox + idempotencia, baixa de materiais na 1a bipagem e manual por pedido, agendador de reenvio) | health OK" >> deploy/REGISTRO-DEPLOYS.md
git add deploy/REGISTRO-DEPLOYS.md
git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" commit -m "deploy: registro — P3 do planejamento de produção (fabrica-server)"
git push origin claude/unified-server-status-7633oz
echo "OK P3 do planejamento DEPLOYADO e registrado"
