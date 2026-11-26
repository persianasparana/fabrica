#!/usr/bin/env bash
# Deploy — LISTA DE MATERIAIS DO PCP COMO A VENDA COTOU (25/11/2026).
#
# O que estava errado (medido na réplica, Núcleo :3070 — as três diferenças que o Comercial
#   fechou na recotação dele na v2.139.1 valiam também para a lista de materiais do PCP):
#   · peça MANUAL da linha "tubo 53" da tabela de limites (BK COLISEU 2,17 × 2,26): a lista saía
#     com o perfil do tubo 47 (`p47_tubo`) — a venda cobrou o tubo 53;
#   · TROCA DE TELA (tipo "Somente tecido"): a lista saía com a peça INTEIRA (15 componentes);
#   · peça LARGA em coleção com rolos de duas larguras (AM 3059 2,17 × 2,26): 422
#     `peca_excede_rolo` — a peça caía em "peças que não calcularam" (4,2% das peças de uma
#     varredura de 51.816 vendas simuladas).
#   Causa: `nucleo-spec.js corpoDaPeca` fixava os códigos EFETIVOS gravados na venda, e o Núcleo
#   trata sku fixado de outro jeito (sem o tubo da linha, sem a escolha da largura do rolo, sem o
#   `so_tecido`).
# O que entra:
#   · server/src/nucleo-spec.js — o corpo vai COMO A VENDA COTOU: PRODUTO pelo cadastro do tipo de
#     peça que o Comercial manda em `nucleoCotacao` (seleção automática = sem produto_sku; somente
#     tecido = so_tecido; sentinela/sku = produto_sku; + tubo equiparado do ambiente) e TECIDO pela
#     coleção. Os códigos gravados na venda ficam de RESERVA (`corposDaPeca`): a peça que não
#     calcula, ou calcula OUTRA estrutura que a vendida, volta por eles (`calcularComReserva`) —
#     por construção, peça que calculava com o corpo antigo continua calculando;
#   · server/src/lista-materiais.js — a conferência por bloco, as notas por item (Ficha) e os
#     avisos do pedido; a baixa de materiais da 1ª bipagem usa a MESMA decisão;
#   · server/src/completar-spec.js + bin/completar-spec-nucleo.js — completa as peças JÁ NA FILA
#     relendo o pedido no Comercial (só acrescenta `spec_nucleo.cotacao`, só onde falta);
#   · bin/conferir-lista-materiais.js — sonda dos provedores e resumo da lista de um pedido;
#   · Ficha de Produção: nota no item ("SOMENTE TECIDO (troca de tela)…", "lista pelos códigos
#     gravados na venda…");
#   · test/nucleo-spec.test.mjs (64 verificações, sem banco) e deploy/lib-estado.sh (log completo +
#     registro de falha, como nos outros módulos).
# Sem migration: nenhuma tabela/coluna nova (a chave nova mora dentro de `pcp_itens.spec_nucleo`).
#
# ⚠ ORDEM (provedor antes do consumidor — docs/PROTOCOLO-FEDERACAO.md, regra 2):
#   1º NÚCLEO v14.97      cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-97-troca-de-tela-lista.sh
#   2º COMERCIAL v2.140.1 cd /var/www/agenda/agenda-consultores && git pull --ff-only origin claude/trusting-johnson-K7jQ7 && bash deploy/aplicar-v2.140.1.sh
#   3º este script.
#   O script SONDA os dois e ABORTA dizendo o que aplicar antes. Para subir mesmo assim (nada
#   quebra: sem o Núcleo novo a troca de tela segue com a estrutura e a tela AVISA; sem o Comercial
#   novo as peças seguem pelo sku gravado e só o tecido passa a ir pela coleção):
#     PULAR_SONDAS=1 bash deploy/aplicar-lista-como-a-venda.sh
#
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-lista-como-a-venda.sh
set -euo pipefail
cd /var/www/fabrica

[ -f deploy/lib-estado.sh ] || { echo "ERRO: deploy/lib-estado.sh ausente — rode git pull antes"; exit 1; }
source deploy/lib-estado.sh
estado_antes "$(basename "$0")" "lista de materiais como a venda"

# ── guardas: o commit desta entrega está no checkout?
grep -q "export function corposDaPeca" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem corposDaPeca — rode git pull antes"; exit 1; }
grep -q "export async function calcularComReserva" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem a conferencia contra a venda (calcularComReserva)"; exit 1; }
grep -q "export function cotacaoDoItemComercial" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem a leitura de nucleoCotacao"; exit 1; }
grep -q "export async function calcularBloco" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js sem a conferencia por bloco"; exit 1; }
grep -q "itens_sem_cotacao" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js sem o aviso de itens liberados antes"; exit 1; }
grep -q "export async function completarSpecNucleo" server/src/completar-spec.js \
  || { echo "ERRO: server/src/completar-spec.js ausente — rode git pull antes"; exit 1; }
[ -f server/bin/completar-spec-nucleo.js ] \
  || { echo "ERRO: server/bin/completar-spec-nucleo.js ausente — rode git pull antes"; exit 1; }
[ -f server/bin/conferir-lista-materiais.js ] \
  || { echo "ERRO: server/bin/conferir-lista-materiais.js ausente — rode git pull antes"; exit 1; }
[ -f server/test/nucleo-spec.test.mjs ] \
  || { echo "ERRO: server/test/nucleo-spec.test.mjs ausente — rode git pull antes"; exit 1; }
grep -q "agg.notas" pcp/public/assets/js/ficha-producao.js \
  || { echo "ERRO: Ficha de Producao sem as notas do item"; exit 1; }
