#!/usr/bin/env bash
# Deploy — AMBIENTE DA PEÇA NA LIBERAÇÃO DO PCP + tecido aninhado POR AMBIENTE (26/11/2026).
#
# Pedido do cliente (26/11): "corrija o ambiente vazio na liberação do PCP".
# Apurado (réplica, pedido real de 14 itens em 4 ambientes lido do Comercial): os 13 itens entravam na fila
#   com o AMBIENTE VAZIO. No Comercial o orçamento é montado com ambientes: o item traz `ambienteId` e o NOME
#   mora em `pedido.ambientes[]`; a coluna de texto `item.ambiente` é legada e vem nula — e a liberação lia só
#   ela. Resultado: Ficha de Produção, etiqueta, tela "Ver" da aba Comercial e Plano de Corte ("(sem
#   ambiente)") sem o ambiente; e a lista de materiais mandava as peças ao Núcleo SEM grupo, então o tecido
#   era aninhado junto — até entre pedidos diferentes que caíssem no mesmo cálculo.
# O que entra:
#   · a liberação e a prévia resolvem o nome pelo vínculo (`ambientes[]` por `ambienteId`; a coluna de texto
#     vale para pedido antigo) — módulo puro server/src/nucleo-spec.js, com teste;
#   · peças JÁ na fila: bin/completar-ambiente.js relê cada pedido no Comercial e preenche o ambiente SÓ onde
#     está vazio (o que foi digitado na fila não é sobrescrito; rodar de novo não muda nada) — este script roda;
#   · TECIDO na lista de materiais (Ficha e Necessidade) — decisão do cliente (26/11): "por ambiente": só peças
#     do MESMO ambiente do MESMO pedido (mesma coleção e cor) dividem o rolo, a regra que a venda usou para
#     cobrar. Config `pcp_config.materiais_aninhar` = ambiente (padrão) | pedido | junto, semeada no boot.
# ⚠ O QUE MUDA NOS NÚMEROS: nos pedidos montados com ambientes a lista de materiais passa a pedir um pouco MAIS
#   de tecido que antes (antes juntava o pedido inteiro; réplica, pedido de 14 peças: 65,89 m → 67,64 m) e deixa
#   de aproveitar rolo entre pedidos diferentes. Componentes, perfis e tubos não mudam. Nenhum preço muda (o PCP
#   não calcula preço).
# Sem migration manual (a chave de configuração é semeada no boot do fabrica-server). Não depende de versão
#   nova do Comercial nem do Núcleo.
#
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-ambiente-na-liberacao.sh
set -euo pipefail
cd /var/www/fabrica

[ -f deploy/lib-estado.sh ] || { echo "ERRO: deploy/lib-estado.sh ausente — rode git pull antes"; exit 1; }
source deploy/lib-estado.sh
estado_antes "$(basename "$0")" "ambiente na liberacao"

# ── guardas: o commit desta entrega está no checkout?
grep -q "export function ambienteDoItemComercial" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem ambienteDoItemComercial — rode git pull antes"; exit 1; }
grep -q "export function grupoDeAninhamento" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem o grupo de aninhamento do tecido"; exit 1; }
grep -q "ambiente: ambienteDoItemComercial(it, ambientes)," server/src/routes/comercial.js \
  || { echo "ERRO: a liberacao ainda grava o ambiente pela coluna antiga (routes/comercial.js)"; exit 1; }
grep -q "ambiente: grupoDeAninhamento(item, aninhar)" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js ainda manda o ambiente cru ao Nucleo"; exit 1; }
grep -q "'materiais_aninhar', 'ambiente'" server/src/db.js \
  || { echo "ERRO: db.js sem a semente da configuracao materiais_aninhar"; exit 1; }
grep -q "export async function completarAmbiente" server/src/completar-ambiente.js \
  || { echo "ERRO: server/src/completar-ambiente.js ausente — rode git pull antes"; exit 1; }
[ -f server/bin/completar-ambiente.js ] \
  || { echo "ERRO: server/bin/completar-ambiente.js ausente — rode git pull antes"; exit 1; }
grep -q "const ambienteDe = (it) =>" pcp/public/assets/js/comercial.js \
  || { echo "ERRO: a tela da aba Comercial ainda le o ambiente pela coluna antiga"; exit 1; }
echo "== commit da entrega confirmado =="

node --check server/src/nucleo-spec.js
node --check server/src/lista-materiais.js
node --check server/src/completar-ambiente.js
node --check server/bin/completar-ambiente.js
node --check server/src/routes/comercial.js
node --check server/src/db.js
node --check pcp/public/assets/js/comercial.js
node server/test/carga.test.mjs >/dev/null && echo "== teste do sequenciador OK =="
node server/test/nucleo-spec.test.mjs | tail -1

