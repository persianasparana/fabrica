#!/usr/bin/env bash
# Deploy — P1 do PLANEJAMENTO DE PRODUÇÃO no PCP: aba NECESSIDADE DE MATERIAIS
# (06/11/2026; espec docs/ESPEC-PLANEJAMENTO-PRODUCAO.md §3.2 d).
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-planejamento-p1.sh
# Sem migration (reaproveita o P0: spec_nucleo + /lista-materiais do Núcleo v14.88 em blocos de
# até 250 peças). Cobre P0 e P2 se ainda não aplicados (migrations no boot).
# ⚠ ORDEM: Núcleo v14.88 (aplicar-v14-88-lista-materiais.sh) ANTES — sem ele a tela diz o motivo.
set -euo pipefail
cd /var/www/fabrica

grep -q "export async function necessidadeMateriais" server/src/necessidade.js \
  || { echo "ERRO: server/src/necessidade.js ausente — rode git pull antes"; exit 1; }
grep -q "'/necessidade'" server/src/routes/pcp.js \
  || { echo "ERRO: rota /pcp/necessidade ausente"; exit 1; }
grep -q "export function dividirEmBlocos" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js sem a divisao em blocos"; exit 1; }
grep -q "export function erroListaMateriais" server/src/produtos-client.js \
  || { echo "ERRO: produtos-client.js sem o motivo da falha"; exit 1; }
grep -q "async function renderNecessidade" pcp/public/assets/js/necessidade.js \
  || { echo "ERRO: tela necessidade.js ausente"; exit 1; }
grep -q 'data-page="necessidade"' pcp/public/index.html \
  || { echo "ERRO: index.html sem a aba Necessidade de materiais"; exit 1; }
grep -q "'necessidade'" server/src/routes/admin.js \
  || { echo "ERRO: ABAS sem necessidade (permissoes)"; exit 1; }
echo "== commit do P1 confirmado =="

if ! grep -q '^PRODUTOS_SERVICE_KEY=..*' server/.env 2>/dev/null; then
  echo "AVISO: PRODUTOS_SERVICE_KEY ausente/vazia em server/.env — a necessidade fica indisponivel ate configurar."
fi
NUC_OK=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:3070/api/v1/lista-materiais -H "Content-Type: application/json" -d '{}' || true)
if [ "$NUC_OK" = "404" ]; then
  echo "AVISO: o Nucleo em :3070 NAO tem o /lista-materiais (v14.88) — aplique aplicar-v14-88-lista-materiais.sh no repo produtos."
fi

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="
NEC=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3020/api/pcp/necessidade || true)
[ "$NEC" = "401" ] || echo "AVISO: GET /api/pcp/necessidade respondeu $NEC (esperado 401 sem sessao)"

echo "== conferencia (banco) =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'pecas abertas sem corte: '||count(*) FROM pcp_pecas pp WHERE pp.conclusao IS NULL AND NOT EXISTS (SELECT 1 FROM pcp_peca_etapas e WHERE e.peca_id = pp.id AND e.inicio IS NOT NULL);" || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'setores de corte (ordem_corte): '||count(*) FROM pcp_setores WHERE ativo AND ordem_corte;" || true

[ -f deploy/REGISTRO-DEPLOYS.md ] || cat > deploy/REGISTRO-DEPLOYS.md <<'EOT'
# Registro de deploys — produção `aplicativos` (append-only)

> Formato: `- AAAA-MM-DD HH:MM | commit <hash> | <processos> | <o que subiu> | <resultado>`

<!-- linhas novas ABAIXO desta marca (não editar as anteriores) -->
EOT
echo "- $(date '+%Y-%m-%d %H:%M') | commit $(git rev-parse --short HEAD) | fabrica-server | P1 do planejamento de producao: aba Necessidade de materiais (horizonte liberado-e-nao-cortou / abertos / pedidos, tecido por colecao x cor, perfis em barras, componentes, CSV; Nucleo em blocos de 250) | health OK" >> deploy/REGISTRO-DEPLOYS.md
git add deploy/REGISTRO-DEPLOYS.md
git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" commit -m "deploy: registro — P1 do planejamento de produção (fabrica-server)"
git push origin claude/unified-server-status-7633oz
echo "OK P1 do planejamento DEPLOYADO e registrado"
