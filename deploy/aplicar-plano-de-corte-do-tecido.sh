#!/usr/bin/env bash
# Deploy — PLANO DE CORTE DO TECIDO NA FICHA + AMBIENTE DA PEÇA (26/11/2026).
#
# Pedido do cliente (26/11): "Para o cálculo de consumo de tecido eu preciso do melhor
#   aproveitamento de tecido economizando o máximo que pudermos mesmo que usemos larguras
#   diferentes do mesmo tecido, só não pode usar larguras diferentes do mesmo tecido no mesmo
#   ambiente". Quem calcula é o Núcleo de Produtos (v14.98: o tecido de cada pedido é planejado
#   no pedido inteiro — peças de ambientes diferentes dividem o rolo, uma largura por ambiente).
#   Este deploy é a parte do PCP:
#   · a peça vai ao Núcleo com o PEDIDO dela (o tecido nunca é planejado entre pedidos
#     diferentes; "Sala" de dois pedidos não é o mesmo ambiente);
#   · o PEDIDO NUNCA É PARTIDO em blocos (até 2.000 peças por chamada): um pedido de 300 peças
#     dividido em dois blocos teria dois planos e o mesmo ambiente poderia sair de duas larguras;
#   · a Ficha de Produção imprime o PLANO DE CORTE do tecido (rolo → faixa → peças lado a lado,
#     com item, peça e ambiente) — é o corte que a fábrica tem de SEGUIR para o tecido separado
#     dar: cortando ambiente por ambiente gasta mais do que a lista manda separar/comprar;
#   · o AMBIENTE da peça: a liberação gravava a coluna de texto `ambiente` do item do Comercial,
#     que é legada e vem NULA em todo pedido montado com ambientes (o nome mora em
#     `pedido.ambientes[]`, pelo `ambienteId`). A Ficha e a etiqueta saíam sem o ambiente e o
#     Núcleo tratava o pedido inteiro como UM ambiente (réplica, casa de 5 janelas: 14,50 m² de
#     tecido numa largura só, contra 12,68 m² com os ambientes certos). Agora a liberação resolve
#     o nome pelo cadastro de ambientes do pedido (a mesma regra do Comercial), a aba Comercial
#     mostra o ambiente, e `bin/completar-ambiente.js` preenche as peças JÁ NA FILA relendo o
#     pedido no Comercial (só onde está vazio; o que foi digitado no PCP fica).
# O que entra: server/src/nucleo-spec.js (ambienteDoItemComercial), routes/comercial.js,
#   lista-materiais.js (pedido na peça, blocos por pedido, plano_tecido na mescla),
#   completar-ambiente.js + bin/completar-ambiente.js, bin/conferir-lista-materiais.js
#   (--sonda-plano e o plano no resumo), Ficha (bloco "Plano de corte") e aba Comercial;
#   testes sem banco test/lista-materiais.test.mjs e test/ambiente.test.mjs.
# Sem migration: nenhuma tabela/coluna nova. Não muda preço (o PCP não calcula preço).
#
# ⚠ ORDEM (provedor antes do consumidor — docs/PROTOCOLO-FEDERACAO.md, regra 2):
#   1º NÚCLEO v14.98  cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-98-consumo-tecido-pedido.sh
#   2º este script.
#   O script SONDA o Núcleo e ABORTA dizendo o que aplicar antes. Para subir mesmo assim (nada
#   quebra: o Núcleo anterior ignora o pedido da peça e a Ficha sai sem o plano de corte; o
#   ambiente das peças já passa a valer):
#     PULAR_SONDAS=1 bash deploy/aplicar-plano-de-corte-do-tecido.sh
#   O Comercial (v2.141.0 — o Relatório de custo passa a explicar o plano) é independente deste.
#
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-plano-de-corte-do-tecido.sh
set -euo pipefail
cd /var/www/fabrica

[ -f deploy/lib-estado.sh ] || { echo "ERRO: deploy/lib-estado.sh ausente — rode git pull antes"; exit 1; }
source deploy/lib-estado.sh
estado_antes "$(basename "$0")" "plano de corte do tecido"

