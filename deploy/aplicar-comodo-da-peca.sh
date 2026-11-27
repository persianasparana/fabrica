#!/usr/bin/env bash
# Deploy — O CÔMODO É O AMBIENTE ESCRITO NA PEÇA + PLANO DE CORTE ROLO A ROLO NA FICHA (27/11/2026).
#
# Pedido do cliente (27/11), com o PDF da proposta 2026/1348 (350 peças lançadas em 8 "PARTES", com o
#   cômodo escrito no campo Ambiente de cada peça): "Nesse pedido foi feito essa separação em partes
#   como ambiente mas foi descrito o ambiente na peça. Preciso calcular os materiais que serão usados
#   com as regras recentes de aproveitamento de tecido dado que o ambiente teve que ser descrito
#   diferente. Como podemos resolver isso? E deixar o aproveitamento de tecido mais preciso possível?"
# Apurado: desde 26/11 a liberação grava como ambiente da peça o nome do ambiente DO PEDIDO (o bloco) —
#   aqui, "PARTE 1…8". O cômodo escrito na peça se perdia: a Ficha e a etiqueta mostravam a parte, e o
#   plano de corte do tecido (uma largura de rolo por ambiente) prendia a parte inteira numa largura só
#   (réplica, o pedido inteiro: 1.360,58 m de tecido; com os 62 cômodos das peças, 958,38 m).
# Decisões dele (27/11): (1) se a peça tem o Ambiente preenchido, ele é o cômodo (sem o nº da janela do
#   fim — quem tira é o Núcleo); a parte segue como agrupamento; (2) a Ficha mostra de qual largura sai
#   cada cômodo e avisa os nomes parecidos em larguras diferentes; (3) o plano sai rolo a rolo.
# Quem calcula é o Núcleo de Produtos (v14.100). Este deploy é a parte do PCP:
#   · a LIBERAÇÃO grava em `pcp_itens.ambiente` o texto escrito na peça (senão o nome do bloco, como
#     antes), em `grupo_pedido` o bloco do pedido e em `ambiente_origem` de onde veio ('peca' | 'bloco');
#   · a LISTA DE MATERIAIS manda ao Núcleo o grupo em `ambiente` e o cômodo escrito em `ambiente_peca`;
#   · a FICHA mostra o Ambiente (cômodo) e o "Grupo no pedido" em cada item e, no plano de corte: a lista
#     "largura do rolo → cômodos", o aviso de nomes parecidos em larguras diferentes e o plano ROLO A ROLO
#     (rolo 1 de N, faixas na ordem de corte, a sobra de cada rolo);
#   · modal "Ver" da fila: quem escreve o Ambiente está dizendo o cômodo da peça (é ele que o plano usa);
#   · etiqueta: campo opcional "Grupo no pedido" para os modelos; plano de corte via Núcleo agrupa pela parte;
#   · `bin/completar-ambiente.js` RELÊ no Comercial as peças já na fila: onde o ambiente está vazio ou é o
#     nome do bloco (o que a própria liberação gravou), passa a valer o cômodo da peça; o que alguém
#     digitou no PCP fica (só ganha o grupo e a marca de origem). Idempotente.
# O que entra: server/src/nucleo-spec.js (ambienteDaPecaComercial, ambienteParaONucleo, ambienteParaReler),
#   routes/comercial.js, routes/pcp.js, lista-materiais.js, completar-ambiente.js + bin, etiquetas.js,
#   ordem-corte-nucleo.js, db.js (duas colunas, criadas no boot), bin/conferir-lista-materiais.js
#   (--sonda-comodo), Ficha, modal Ver, aba Comercial; testes sem banco (29).
# Migration: no BOOT do servidor (ALTER TABLE … ADD COLUMN IF NOT EXISTS grupo_pedido / ambiente_origem).
# Não muda preço (o PCP não calcula preço).
#
# ⚠ ORDEM (provedor antes do consumidor — docs/PROTOCOLO-FEDERACAO.md, regra 2):
#   1º NÚCLEO v14.100  cd /var/www/produtos && git pull --ff-only origin main && bash deploy/aplicar-v14-100-comodo-e-rolos.sh
#   2º este script.
#   O script SONDA o Núcleo e ABORTA dizendo o que aplicar antes. Nada quebra na ordem inversa: com o
#   Núcleo anterior a lista segue pelo GRUPO do pedido (o que é hoje) e a Ficha sai sem a lista de cômodos
#   e sem os rolos — só o Ambiente dos itens já passa a ser o cômodo. Para subir assim mesmo:
#     PULAR_SONDAS=1 bash deploy/aplicar-comodo-da-peca.sh
#   O Comercial (v2.142.0 — o Relatório de custo manda o texto da peça) é independente deste.
#
# Uso: cd /var/www/fabrica && git pull --ff-only origin claude/unified-server-status-7633oz \
#      && bash deploy/aplicar-comodo-da-peca.sh
set -euo pipefail
cd /var/www/fabrica

