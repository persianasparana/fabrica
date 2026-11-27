#!/usr/bin/env bash
# Deploy — PRODUÇÃO POR ETAPAS: corte do tecido, corte dos perfis e montagem em documentos separados (27/11/2026).
#
# Pedido do cliente (27/11), com o pedido 2026/1348 (350 peças, instalado em 8 partes): "Preciso que na
#   produção eu consiga imprimir um planejamento de corte de tecido separado do planejamento de corte do
#   perfil e no final a montagem. pois veja esse pedido (...) será instalado por partes, mas quando for
#   cortar os tecidos, preciso concentrar a produção por largura de tecido para que na produção não precise
#   ficar puxando tecido diferente o tempo inteiro, também preciso de alguma forma avisar a expedição quando
#   as partes desse pedido grande estiverem concluídas para eles agendarem a instalação (...) tudo tem que
#   estar sincronizado e planejado corretamente, além do mais vou precisar ver a solicitação de compra".
#   E depois: "o layout do PCP para a produção deve ser claro, objetivo, visual, e seguindo padrões
#   internacionais."
# Apurado: havia UM documento de corte (Plano de corte por peça: tecido e perfis juntos, peça a peça) e a
#   Ficha de Produção; o total de tecido desse plano era uma soma peça a peça sem aproveitamento (réplica,
#   o pedido do relato: 1.613 m / 54 rolos, contra 958 m / 33 rolos do plano de corte do pedido); o plano
#   por peça mandava cortar o tecido SHEER com "altura + folga" (metade do que a peça leva — corrigido no
#   Núcleo v14.101); o plano de corte de pedido com mais de 500 peças não saía; o andamento era só por
#   pedido; a requisição ao Compras pedia o tecido em metros soltos.
# Decisões dele (27/11): tecido sheer = 2 × altura + folga do tubo; corte dos PERFIS do pedido inteiro, por
#   perfil; expedição por parte NA LOGÍSTICA (fase 2); o pedido só vira ENTREGUE na última parte (fase 2).
# O que entra (FASE 1 — Fábrica):
#   · producao.html — cinco documentos por pedido, um por impressão: Visão geral (andamento por parte e
#     documentos), Lista de compra (tecido em rolos, perfis em barras, componentes), 1 Corte do tecido
#     (pedido inteiro: largura de rolo → rolo → faixa → peças, com o rolo desenhado), 2 Corte dos perfis
#     (pedido inteiro: perfil → barra → cortes em escala), 3 Montagem (parte → cômodo → peça + componentes
#     da parte). Bloco de identificação com os campos da ISO 7200, emissão e "Folha x / y" em toda folha,
#     QR do documento, via/reimpressão registrada (ISO 9001, 7.5), caixa de "feito" e visto;
#   · pedido POR PARTES × pedido comum: automático (dois grupos ou mais e o cômodo escrito na maioria das
#     peças) ou o que o PCP definir na Visão geral (pcp_pedido_info.por_partes);
#   · troca de tela (somente tecido) fica fora do corte dos perfis;
#   · /plano-corte do Núcleo em blocos de 500 peças; o Plano de corte por peça mostra o tecido pelo plano
#     do pedido (a soma peça a peça vira "ESTIMATIVA" só quando a lista de materiais não vem);
#   · /api/integracao/{pedidos,peca,expedicao}: chaves ADITIVAS por_partes, partes[] e, na peça, parte e
#     comodo — a base da expedição por parte da Logística (fase 2; quem não lê segue como antes);
#   · Necessidade de materiais / Requisitar ao Compras: o tecido em ROLOS INTEIROS (rolos × metros do
#     rolo; com saldo do Compras, a falta arredondada para cima em rolos).
# Migration: no BOOT do servidor (ALTER TABLE … ADD COLUMN IF NOT EXISTS: pcp_ordem_corte_log.detalhe e
#   pcp_pedido_info.por_partes — as duas aceitam nulo). Não muda preço (o PCP não calcula preço).
#
# ⚠ ORDEM (provedor antes do consumidor — docs/PROTOCOLO-FEDERACAO.md, regra 2):
#   1º NÚCLEO v14.101  cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-101-corte-sheer.sh
#   2º este script.
#   O script SONDA o Núcleo e ABORTA dizendo o que aplicar antes. Nada quebra na ordem inversa: com o Núcleo
#   anterior o documento "Corte do tecido" usa a altura do plano de CONSUMO (a certa, 2 × altura + folga) e
#   AVISA; só o Plano de corte por peça segue com a altura antiga no sheer. Para subir assim mesmo:
#     PULAR_SONDAS=1 bash deploy/aplicar-producao-por-etapas.sh
#   Logística: SEM deploy agora (as chaves novas da integração são aditivas); a fase 2 é dela.
#
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-producao-por-etapas.sh
set -euo pipefail
cd /var/www/fabrica

