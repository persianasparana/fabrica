#!/usr/bin/env bash
# Deploy — Plano de Corte do pedido via Núcleo de Produtos (:3070).
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-plano-corte-nucleo.sh
# Sem migration manual: o db.js roda os ALTERs idempotentes no boot
# (pcp_itens.produto_sku entra sozinho no restart).
set -euo pipefail
cd /var/www/fabrica

git cat-file -e HEAD:server/src/ordem-corte-nucleo.js \
  || { echo "ERRO: commit do plano de corte nao esta no checkout — rode git pull antes"; exit 1; }
git cat-file -e HEAD:pcp/public/plano-corte-nucleo.html \
  || { echo "ERRO: pagina imprimivel nao esta no checkout — rode git pull antes"; exit 1; }
echo "== commit do plano de corte confirmado =="

if ! grep -q '^PRODUTOS_SERVICE_KEY=..*' server/.env 2>/dev/null; then
  echo "AVISO: PRODUTOS_SERVICE_KEY ausente/vazia em server/.env — o Plano de Corte"
  echo "       responderá 503 até configurar a chave (mesma SERVICE_KEY do Núcleo :3070)."
fi

pm2 restart fabrica-server
sleep 3
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

[ -f deploy/REGISTRO-DEPLOYS.md ] || cat > deploy/REGISTRO-DEPLOYS.md <<'EOF'
# Registro de deploys — produção `aplicativos` (append-only)

> Formato: `- AAAA-MM-DD HH:MM | commit <hash> | <processos> | <o que subiu> | <resultado>`

<!-- linhas novas ABAIXO desta marca (não editar as anteriores) -->
EOF
echo "- $(date '+%Y-%m-%d %H:%M') | commit $(git rev-parse --short HEAD) | fabrica-server | Plano de Corte do pedido via Nucleo de Produtos :3070 (rota /plano-nucleo + pagina imprimivel + produto_sku no item) | health OK" >> deploy/REGISTRO-DEPLOYS.md
git add deploy/REGISTRO-DEPLOYS.md
git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" commit -m "deploy: registro — plano de corte via Núcleo (fabrica-server)"
git push origin claude/unified-server-status-7633oz
echo "OK plano de corte via Nucleo DEPLOYADO e registrado"