[ -f deploy/lib-estado.sh ] || { echo "ERRO: deploy/lib-estado.sh ausente — rode git pull antes"; exit 1; }
source deploy/lib-estado.sh
estado_antes "$(basename "$0")" "comodo da peca"

# ── guardas: o commit desta entrega está no checkout?
grep -q "export function ambienteDaPecaComercial" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem ambienteDaPecaComercial — rode git pull antes"; exit 1; }
grep -q "export function ambienteParaONucleo" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem ambienteParaONucleo — rode git pull antes"; exit 1; }
grep -q "export function ambienteParaReler" server/src/nucleo-spec.js \
  || { echo "ERRO: nucleo-spec.js sem ambienteParaReler — rode git pull antes"; exit 1; }
grep -q "const amb = ambienteDaPecaComercial(it, detalhe.ambientes);" server/src/routes/comercial.js \
  || { echo "ERRO: a liberacao (routes/comercial.js) nao grava o comodo da peca / o grupo do pedido"; exit 1; }
grep -q "ADD COLUMN IF NOT EXISTS grupo_pedido" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna grupo_pedido"; exit 1; }
grep -q "ADD COLUMN IF NOT EXISTS ambiente_origem" server/src/db.js \
  || { echo "ERRO: db.js sem a coluna ambiente_origem"; exit 1; }
grep -q "i.ambiente, i.grupo_pedido, i.ambiente_origem, i.atributos, i.comercial_item_id, i.produto_sku," server/src/routes/pcp.js \
  || { echo "ERRO: a fila (routes/pcp.js) nao le o grupo do pedido / a origem do ambiente"; exit 1; }
grep -q "ambiente_origem = CASE" server/src/routes/pcp.js \
  || { echo "ERRO: a edicao do item (routes/pcp.js) nao marca a origem do ambiente"; exit 1; }
grep -q "const amb = ambienteParaONucleo(item);" server/src/lista-materiais.js \
  || { echo "ERRO: lista-materiais.js nao manda o comodo da peca ao Nucleo"; exit 1; }
grep -q "ambienteParaReler(it, porId.get(String(it.comercial_item_id)), ambientes)" server/src/completar-ambiente.js \
  || { echo "ERRO: completar-ambiente.js nao rele o comodo da peca"; exit 1; }
grep -q "sonda-comodo" server/bin/conferir-lista-materiais.js \
  || { echo "ERRO: conferir-lista-materiais.js sem a sonda do comodo da peca"; exit 1; }
grep -q "chave: 'grupo_pedido'" server/src/etiquetas.js \
  || { echo "ERRO: etiquetas.js sem o campo Grupo no pedido"; exit 1; }
grep -q "item.grupo_pedido || item.ambiente" server/src/ordem-corte-nucleo.js \
  || { echo "ERRO: o plano de corte via Nucleo nao agrupa pelo grupo do pedido"; exit 1; }
grep -q "const blocoComodos" pcp/public/assets/js/ficha-producao.js \
  || { echo "ERRO: Ficha de Producao sem a lista largura do rolo -> comodos"; exit 1; }
grep -q "const blocoParecidos" pcp/public/assets/js/ficha-producao.js \
  || { echo "ERRO: Ficha de Producao sem o aviso de nomes parecidos"; exit 1; }
grep -q "Grupo no pedido" pcp/public/assets/js/ficha-producao.js \
  || { echo "ERRO: Ficha de Producao sem o grupo do pedido no item"; exit 1; }
grep -q "Ambiente (o cômodo da peça)" pcp/public/assets/js/app.js \
  || { echo "ERRO: modal Ver da fila sem a explicacao do Ambiente"; exit 1; }
grep -q "ambienteParaReler" server/test/ambiente.test.mjs \
  || { echo "ERRO: test/ambiente.test.mjs sem os casos do comodo da peca — rode git pull antes"; exit 1; }
echo "== commit da entrega confirmado =="