[ -f deploy/lib-estado.sh ] || { echo "ERRO: deploy/lib-estado.sh ausente — rode git pull antes"; exit 1; }
source deploy/lib-estado.sh
estado_antes "$(basename "$0")" "producao por etapas"

# ── guardas: o commit desta entrega está no checkout?
[ -f server/src/producao.js ] || { echo "ERRO: server/src/producao.js ausente — rode git pull antes"; exit 1; }
[ -f server/src/producao-pedido.js ] || { echo "ERRO: server/src/producao-pedido.js ausente — rode git pull antes"; exit 1; }
[ -f pcp/public/producao.html ] || { echo "ERRO: pcp/public/producao.html ausente — rode git pull antes"; exit 1; }
[ -f pcp/public/assets/js/producao.js ] || { echo "ERRO: pcp/public/assets/js/producao.js ausente — rode git pull antes"; exit 1; }
[ -f server/test/producao.test.mjs ] || { echo "ERRO: server/test/producao.test.mjs ausente — rode git pull antes"; exit 1; }
grep -q "export function montarProducao" server/src/producao.js \
  || { echo "ERRO: producao.js sem montarProducao — rode git pull antes"; exit 1; }
grep -q "export function pedidoPorPartes" server/src/producao.js \
  || { echo "ERRO: producao.js sem a regra do pedido por partes"; exit 1; }
grep -q "export function compraEmRolos" server/src/producao.js \
  || { echo "ERRO: producao.js sem a compra do tecido em rolos inteiros"; exit 1; }
grep -q "const soTecido = !!(lp && lp.so_tecido);" server/src/producao.js \
  || { echo "ERRO: producao.js nao tira a troca de tela do corte dos perfis"; exit 1; }
grep -q "export async function producaoDoPedido" server/src/producao-pedido.js \
  || { echo "ERRO: producao-pedido.js sem producaoDoPedido"; exit 1; }
grep -q "export async function registrarImpressaoDoDocumento" server/src/producao-pedido.js \
  || { echo "ERRO: producao-pedido.js sem o registro de impressao por documento"; exit 1; }
grep -q "export async function partesDosPedidos" server/src/producao-pedido.js \
  || { echo "ERRO: producao-pedido.js sem as partes para a integracao"; exit 1; }
grep -q "'/pedido/producao'," server/src/routes/pcp.js \
  || { echo "ERRO: routes/pcp.js sem a rota GET /pedido/producao"; exit 1; }
grep -q "'/pedido/producao/impressao'," server/src/routes/pcp.js \
  || { echo "ERRO: routes/pcp.js sem a rota POST /pedido/producao/impressao"; exit 1; }
grep -q "'/pedido/producao/por-partes'," server/src/routes/pcp.js \
  || { echo "ERRO: routes/pcp.js sem a rota PUT /pedido/producao/por-partes"; exit 1; }
grep -q "ALTER TABLE pcp_ordem_corte_log ADD COLUMN IF NOT EXISTS detalhe" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna detalhe do log de impressao"; exit 1; }
grep -q "ALTER TABLE pcp_pedido_info ADD COLUMN IF NOT EXISTS por_partes" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna por_partes do pedido"; exit 1; }
grep -q "const PLANO_CORTE_BLOCO = 500;" server/src/produtos-client.js \
  || { echo "ERRO: produtos-client.js nao manda o /plano-corte em blocos de 500 pecas"; exit 1; }
grep -q "const partes = await partesDosPedidos(rows.map((x) => x.pedido));" server/src/routes/integracao.js \
  || { echo "ERRO: routes/integracao.js sem as partes do pedido (chaves aditivas da integracao)"; exit 1; }