echo "== fila ANTES =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos vindos do Comercial: '||count(*)||' — com o ambiente VAZIO: '||count(*) FILTER (WHERE btrim(COALESCE(ambiente,'')) = '')||' (em '||count(DISTINCT pedido) FILTER (WHERE btrim(COALESCE(ambiente,'')) = '')||' pedido(s))' FROM pcp_itens WHERE conclusao IS NULL AND comercial_item_id IS NOT NULL;" 2>/dev/null || true

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

ANINHAR="$(sudo -u postgres psql fabrica_db -Atc "SELECT valor FROM pcp_config WHERE chave = 'materiais_aninhar';" 2>/dev/null || true)"
case "$ANINHAR" in
  ambiente) echo "== tecido aninhado POR AMBIENTE de cada pedido (pcp_config.materiais_aninhar = ambiente) ==" ;;
  pedido|junto) echo "AVISO: pcp_config.materiais_aninhar esta em '$ANINHAR' (alguem trocou) — o padrao decidido pelo cliente e 'ambiente'." ;;
  *) echo "ERRO: a configuracao materiais_aninhar nao foi semeada no boot (valor '${ANINHAR:-vazio}') — veja: pm2 logs fabrica-server --lines 40"; exit 1 ;;
esac

# ── preenche o ambiente das pecas JA NA FILA (so onde esta vazio; idempotente)
echo "== preencher o ambiente das pecas ja na fila (rele o pedido no Comercial) =="
set +e
( cd server && node bin/completar-ambiente.js )
COMPLETAR=$?
set -e
case "$COMPLETAR" in
  0) ;;
  2) echo "AVISO: ficaram itens sem o ambiente por um motivo que depende de outra coisa (acima). Nada quebra."
     echo "       Para tentar de novo: cd /var/www/fabrica/server && node bin/completar-ambiente.js" ;;
  *) echo "AVISO: completar-ambiente terminou com erro (saida $COMPLETAR) — a entrega esta no ar; rode de novo:"
     echo "       cd /var/www/fabrica/server && node bin/completar-ambiente.js" ;;
esac

echo "== conferencia =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos vindos do Comercial: '||count(*)||' — com o ambiente VAZIO: '||count(*) FILTER (WHERE btrim(COALESCE(ambiente,'')) = '')||' — ambientes distintos: '||count(DISTINCT lower(btrim(ambiente))) FILTER (WHERE btrim(COALESCE(ambiente,'')) <> '') FROM pcp_itens WHERE conclusao IS NULL AND comercial_item_id IS NOT NULL;" 2>/dev/null || true
( cd server && node bin/conferir-lista-materiais.js ) || true

echo
echo "DEPOIS DO DEPLOY:"
echo " 1. Fila > Ver de um item / Ficha de Producao / etiqueta: o AMBIENTE da peca aparece (antes vinha vazio nos"
echo "    pedidos montados com ambientes). Aba Pedidos Comercial > Ver: a coluna Ambiente tambem."
echo " 2. Plano de Corte (pelo Nucleo): as pecas saem agrupadas pelo ambiente de verdade, nao mais '(sem ambiente)'."
echo " 3. Ficha e Necessidade de materiais: o TECIDO passa a ser aninhado por ambiente de cada pedido (a regra da"
echo "    venda). Pode pedir um pouco MAIS de tecido que antes nos pedidos com varios ambientes — confira antes de"
echo "    requisitar ao Compras. Para trocar a regra sem deploy (pedido | junto):"
echo "      sudo -u postgres psql fabrica_db -Atc \"UPDATE pcp_config SET valor = 'pedido' WHERE chave = 'materiais_aninhar'\""
echo " 4. Etiquetas JA impressas continuam sem o ambiente — reimprima se precisar."
echo " 5. Pedidos liberados DAQUI EM DIANTE ja chegam com o ambiente; para os antigos o script acima preencheu o que deu."

registrar_deploy "ambiente na liberacao" "AMBIENTE DA PECA NA LIBERACAO DO PCP (pedido do cliente 26/11): a liberacao lia a coluna de texto item.ambiente do Comercial, que vem NULA nos orcamentos montados com ambientes (o nome mora em ambientes[] pelo ambienteId) — os itens entravam na fila com o ambiente vazio (Ficha, etiqueta, tela Ver e Plano de Corte sem ambiente). Agora a liberacao e a previa resolvem o nome pelo vinculo (nucleo-spec.js ambienteDoItemComercial; a coluna antiga vale para pedido antigo); bin/completar-ambiente.js preenche as pecas ja na fila so onde esta vazio (idempotente). TECIDO da lista de materiais aninhado POR AMBIENTE de cada pedido (decisao do cliente 26/11 — a regra da venda): grupo PEDIDO · AMBIENTE no campo ambiente do /lista-materiais; pcp_config.materiais_aninhar = ambiente|pedido|junto semeada no boot. Muda os numeros de TECIDO (um pouco mais nos pedidos com varios ambientes; sem aproveitamento entre pedidos); componentes/perfis/tubos iguais; nenhum preco muda. Unitario 90; e2e com Fabrica, Comercial e Nucleo reais 22 + regressao 48." "fabrica-server"