node --check server/src/nucleo-spec.js
node --check server/src/lista-materiais.js
node --check server/src/completar-ambiente.js
node --check server/src/routes/comercial.js
node --check server/src/routes/pcp.js
node --check server/src/etiquetas.js
node --check server/src/ordem-corte-nucleo.js
node --check server/src/db.js
node --check server/bin/completar-ambiente.js
node --check server/bin/conferir-lista-materiais.js
node --check pcp/public/assets/js/ficha-producao.js
node --check pcp/public/assets/js/app.js
node --check pcp/public/assets/js/comercial.js
node --check pcp/public/assets/js/etiquetas.js
node --check pcp/public/assets/js/plano-corte-nucleo.js
( cd server && node --test test/carga.test.mjs test/nucleo-spec.test.mjs test/lista-materiais.test.mjs test/ambiente.test.mjs > /tmp/fabrica-testes-comodo.log 2>&1 ) \
  || { echo "ERRO: os testes sem banco falharam:"; tail -40 /tmp/fabrica-testes-comodo.log; exit 1; }
echo "== testes sem banco OK ($(grep -E '^# pass' /tmp/fabrica-testes-comodo.log | grep -o '[0-9]*' | head -1) testes) =="

# ── sonda do PROVEDOR (com a configuracao do proprio fabrica-server; nada e gravado)
echo "== sonda: Nucleo v14.100 (o comodo pela peca + plano rolo a rolo) =="
set +e
( cd server && node bin/conferir-lista-materiais.js --sonda-comodo )
SONDA=$?
set -e
case "$SONDA" in
  0) echo "== provedor pronto ==" ;;
  5) echo "AVISO: nao deu para sondar o Nucleo (motivo acima) — o deploy segue; confira depois com:"
     echo "       cd /var/www/fabrica/server && node bin/conferir-lista-materiais.js --sonda-comodo" ;;
  3)
     if [ "${PULAR_SONDAS:-0}" = "1" ]; then
       echo "AVISO: PULAR_SONDAS=1 — subindo com o Nucleo ANTERIOR (acima). O Ambiente dos itens ja passa a ser o comodo da"
       echo "       peca, mas a lista de materiais segue pelo GRUPO do pedido (como hoje) e a Ficha sai sem a lista de comodos"
       echo "       e sem os rolos ate o Nucleo v14.100 entrar."
     else
       echo "ERRO: Nucleo anterior a v14.100 (acima) — aplique-o ANTES e rode este script de novo."
       echo "      (para subir assim mesmo: PULAR_SONDAS=1 bash deploy/aplicar-comodo-da-peca.sh)"
       exit 1
     fi ;;
  *) echo "ERRO: a sonda falhou (saida $SONDA) — veja a mensagem acima"; exit 1 ;;
esac

echo "== fila ANTES =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos vindos do Comercial: '||count(*)||' — SEM ambiente: '||count(*) FILTER (WHERE btrim(COALESCE(ambiente,'')) = '')||' — ambientes distintos: '||count(DISTINCT pedido||'/'||ambiente) FILTER (WHERE btrim(COALESCE(ambiente,'')) <> '') FROM pcp_itens WHERE comercial_item_id IS NOT NULL AND conclusao IS NULL;" || true

pm2 restart fabrica-server
sleep 4
curl -sf http://127.0.0.1:3020/healthz >/dev/null
echo "== health OK =="

COLUNAS="$(sudo -u postgres psql fabrica_db -Atc "SELECT count(*) FROM information_schema.columns WHERE table_name='pcp_itens' AND column_name IN ('grupo_pedido','ambiente_origem');" 2>/dev/null || true)"
[ "$COLUNAS" = "2" ] || { echo "ERRO: as colunas grupo_pedido / ambiente_origem nao foram criadas no boot (achei ${COLUNAS:-?} de 2) — veja: pm2 logs fabrica-server --lines 40"; exit 1; }
echo "== colunas novas de pcp_itens criadas no boot (grupo_pedido, ambiente_origem) =="

# ── rele no Comercial o AMBIENTE das pecas JA NA FILA (so troca o que esta vazio ou e o nome do bloco; idempotente)
echo "== reler o ambiente das pecas ja na fila (o comodo escrito na peca; o que foi digitado no PCP fica) =="
set +e
( cd server && node bin/completar-ambiente.js --detalhe )
COMPLETAR=$?
set -e
case "$COMPLETAR" in
  0) ;;
  2) echo "AVISO: ficaram itens sem reler por causa do Comercial (motivo acima). Nada quebra — esses itens seguem como"
     echo "       estavam (o plano deles sai pelo grupo do pedido). Para tentar de novo:"
     echo "       cd /var/www/fabrica/server && node bin/completar-ambiente.js --detalhe" ;;
  *) echo "AVISO: completar-ambiente terminou com erro (saida $COMPLETAR) — a entrega esta no ar; rode de novo:"
     echo "       cd /var/www/fabrica/server && node bin/completar-ambiente.js --detalhe" ;;