grep -q "comprar: compraEmRolos(" server/src/necessidade.js \
  || { echo "ERRO: necessidade.js nao sugere o tecido em rolos inteiros"; exit 1; }
grep -q "sonda-corte-sheer" server/bin/conferir-lista-materiais.js \
  || { echo "ERRO: conferir-lista-materiais.js sem a sonda do Nucleo v14.101"; exit 1; }
grep -q 'id="css-folha"' pcp/public/producao.html \
  || { echo "ERRO: producao.html sem o rodape de folha (css-folha)"; exit 1; }
grep -q "function desenhoDoRolo(l, r)" pcp/public/assets/js/producao.js \
  || { echo "ERRO: producao.js (pagina) sem o desenho do rolo"; exit 1; }
grep -q "function linhaDaBarra(x, b)" pcp/public/assets/js/producao.js \
  || { echo "ERRO: producao.js (pagina) sem o desenho da barra"; exit 1; }
grep -q "pcp/pedido/producao/por-partes" pcp/public/assets/js/producao.js \
  || { echo "ERRO: producao.js (pagina) sem a chave do pedido por partes"; exit 1; }
grep -q "function abrirProducaoPorEtapas(pedido, doc)" pcp/public/assets/js/app.js \
  || { echo "ERRO: app.js sem o atalho para a producao por etapas"; exit 1; }
grep -q "abrirProducaoPorEtapas(" pcp/public/assets/js/comercial.js \
  || { echo "ERRO: aba Comercial sem o atalho para a producao por etapas"; exit 1; }
grep -q 'id="lnk-producao"' pcp/public/ficha-producao.html \
  || { echo "ERRO: Ficha de Producao sem o atalho para a producao por etapas"; exit 1; }
grep -q 'id="lnk-producao"' pcp/public/plano-corte-nucleo.html \
  || { echo "ERRO: Plano de corte por peca sem o atalho para a producao por etapas"; exit 1; }
grep -q "Tecido do pedido — ESTIMATIVA peça a peça" pcp/public/assets/js/plano-corte-nucleo.js \
  || { echo "ERRO: o Plano de corte por peca ainda soma o tecido peca a peca como se fosse a compra"; exit 1; }
grep -q "sugerido: c.metros, metros_rolo: c.metros_rolo" pcp/public/assets/js/necessidade.js \
  || { echo "ERRO: a requisicao ao Compras (necessidade.js) nao sugere o tecido em rolos"; exit 1; }
grep -q "test/producao.test.mjs" server/package.json \
  || { echo "ERRO: npm test nao roda o teste da producao por etapas"; exit 1; }
echo "== commit da entrega confirmado =="

node --check server/src/producao.js
node --check server/src/producao-pedido.js
node --check server/src/necessidade.js
node --check server/src/produtos-client.js
node --check server/src/routes/pcp.js
node --check server/src/routes/integracao.js
node --check server/src/db.js
node --check server/bin/conferir-lista-materiais.js
node --check pcp/public/assets/js/producao.js
node --check pcp/public/assets/js/app.js
node --check pcp/public/assets/js/comercial.js
node --check pcp/public/assets/js/necessidade.js
node --check pcp/public/assets/js/ficha-producao.js
node --check pcp/public/assets/js/plano-corte-nucleo.js
( cd server && node --test test/carga.test.mjs test/nucleo-spec.test.mjs test/lista-materiais.test.mjs test/ambiente.test.mjs test/producao.test.mjs > /tmp/fabrica-testes-producao.log 2>&1 ) \
  || { echo "ERRO: os testes sem banco falharam:"; tail -40 /tmp/fabrica-testes-producao.log; exit 1; }
echo "== testes sem banco OK ($(grep -E '^# pass' /tmp/fabrica-testes-producao.log | grep -o '[0-9]*' | head -1) testes) =="

