#!/usr/bin/env bash
# Deploy — P0 do PLANEJAMENTO DE PRODUÇÃO no PCP (06/11/2026; espec docs/ESPEC-PLANEJAMENTO-PRODUCAO.md).
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-planejamento-p0.sh
# Sem migration manual: o db.js roda os ALTERs idempotentes no boot (pcp_itens.spec_nucleo,
# produto_sku nas estruturas onde NULL, pcp_config.roteiro_linhas).
# ⚠ ORDEM: Núcleo de Produtos v14.88 (aplicar-v14-88-lista-materiais.sh) ANTES — sem ele a Ficha
#   de Produção sai sem a lista de materiais (best-effort) e o /pcp/pedido/materiais diz o motivo.
set -euo pipefail
cd /var/www/fabrica

grep -q "export function specDoItemComercial" server/src/nucleo-spec.js \
  || { echo "ERRO: server/src/nucleo-spec.js ausente — rode git pull antes"; exit 1; }
grep -q "export async function listaMateriaisDosPedidos" server/src/lista-materiais.js \
  || { echo "ERRO: server/src/lista-materiais.js ausente"; exit 1; }
grep -q "spec_nucleo: specDoItemComercial(it)" server/src/routes/comercial.js \
  || { echo "ERRO: a liberacao nao grava spec_nucleo"; exit 1; }
grep -q "'/pedido/materiais'" server/src/routes/pcp.js \
  || { echo "ERRO: rota /pcp/pedido/materiais ausente"; exit 1; }
grep -q "ADD COLUMN IF NOT EXISTS spec_nucleo JSONB" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna spec_nucleo"; exit 1; }
grep -q "roteiro_linhas" server/src/db.js \
  || { echo "ERRO: db.js sem o seed de roteiro_linhas"; exit 1; }
grep -q "ed-estrutura" pcp/public/assets/js/app.js \
  || { echo "ERRO: modal da fila sem o select de estrutura"; exit 1; }
grep -q "blocoResumoMateriais" pcp/public/assets/js/ficha-producao.js \
  || { echo "ERRO: Ficha sem a lista de materiais"; exit 1; }
if grep -q 'data-page="novo"' pcp/public/index.html; then echo "ERRO: index.html ainda tem a aba Novo Pedido"; exit 1; fi
echo "== commit do P0 confirmado =="

if ! grep -q '^PRODUTOS_SERVICE_KEY=..*' server/.env 2>/dev/null; then
  echo "AVISO: PRODUTOS_SERVICE_KEY ausente/vazia em server/.env — a lista de materiais fica"
  echo "       indisponivel (a Ficha sai sem ela) ate configurar a chave (mesma SERVICE_KEY do Nucleo :3070)."
fi
NUC_OK=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3070/api/v1/lista-materiais -H "Content-Type: application/json" -d '{}' || true)
if [ "$NUC_OK" = "404" ]; then
  echo "AVISO: o Nucleo em :3070 NAO tem o /lista-materiais (v14.88) — aplique aplicar-v14-88-lista-materiais.sh no repo produtos."
fi

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

echo "== conferencia (banco) =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'estruturas com produto_sku: '||count(*) FILTER (WHERE produto_sku IS NOT NULL)||'/'||count(*) FROM pcp_produtos WHERE ativo;" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'coluna spec_nucleo: '||count(*) FROM information_schema.columns WHERE table_name='pcp_itens' AND column_name='spec_nucleo';" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'roteiro_linhas: '||valor FROM pcp_config WHERE chave='roteiro_linhas';" || true

[ -f deploy/REGISTRO-DEPLOYS.md ] || cat > deploy/REGISTRO-DEPLOYS.md <<'EOT'
# Registro de deploys — produção `aplicativos` (append-only)

> Formato: `- AAAA-MM-DD HH:MM | commit <hash> | <processos> | <o que subiu> | <resultado>`

<!-- linhas novas ABAIXO desta marca (não editar as anteriores) -->
EOT
echo "- $(date '+%Y-%m-%d %H:%M') | commit $(git rev-parse --short HEAD) | fabrica-server | P0 do planejamento de producao: spec_nucleo na liberacao, produto_sku nas estruturas, Novo Pedido manual removido, Ficha com lista de materiais (Nucleo v14.88), roteiro por linha, modal da fila preserva produto_id | health OK" >> deploy/REGISTRO-DEPLOYS.md
git add deploy/REGISTRO-DEPLOYS.md
git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" commit -m "deploy: registro — P0 do planejamento de produção (fabrica-server)"
git push origin claude/unified-server-status-7633oz
echo "OK P0 do planejamento DEPLOYADO e registrado"