# ── guardas: o commit desta entrega está no checkout?
grep -q "export function ambienteDoItemComercial" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem ambienteDoItemComercial — rode git pull antes"; exit 1; }
[ "$(grep -c "ambienteDoItemComercial(it, detalhe.ambientes)" server/src/routes/comercial.js)" -ge 3 ] \
  || { echo "ERRO: a liberacao (routes/comercial.js) nao resolve o ambiente pelo cadastro de ambientes do pedido"; exit 1; }
grep -q "corpo.pedido = String(item.pedido)" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js nao manda o pedido da peca ao Nucleo"; exit 1; }
grep -q "export const LOTE_PEDIDO_MAX" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js ainda parte o pedido em blocos"; exit 1; }
grep -q "out.plano_tecido = blocos.flatMap" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js nao leva o plano de corte na mescla dos blocos"; exit 1; }
grep -q "export async function completarAmbiente" server/src/completar-ambiente.js \
  || { echo "ERRO: server/src/completar-ambiente.js ausente — rode git pull antes"; exit 1; }
[ -f server/bin/completar-ambiente.js ] \
  || { echo "ERRO: server/bin/completar-ambiente.js ausente — rode git pull antes"; exit 1; }
grep -q "sonda-plano" server/bin/conferir-lista-materiais.js \
  || { echo "ERRO: conferir-lista-materiais.js sem a sonda do plano de corte"; exit 1; }
grep -q "function blocoPlanoTecido" pcp/public/assets/js/ficha-producao.js \
  || { echo "ERRO: Ficha de Producao sem o bloco do plano de corte"; exit 1; }
grep -q "ambienteDe(it)" pcp/public/assets/js/comercial.js \
  || { echo "ERRO: aba Comercial sem o ambiente resolvido"; exit 1; }
[ -f server/test/lista-materiais.test.mjs ] && [ -f server/test/ambiente.test.mjs ] \
  || { echo "ERRO: testes novos ausentes (test/lista-materiais.test.mjs, test/ambiente.test.mjs) — rode git pull antes"; exit 1; }
echo "== commit da entrega confirmado =="

node --check server/src/nucleo-spec.js
node --check server/src/lista-materiais.js
node --check server/src/completar-ambiente.js
node --check server/src/routes/comercial.js
node --check server/bin/completar-ambiente.js
node --check server/bin/conferir-lista-materiais.js
node --check pcp/public/assets/js/ficha-producao.js
node --check pcp/public/assets/js/comercial.js
node server/test/carga.test.mjs >/dev/null && echo "== teste do sequenciador OK =="
node server/test/nucleo-spec.test.mjs | tail -1
( cd server && node --test test/lista-materiais.test.mjs test/ambiente.test.mjs > /tmp/fabrica-testes-plano.log 2>&1 ) \
  || { echo "ERRO: os testes da lista de materiais / do ambiente falharam:"; tail -40 /tmp/fabrica-testes-plano.log; exit 1; }
echo "== testes da lista de materiais e do ambiente OK ($(grep -E '^# pass' /tmp/fabrica-testes-plano.log | grep -o '[0-9]*' | head -1) testes) =="

# ── sonda do PROVEDOR (com a configuracao do proprio fabrica-server; nada e gravado)
echo "== sonda: Nucleo v14.98 (plano de corte do tecido) =="
set +e
( cd server && node bin/conferir-lista-materiais.js --sonda-plano )
SONDA=$?
set -e
case "$SONDA" in
  0) echo "== provedor pronto ==" ;;
  5) echo "AVISO: nao deu para sondar o Nucleo (motivo acima) — o deploy segue; confira depois com:"
     echo "       cd /var/www/fabrica/server && node bin/conferir-lista-materiais.js --sonda-plano" ;;
  3)
     if [ "${PULAR_SONDAS:-0}" = "1" ]; then
       echo "AVISO: PULAR_SONDAS=1 — subindo com o Nucleo ANTERIOR (acima). A lista funciona como hoje e a Ficha sai SEM o"
       echo "       plano de corte ate o Nucleo v14.98 entrar; o ambiente das pecas ja passa a valer."
     else
       echo "ERRO: Nucleo anterior a v14.98 (acima) — aplique-o ANTES e rode este script de novo."
       echo "      (para subir assim mesmo: PULAR_SONDAS=1 bash deploy/aplicar-plano-de-corte-do-tecido.sh)"
       exit 1
     fi ;;
  *) echo "ERRO: a sonda falhou (saida $SONDA) — veja a mensagem acima"; exit 1 ;;
