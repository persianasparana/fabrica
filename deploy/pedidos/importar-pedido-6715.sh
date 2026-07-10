#!/usr/bin/env bash
# ============================================================================
# Importa o pedido 6715 (ABI Adm. de Locação de Bens) no PCP — 54 peças de
# Persiana Horizontal 25mm Cor 34. Gerado a partir do PDF do orçamento e
# validado pela soma dos preços (R$ 24.521,00 = todas as linhas capturadas).
#
# USO (no servidor):  bash importar-pedido-6715.sh
# Pede seu login do PCP e confirma antes de gravar. Roda contra 127.0.0.1:3020.
# ============================================================================
set -euo pipefail
B=http://127.0.0.1:3020
PEDIDO="6715"
DATA_CLIENTE="2026-07-20"   # instalação combinada (20/07) — ajuste se quiser

read -rp  "Usuário do PCP: " U
read -rsp "Senha: " S; echo
JAR=$(mktemp)
LOGIN=$(curl -s -c "$JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"$S\"}" $B/api/auth/login)
CSRF=$(echo "$LOGIN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).csrf_token||"")}catch{}})')
[ -n "$CSRF" ] || { echo "Login falhou: $LOGIN"; rm -f "$JAR"; exit 1; }
echo "Login OK."

# resolve o produto "PH 25mm (Horizontal)" na Estrutura do Produto
PID=$(curl -s -b "$JAR" $B/api/pcp/estrutura | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).data.find(x=>x.chave==="ph-25mm");console.log(p?p.id:"")})')
[ -n "$PID" ] || { echo "Produto PH 25mm não encontrado na Estrutura."; rm -f "$JAR"; exit 1; }

# já existe? evita duplicar
EXISTE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$B/api/pcp/pedido?pedido=$PEDIDO")
if [ "$EXISTE" = "200" ]; then
  echo "ATENÇÃO: o pedido $PEDIDO JÁ EXISTE no PCP. Abortando para não duplicar."
  echo "(Confira na aba Editar Pedido. Para reimportar, exclua o pedido antes.)"
  rm -f "$JAR"; exit 1
fi

read -rp "Importar 54 peças no pedido $PEDIDO (data cliente $DATA_CLIENTE)? [s/N] " OK
[ "$OK" = "s" ] || [ "$OK" = "S" ] || { echo "Cancelado."; rm -f "$JAR"; exit 0; }

HOJE=$(date +%F)
ITENS='[{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,985 x 2,37 m | peça 1/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,985 x 2,37 m | peça 2/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,99 x 2,37 m | peça 3/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,255 x 2,30 m | peça 4/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,54 x 2,67 m | peça 5/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,985 x 2,67 m | peça 6/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,985 x 2,67 m | peça 7/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião térreo | 0,985 x 2,67 m | peça 8/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Recepção | 0,985 x 2,7 m | peça 9/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Recepção | 0,985 x 2,37 m | peça 10/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Recepção | 0,985 x 2,37 m | peça 11/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Recepção | 0,985 x 2,37 m | peça 12/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Corredor | 1,445 x 2,57 m | peça 13/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Corredor | 0,835 x 2,13 m | peça 14/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Corredor | 0,84 x 2,13 m | peça 15/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Corredor | 0,84 x 2,13 m | peça 16/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Corredor | 0,41 x 2,13 m | peça 17/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Corredor | 0,36 x 2,13 m | peça 18/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião 2°andar | 0,985 x 2,52 m | peça 19/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Reunião 2°andar | 0,88 x 2,52 m | peça 20/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,985 x 2,52 m | peça 21/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,99 x 2,52 m | peça 22/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,985 x 2,52 m | peça 23/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,99 x 2,52 m | peça 24/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,835 x 1,72 m | peça 25/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,835 x 1,72 m | peça 26/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,835 x 1,72 m | peça 27/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,91 x 1,715 m | peça 28/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,905 x 1,715 m | peça 29/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,91 x 1,715 m | peça 30/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,905 x 1,715 m | peça 31/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 2°andar | 0,91 x 1,715 m | peça 32/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Gerência 3°andar | 0,98 x 2,82 m | peça 33/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Gerência 3°andar | 0,985 x 2,82 m | peça 34/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Gerência 3°andar | 0,66 x 2,82 m | peça 35/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,25 x 2,82 m | peça 36/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,985 x 2,82 m | peça 37/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,985 x 2,82 m | peça 38/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,985 x 2,82 m | peça 39/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 1,07 x 2,82 m | peça 40/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 1,07 x 2,82 m | peça 41/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 1,07 x 2,82 m | peça 42/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,96 x 2,82 m | peça 43/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,695 x 1,71 m | peça 44/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,695 x 1,71 m | peça 45/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,695 x 1,71 m | peça 46/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,695 x 1,71 m | peça 47/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,695 x 1,71 m | peça 48/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,695 x 1,71 m | peça 49/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,77 x 1,71 m | peça 50/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,77 x 1,71 m | peça 51/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,77 x 1,71 m | peça 52/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,77 x 1,71 m | peça 53/54"},{"produto":"PH 25mm (Horizontal)","qnt":1,"observacoes":"Cor 34 | Escritório 3° andar | 0,77 x 1,71 m | peça 54/54"}]'
PAYLOAD=$(echo "$ITENS" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const it=JSON.parse(s);const [pid,ped,dc,hj]=process.argv.slice(1);console.log(JSON.stringify({itens:it.map(i=>({...i,produto:i.produto.toUpperCase(),produto_id:Number(pid),pedido:ped,chegada_pcp:hj,data_cliente:dc,tipo:"Produção nova",motivo_atraso:""}))}))}) ' "$PID" "$PEDIDO" "$DATA_CLIENTE" "$HOJE")

R=$(echo "$PAYLOAD" | curl -s -b "$JAR" -X POST -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary @- $B/api/pcp/itens/lote)
echo "Resposta: $R"
echo "$R" | grep -q '"count":54' && echo "✔ Pedido $PEDIDO importado com 54 peças. Veja em Editar Pedido / Fila." \
  || echo "✗ Algo deu errado — veja a resposta acima."
rm -f "$JAR"
