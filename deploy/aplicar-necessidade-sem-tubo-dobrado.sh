#!/usr/bin/env bash
# Deploy — A NECESSIDADE DE MATERIAIS NÃO SOMA O TUBO DUAS VEZES (27/11/2026).
#
# Achado na auditoria do Relatório de custo do pedido 2026/1348 (o cliente perguntou se o aproveitamento de tecido
#   estava certo — o tecido está; a lista abaixo é o que não estava): o Núcleo devolve o tubo de enrolar em DOIS
#   lugares da lista de materiais — em `perfis` (a linha "Tubo 32mm" do plano de corte, com as barras) e em `tubos`
#   (por diâmetro). A Ficha e a tabela da tela da Necessidade já mostravam só um; a MÉTRICA "Perfis / tubos" e o CSV
#   da Necessidade somavam os dois — e, até a v14.102 do Núcleo, o `tubos` ainda levava o tubo ROLETE junto (118
#   barras de tubo 32 mm no 2026/1348, quando são 59). Um comprador lendo o CSV pediria o tubo em dobro.
# O que entra:
#   · server/src/necessidade.js `tubosForaDosPerfis`: a Necessidade devolve em `tubos` só o tubo que NÃO tem linha
#     própria em `perfis` (a mesma regra da Ficha — o nome do corte sem espaço e sem caixa); a métrica e o CSV leem
#     daí. Teste novo em test/lista-materiais.test.mjs.
# Não muda preço, consumo de tecido, Ficha nem os documentos da produção por etapas (que usam `perfis`). Não depende
#   de versão do Núcleo (com a v14.102 o `tubos` dele já vem sem o rolete; com a anterior este filtro tira o tubo
#   que está em `perfis` e o rolete continua só em `perfis`, que é onde ele deve estar).
# ORDEM (recomendada, não obrigatória): Núcleo v14.102 → Comercial v2.143.0 → este.
#
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-necessidade-sem-tubo-dobrado.sh
set -euo pipefail
cd /var/www/fabrica

[ -f deploy/lib-estado.sh ] || { echo "ERRO: deploy/lib-estado.sh ausente — rode git pull antes"; exit 1; }
source deploy/lib-estado.sh
estado_antes "$(basename "$0")" "necessidade sem tubo dobrado"

# ── guardas: o commit desta entrega está no checkout?
grep -q "export function tubosForaDosPerfis(tubos, perfis)" server/src/necessidade.js \
  || { echo "ERRO: necessidade.js sem tubosForaDosPerfis — rode git pull antes"; exit 1; }
grep -qF "tubos: tubosForaDosPerfis(d.tubos || [], perfis)," server/src/necessidade.js \
  || { echo "ERRO: a Necessidade ainda devolve todos os tubos (soma o tubo duas vezes)"; exit 1; }
grep -q "o tubo que já está em perfis não é somado de novo" server/test/lista-materiais.test.mjs \
  || { echo "ERRO: test/lista-materiais.test.mjs sem o caso do tubo — rode git pull antes"; exit 1; }
echo "== commit da entrega confirmado =="

node --check server/src/necessidade.js
( cd server && npm run -s check > /tmp/fabrica-check-tubo.log 2>&1 ) \
  || { echo "ERRO: npm run check falhou:"; tail -20 /tmp/fabrica-check-tubo.log; exit 1; }
( cd server && npm test > /tmp/fabrica-testes-tubo.log 2>&1 ) \
  || { echo "ERRO: os testes sem banco falharam:"; tail -40 /tmp/fabrica-testes-tubo.log; exit 1; }
echo "== testes sem banco OK ($(grep -E '^# pass' /tmp/fabrica-testes-tubo.log | grep -o '[0-9]*' | head -1) testes) =="

# ── o Núcleo já devolve os tubos sem o rolete? (só INFORMA — este deploy não depende disso)
VERSAO_NUCLEO="$(curl -s --max-time 5 http://127.0.0.1:3070/api/health | python3 -c "import json,sys;print(json.load(sys.stdin).get('versao',''))" 2>/dev/null || true)"
python3 - "${VERSAO_NUCLEO:-}" <<'PYV' || true
import sys
v = sys.argv[1] if len(sys.argv) > 1 else ''
try:
    partes = [int(x) for x in v.split('.')[:2]]
    nova = partes >= [14, 102]
except Exception:
    nova = None
if nova is True:
    print('== Nucleo ' + v + ': a lista de materiais ja vem com os tubos sem o rolete ==')
elif nova is False:
    print('AVISO (nao impede o deploy): Nucleo ' + v + ' — anterior a v14.102. A Necessidade ja deixa de somar o tubo duas vezes;')
    print('      o Relatorio de custo do Comercial so corrige a secao Tubos com a v14.102 do Nucleo.')
else:
    print('  (nao foi possivel ler a versao do Nucleo — segue)')
PYV

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

echo "== conferencia =="
( cd server && node bin/conferir-lista-materiais.js ) || true

echo
echo "DEPOIS DO DEPLOY:"
echo " 1. Necessidade de materiais: a metrica 'Perfis / tubos' e o CSV deixam de contar o tubo de enrolar duas vezes"
echo "    (ele aparece uma vez, na linha do perfil 'Tubo 32mm', com as barras). O tubo rolete segue na sua linha."
echo " 2. Nada mais muda: Ficha, documentos da producao por etapas e requisicao ao Compras ja liam os perfis."

registrar_deploy "necessidade sem tubo dobrado" "A NECESSIDADE DE MATERIAIS NAO SOMA O TUBO DUAS VEZES (27/11; achado na auditoria do Relatorio de custo do 2026/1348): o Nucleo devolve o tubo de enrolar em perfis (linha do plano de corte) e em tubos (por diametro); a metrica 'Perfis / tubos' e o CSV da Necessidade somavam os dois (ate o Nucleo v14.102 o tubos ainda levava o rolete: 118 barras de 32 mm no 1348, sao 59). necessidade.js tubosForaDosPerfis — so o tubo sem linha propria em perfis (a regra da Ficha). Teste em test/lista-materiais.test.mjs. Nao muda preco nem consumo; nao depende de versao do Nucleo" "fabrica-server"