# ── sonda do PROVEDOR (com a configuracao do proprio fabrica-server; nada e gravado)
echo "== sonda: Nucleo v14.101 (no plano de corte por peca, o tecido sheer sai com 2 x altura + folga do tubo) =="
set +e
( cd server && node bin/conferir-lista-materiais.js --sonda-corte-sheer )
SONDA=$?
set -e
case "$SONDA" in
  0) echo "== provedor pronto ==" ;;
  5) echo "AVISO: nao deu para sondar o Nucleo (motivo acima) — o deploy segue; confira depois com:"
     echo "       cd /var/www/fabrica/server && node bin/conferir-lista-materiais.js --sonda-corte-sheer" ;;
  3)
     if [ "${PULAR_SONDAS:-0}" = "1" ]; then
       echo "AVISO: PULAR_SONDAS=1 — subindo com o Nucleo ANTERIOR (acima). O documento 'Corte do tecido' usa a altura do"
       echo "       plano de CONSUMO (2 x altura + folga — a certa) e avisa; o Plano de corte por peca segue com a altura"
       echo "       antiga no tecido sheer ate o Nucleo v14.101 entrar."
     else
       echo "ERRO: Nucleo anterior a v14.101 (acima) — aplique-o ANTES e rode este script de novo."
       echo "      (para subir assim mesmo: PULAR_SONDAS=1 bash deploy/aplicar-producao-por-etapas.sh)"
       exit 1
     fi ;;
  *) echo "ERRO: a sonda falhou (saida $SONDA) — veja a mensagem acima"; exit 1 ;;
esac

# ── copia das duas tabelas que ganham coluna (aceitam nulo; a copia e so por precaucao)
COPIA="/tmp/fabrica-producao-por-etapas-$(date +%F-%H%M).sql.gz"
if sudo -u postgres pg_dump fabrica_db -t pcp_pedido_info -t pcp_ordem_corte_log 2>/dev/null | gzip > "$COPIA"; then
  echo "== copia de pcp_pedido_info e pcp_ordem_corte_log em $COPIA =="
else
  echo "AVISO: nao consegui copiar as duas tabelas antes (o deploy segue: as colunas novas aceitam nulo)"
fi

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

COLUNAS="$(sudo -u postgres psql fabrica_db -Atc "SELECT count(*) FROM information_schema.columns WHERE (table_name='pcp_ordem_corte_log' AND column_name='detalhe') OR (table_name='pcp_pedido_info' AND column_name='por_partes');" 2>/dev/null || true)"
[ "$COLUNAS" = "2" ] || { echo "ERRO: as colunas detalhe / por_partes nao foram criadas no boot (achei ${COLUNAS:-?} de 2) — veja: pm2 logs fabrica-server --lines 40"; exit 1; }
echo "== colunas novas criadas no boot (pcp_ordem_corte_log.detalhe, pcp_pedido_info.por_partes) =="

# ── o processo NO AR e o desta entrega? (a pagina responde; a rota nova existe e pede sessao)
PAGINA="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3020/pcp/producao.html || true)"
[ "$PAGINA" = "200" ] || { echo "ERRO: /pcp/producao.html respondeu HTTP ${PAGINA:-?} (esperado 200)"; exit 1; }
ROTA="$(curl -s -o /dev/null -w '%{http_code}' 'http://127.0.0.1:3020/api/pcp/pedido/producao?pedido=PED-SONDA' || true)"
[ "$ROTA" = "401" ] || { echo "ERRO: GET /api/pcp/pedido/producao respondeu HTTP ${ROTA:-?} sem sessao (esperado 401) — o processo no ar nao e o desta entrega: pm2 delete fabrica-server && pm2 start deploy/ecosystem.config.js --only fabrica-server && pm2 save"; exit 1; }
echo "== pagina e rota da producao por etapas no ar =="

# ── integracao com a Logistica: as chaves novas (so se a chave da integracao estiver configurada)
CHAVE_INTEG="$(grep -E '^INTEGRACAO_API_KEY=' /var/www/fabrica/server/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'\r' || true)"
if [ -n "$CHAVE_INTEG" ]; then
  if curl -s -H "X-API-Key: $CHAVE_INTEG" 'http://127.0.0.1:3020/api/integracao/pedidos' | grep -q '"por_partes"'; then
    echo "== integracao: /api/integracao/pedidos ja traz por_partes e partes[] (chaves aditivas) =="
  else
    echo "AVISO: /api/integracao/pedidos nao trouxe por_partes (sem pedido na fila, ou a rota nao respondeu) — confira depois"
  fi
else
  echo "== integracao: INTEGRACAO_API_KEY nao configurada em server/.env — nada a conferir (a Logistica nao consulta este servidor) =="