esac

echo "== conferencia =="
sudo -u postgres psql fabrica_db -Atc "SELECT 'itens abertos vindos do Comercial: '||count(*)||' — com o comodo escrito na peca: '||count(*) FILTER (WHERE ambiente_origem = 'peca')||' — pelo grupo do pedido: '||count(*) FILTER (WHERE ambiente_origem = 'bloco')||' — ainda nao relidos: '||count(*) FILTER (WHERE ambiente_origem IS NULL) FROM pcp_itens WHERE comercial_item_id IS NOT NULL AND conclusao IS NULL;" || true
sudo -u postgres psql fabrica_db -Atc "SELECT '  '||pedido||': '||count(*)||' item(ns) em '||count(DISTINCT grupo_pedido)||' grupo(s) do pedido e '||count(DISTINCT ambiente)||' ambiente(s) escritos nas pecas' FROM pcp_itens WHERE comercial_item_id IS NOT NULL AND conclusao IS NULL AND ambiente_origem = 'peca' GROUP BY pedido ORDER BY count(*) DESC LIMIT 8;" || true
( cd server && node bin/conferir-lista-materiais.js ) || true

echo
echo "DEPOIS DO DEPLOY:"
echo " 1. Pedido em que o vendedor usou os ambientes como agrupamento (PARTE 1, PARTE 2…) e escreveu o comodo no campo"
echo "    Ambiente de cada peca: a Ficha e a etiqueta passam a mostrar o COMODO; a parte aparece como 'Grupo no pedido'."
echo "    Peca sem o campo preenchido segue com o ambiente do pedido, como antes."
echo " 2. Ficha de Producao > materiais do pedido: a tabela 'Largura do rolo -> comodos' diz de qual largura sai cada"
echo "    comodo; o plano de corte sai ROLO A ROLO (rolo 1 de N, as faixas na ordem de corte e a sobra de cada rolo)."
echo "    A fabrica precisa cortar seguindo o plano."
echo " 3. Se a Ficha avisar 'comodos de nomes parecidos em larguras diferentes' (uma letra de diferenca; o mesmo nome"
echo "    mudando so o numero): se for o mesmo comodo, corrija o Ambiente da peca no modal 'Ver' da fila para ficar"
echo "    igual e abra a Ficha de novo — o plano refaz sozinho. Se forem comodos diferentes, esta certo assim."
echo " 4. O tamanho do rolo: onde a largura nao tem os 'm por rolo' cadastrados no Nucleo (Cadastros > Tecidos"
echo "    (colecoes)) a Ficha diz 'tamanho padrao' — preencha la para a conta de rolos ficar exata."
echo " 5. Etiqueta ja impressa nao muda (reimprima se precisar do comodo). O campo 'Grupo no pedido' pode ser"
echo "    acrescentado aos modelos de etiqueta (Etiquetas > Modelos)."
echo " 6. As duas regras ligam/desligam no painel do NUCLEO (Regras gerais > Parametros > 'Plano de corte — o comodo e"
echo "    o Ambiente escrito na peca' e 'Plano de corte — rolo a rolo')."

registrar_deploy "comodo da peca" "O COMODO E O AMBIENTE ESCRITO NA PECA + PLANO DE CORTE ROLO A ROLO NA FICHA (27/11; par do Nucleo v14.100 — pedido do cliente com a proposta 2026/1348, 350 pecas lancadas em 8 partes com o comodo escrito na peca): a liberacao grava em ambiente o texto escrito na peca (senao o nome do bloco), o bloco em grupo_pedido e a origem em ambiente_origem (colunas criadas no boot); a lista de materiais manda ao Nucleo o grupo em ambiente e o comodo em ambiente_peca; a Ficha mostra o comodo e o grupo no item, a lista largura do rolo > comodos, o aviso de nomes parecidos em larguras diferentes e o plano rolo a rolo com a sobra de cada rolo; modal Ver marca a origem ao editar o ambiente; etiqueta ganha o campo opcional Grupo no pedido; completar-ambiente rele as pecas ja na fila (so troca o ambiente vazio ou igual ao nome do bloco). Nao muda preco. ORDEM: Nucleo v14.100 antes (o script sonda)"