esac

echo "== fila ANTES =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos vindos do Comercial: '||count(*)||' — SEM ambiente: '||count(*) FILTER (WHERE btrim(COALESCE(ambiente,'')) = '') FROM pcp_itens WHERE comercial_item_id IS NOT NULL AND conclusao IS NULL;" || true

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

# ── completa o AMBIENTE das pecas JA NA FILA (so preenche onde esta vazio; idempotente)
echo "== completar o ambiente das pecas ja na fila (rele o pedido no Comercial) =="
set +e
( cd server && node bin/completar-ambiente.js )
COMPLETAR=$?
set -e
case "$COMPLETAR" in
  0) ;;
  2) echo "AVISO: ficaram itens sem o ambiente por causa do Comercial (motivo acima). Nada quebra — o plano de corte"
     echo "       desses pedidos trata as pecas sem ambiente como um ambiente so. Para tentar de novo:"
     echo "       cd /var/www/fabrica/server && node bin/completar-ambiente.js" ;;
  *) echo "AVISO: completar-ambiente terminou com erro (saida $COMPLETAR) — a entrega esta no ar; rode de novo:"
     echo "       cd /var/www/fabrica/server && node bin/completar-ambiente.js" ;;
esac

echo "== conferencia =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos vindos do Comercial: '||count(*)||' — SEM ambiente: '||count(*) FILTER (WHERE btrim(COALESCE(ambiente,'')) = '')||' — ambientes distintos: '||count(DISTINCT pedido||'/'||ambiente) FILTER (WHERE btrim(COALESCE(ambiente,'')) <> '') FROM pcp_itens WHERE comercial_item_id IS NOT NULL AND conclusao IS NULL;" || true
( cd server && node bin/conferir-lista-materiais.js ) || true

echo
echo "DEPOIS DO DEPLOY:"
echo " 1. Abra a Ficha de Producao de um pedido de rolo com pecas em mais de um ambiente: abaixo da tabela de tecido"
echo "    sai o bloco 'Plano de corte' (rolo -> faixa -> pecas lado a lado). A fabrica precisa CORTAR SEGUINDO O PLANO:"
echo "    cortando ambiente por ambiente gasta mais tecido do que a lista manda separar."
echo " 2. A Ficha e a etiqueta dos pedidos liberados DAQUI EM DIANTE trazem o ambiente; para os que ja estavam na fila"
echo "    o script acima completou o que deu (etiqueta ja impressa nao muda — reimprima se precisar do ambiente)."
echo " 3. Necessidade de materiais: o tecido de cada pedido sai do plano DELE (nada e cortado entre pedidos diferentes)."
echo " 4. A regra liga/desliga no painel do NUCLEO (Regras gerais > Parametros > 'Consumo de tecido — melhor"
echo "    aproveitamento do pedido'). Desligada, a Ficha sai sem o plano e o tecido volta a ser calculado por ambiente."
echo " 5. A baixa de estoque da 1a bipagem segue pedindo a peca SOZINHA ao Nucleo (rolo e metros individuais) — com o"
echo "    plano do pedido o rolo de onde a peca sai pode ser outro; ajuste pendente, so importa com o estoque de tecido"
echo "    controlado pelo Compras."

registrar_deploy "plano de corte do tecido" "PLANO DE CORTE DO TECIDO NA FICHA + AMBIENTE DA PECA (26/11; par do Nucleo v14.98 — consumo de tecido pelo melhor aproveitamento do pedido, uma largura de rolo por ambiente): a peca vai ao Nucleo com o PEDIDO dela e o pedido nunca e partido em blocos (ate 2.000 pecas por chamada); a Ficha de Producao imprime o plano de corte (rolo, faixa, pecas lado a lado com item/peca/ambiente); a liberacao grava o AMBIENTE pelo cadastro de ambientes do pedido (a coluna de texto do item do Comercial e legada e vinha nula — Ficha/etiqueta sem ambiente e o pedido inteiro tratado como um ambiente so); completar-ambiente preenche as pecas ja na fila relendo o pedido no Comercial (so onde esta vazio); conferir-lista-materiais --sonda-plano. Sem migration; nao muda preco. Exige Nucleo v14.98 ANTES (sondado)" "fabrica-server"