fi

echo "== conferencia =="
( cd server && node bin/conferir-lista-materiais.js --producao ) || true
sudo -u postgres psql fabrica_db -Atc "SELECT 'pedidos abertos na fila: '||count(DISTINCT pedido)||' — com dois grupos ou mais (candidatos a por partes): '||count(DISTINCT pedido) FILTER (WHERE g >= 2) FROM (SELECT pedido, count(DISTINCT grupo_pedido) AS g FROM pcp_itens WHERE conclusao IS NULL AND btrim(COALESCE(pedido,'')) <> '' GROUP BY pedido) x;" || true

echo
echo "DEPOIS DO DEPLOY:"
echo " 1. Onde abrir: Editar Pedido > 'Producao por etapas' (tambem na aba Pedidos Comercial, no Plano de Corte, na"
echo "    Necessidade de materiais e na Ficha). Cada aba e UM documento, impresso em separado para o seu setor:"
echo "    1 Corte do tecido > 2 Corte dos perfis > 3 Montagem; mais a Visao geral e a Lista de compra."
echo " 2. CORTE DO TECIDO: o pedido inteiro, uma largura de rolo por vez, rolo a rolo, faixa a faixa — com o desenho de cada"
echo "    rolo. A etiqueta da peca e a mesma nos tres documentos; o numero no quadro e a PARTE do pedido."
echo " 3. CORTE DOS PERFIS: o pedido inteiro, um perfil por vez; cada linha e uma barra com os cortes em escala e a sobra."
echo " 4. MONTAGEM: uma parte por vez (da para imprimir uma parte so), comodo a comodo, com os componentes da parte."
echo " 5. VISAO GERAL: o andamento de cada parte (setores, embaladas, na expedicao). 'PRONTA' = todas as pecas da parte"
echo "    com a baixa da embalagem — hora de avisar a expedicao. O aviso automatico para a Logistica e a FASE 2."
echo " 6. Pedido POR PARTES e automatico (dois grupos ou mais no pedido + o comodo escrito na maioria das pecas). Se o"
echo "    sistema errar, corrija na Visao geral ('POR PARTES?': Automatico / Por partes / Pedido inteiro)."
echo " 7. Imprimir REGISTRA a via: reimpressao sai escrita no papel e a aba avisa 'ja impresso'. O Plano de corte por peca"
echo "    antigo continua existindo; o tecido dele passa a mostrar o plano do pedido (o mesmo numero da compra)."
echo " 8. COMPRA: Necessidade de materiais > Requisitar ao Compras sugere o tecido em ROLOS INTEIROS. O tamanho do rolo"
echo "    vem do Nucleo (Cadastros > Tecidos (colecoes) > m por rolo); sem cadastro vale o padrao de 30 m — confira."
echo " 9. Barra de 6,00 m e o padrao quando o perfil nao tem o tamanho da barra cadastrado no Nucleo (Componentes)."

registrar_deploy "producao por etapas" "PRODUCAO POR ETAPAS (27/11; par do Nucleo v14.101 — pedido do cliente com o pedido 2026/1348, 350 pecas instaladas em 8 partes): producao.html com cinco documentos por pedido impressos em separado — Visao geral (andamento por parte), Lista de compra (rolos, barras, unidades), 1 Corte do tecido (pedido inteiro por largura de rolo > rolo > faixa, com o rolo desenhado), 2 Corte dos perfis (pedido inteiro por perfil > barra > cortes em escala), 3 Montagem (parte > comodo > peca + componentes) — com bloco de identificacao (ISO 7200), folha x/y, QR, via e reimpressao registradas, feito e visto; pedido por partes automatico ou definido pelo PCP (pcp_pedido_info.por_partes); troca de tela fora do corte dos perfis; /plano-corte em blocos de 500 pecas; Plano de corte por peca com o tecido pelo plano do pedido; integracao com chaves aditivas por_partes/partes/parte/comodo (base da fase 2 na Logistica); requisicao ao Compras com o tecido em rolos inteiros. Colunas criadas no boot (pcp_ordem_corte_log.detalhe, pcp_pedido_info.por_partes). Nao muda preco. ORDEM: Nucleo v14.101 antes (o script sonda)" "fabrica-server"