echo "== commit da entrega confirmado =="

node --check server/src/nucleo-spec.js
node --check server/src/lista-materiais.js
node --check server/src/completar-spec.js
node --check server/bin/completar-spec-nucleo.js
node --check server/bin/conferir-lista-materiais.js
node --check pcp/public/assets/js/ficha-producao.js
node server/test/carga.test.mjs >/dev/null && echo "== teste do sequenciador OK =="
node server/test/nucleo-spec.test.mjs | tail -1

# ── sonda dos PROVEDORES (com a configuracao do proprio fabrica-server; nada e gravado)
echo "== sonda: Nucleo v14.97 e Comercial v2.140.1 =="
set +e
( cd server && node bin/conferir-lista-materiais.js --sonda )
SONDA=$?
set -e
case "$SONDA" in
  0) echo "== provedores prontos ==" ;;
  5) echo "AVISO: nao deu para sondar um dos provedores (motivo acima) — o deploy segue; confira depois com:"
     echo "       cd /var/www/fabrica/server && node bin/conferir-lista-materiais.js --sonda" ;;
  3|4)
     if [ "${PULAR_SONDAS:-0}" = "1" ]; then
       echo "AVISO: PULAR_SONDAS=1 — subindo com o provedor ANTERIOR (acima). A lista funciona, mas a correcao so"
       echo "       fica completa depois de aplicar o provedor e rodar: cd /var/www/fabrica/server && node bin/completar-spec-nucleo.js"
     else
       echo "ERRO: provedor anterior a versao necessaria (acima) — aplique-o ANTES e rode este script de novo."
       echo "      (para subir assim mesmo: PULAR_SONDAS=1 bash deploy/aplicar-lista-como-a-venda.sh)"
       exit 1
     fi ;;
  *) echo "ERRO: a sonda falhou (saida $SONDA) — veja a mensagem acima"; exit 1 ;;
esac

echo "== fila ANTES =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos com a especificacao da venda: '||count(*)||' — com \"como foi cotada\": '||count(*) FILTER (WHERE spec_nucleo ? 'cotacao') FROM pcp_itens WHERE spec_nucleo IS NOT NULL AND conclusao IS NULL;" || true

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

# ── completa as pecas JA NA FILA (so acrescenta spec_nucleo.cotacao onde falta; idempotente)
echo "== completar a especificacao das pecas ja na fila (rele o pedido no Comercial) =="
set +e
( cd server && node bin/completar-spec-nucleo.js )
COMPLETAR=$?
set -e
case "$COMPLETAR" in
  0) ;;
  2) echo "AVISO: ficaram itens sem a informacao (motivo acima). Nada quebra — a lista deles segue pela estrutura"
     echo "       gravada na venda e a tela avisa. Para tentar de novo: cd /var/www/fabrica/server && node bin/completar-spec-nucleo.js" ;;
  *) echo "AVISO: completar-spec-nucleo terminou com erro (saida $COMPLETAR) — a entrega esta no ar; rode de novo:"
     echo "       cd /var/www/fabrica/server && node bin/completar-spec-nucleo.js" ;;
esac

echo "== conferencia =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos com a especificacao da venda: '||count(*)||' — com \"como foi cotada\": '||count(*) FILTER (WHERE spec_nucleo ? 'cotacao')||' — trocas de tela: '||count(*) FILTER (WHERE spec_nucleo->'cotacao'->>'produto' = '__so_tecido')||' — selecao automatica: '||count(*) FILTER (WHERE spec_nucleo->'cotacao'->>'produto' = '__auto') FROM pcp_itens WHERE spec_nucleo IS NOT NULL AND conclusao IS NULL;" || true
( cd server && node bin/conferir-lista-materiais.js ) || true

echo
echo "DEPOIS DO DEPLOY:"
echo " 1. Abra a Ficha de Producao de um pedido com troca de tela: o item traz a nota 'SOMENTE TECIDO (troca de"
echo "    tela)' e a lista so o tecido. Peca manual da linha 'tubo 53': a lista traz o perfil do tubo 53."
echo " 2. Necessidade de materiais: as pecas largas de colecao com dois rolos saem de 'pecas que nao calcularam'"
echo "    (o tecido delas passa a entrar na necessidade — confira antes de requisitar ao Compras)."
echo " 3. Item com a nota 'lista pelos codigos gravados na venda': o tipo de peca, a colecao ou a tabela de limites"
echo "    mudaram depois da venda — a lista segue a estrutura VENDIDA."
echo " 4. Pedidos liberados DAQUI EM DIANTE ja chegam completos; para os antigos o script acima completou o que deu."

registrar_deploy "lista como a venda" "LISTA DE MATERIAIS COMO A VENDA COTOU (25/11): nucleo-spec.js monta o corpo do /lista-materiais como a tela do Comercial (produto pelo cadastro do tipo em nucleoCotacao — selecao automatica, somente tecido, sentinela/sku, tubo equiparado — e tecido pela colecao); os codigos gravados na venda viram RESERVA (peca que nao calcula ou calcula outra estrutura volta por eles — quem calculava segue calculando); notas por item na Ficha; completar-spec-nucleo completa as pecas ja na fila relendo o pedido no Comercial; conferir-lista-materiais (sonda + resumo); lib-estado.sh na Fabrica. Corrige: tubo 47 na peca da linha tubo 53, troca de tela listada como peca inteira, peca larga de colecao com dois rolos em 'nao calcularam'. Sem migration. Exige Nucleo v14.97 e Comercial v2.140.1 ANTES (sondados)" "fabrica-server"
