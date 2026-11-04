#!/usr/bin/env bash
# ============================================================================
# Importa o pedido 20893 (Schulze Advogados Associados) no PCP — 56 peças de
# Persiana Horizontal 25mm Alumínio (ALUM LISA 21, cor 034). Medidas Largura x
# Altura em METROS, gravadas em largura/altura (alimentam a Ordem de Corte).
# Validado: 56/56 peças conferem área L×A vs. m² impresso no pedido.
#
# USO (no servidor):  bash importar-pedido-20893.sh
# Lê pedido-20893.json ao lado deste script. Pede login do PCP e confirma antes
# de gravar. Idempotente: aborta se o pedido 20893 já existir. Roda contra
# 127.0.0.1:3020.
# ============================================================================
set -euo pipefail
B=http://127.0.0.1:3020
PEDIDO="20893"
DATA_CLIENTE=""   # sem data de instalação no pedido; preencha YYYY-MM-DD se quiser
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JSON="$DIR/pedido-20893.json"
[ -f "$JSON" ] || { echo "Arquivo nao encontrado: $JSON"; exit 1; }

read -rp  "Usuário do PCP: " U
read -rsp "Senha: " S; echo
JAR=$(mktemp)
LOGIN=$(curl -s -c "$JAR" -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"$U\",\"password\":\"$S\"}" $B/api/auth/login)
CSRF=$(echo "$LOGIN" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).csrf_token||"")}catch{}})')
[ -n "$CSRF" ] || { echo "Login falhou: $LOGIN"; rm -f "$JAR"; exit 1; }
echo "Login OK."

# resolve id + nome do produto "PH 25mm (Horizontal)" (chave ph-25mm) na Estrutura
read -r PID PNOME < <(curl -s -b "$JAR" $B/api/pcp/estrutura | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).data.find(x=>x.chave==="ph-25mm");if(!p){process.exit(0)}console.log(p.id+" "+p.nome)})')
[ -n "${PID:-}" ] || { echo "Produto PH 25mm (chave ph-25mm) não encontrado na Estrutura."; rm -f "$JAR"; exit 1; }
echo "Produto: #$PID $PNOME"

# já existe? evita duplicar
EXISTE=$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "$B/api/pcp/pedido?pedido=$PEDIDO")
if [ "$EXISTE" = "200" ]; then
  echo "ATENÇÃO: o pedido $PEDIDO JÁ EXISTE no PCP. Abortando para não duplicar."
  echo "(Para reimportar, exclua o pedido antes na aba Editar Pedido.)"
  rm -f "$JAR"; exit 1
fi

read -rp "Importar 56 peças no pedido $PEDIDO? [s/N] " OK
[ "$OK" = "s" ] || [ "$OK" = "S" ] || { echo "Cancelado."; rm -f "$JAR"; exit 0; }

HOJE=$(date +%F)
PAYLOAD=$(node -e '
  const fs=require("fs");
  const [json,pid,pnome,ped,dc,hj]=process.argv.slice(1);
  const itens=JSON.parse(fs.readFileSync(json,"utf8"));
  const out=itens.map(i=>({
    produto:pnome, produto_id:Number(pid), pedido:ped, qnt:i.qnt||1,
    largura:i.largura, altura:i.altura, chegada_pcp:hj,
    data_cliente:dc||null, tipo:"Produção nova", motivo_atraso:"",
    observacoes:i.observacoes||""
  }));
  console.log(JSON.stringify({itens:out}));
' "$JSON" "$PID" "$PNOME" "$PEDIDO" "$DATA_CLIENTE" "$HOJE")

R=$(echo "$PAYLOAD" | curl -s -b "$JAR" -X POST -H "X-CSRF-Token: $CSRF" \
  -H 'Content-Type: application/json' --data-binary @- $B/api/pcp/itens/lote)
echo "Resposta: $R"
echo "$R" | grep -q '"count":56' && echo "✔ Pedido $PEDIDO importado com 56 peças. Veja em Fila / Editar Pedido / Ordem de Corte." \
  || echo "✗ Algo deu errado — veja a resposta acima."
rm -f "$JAR"
