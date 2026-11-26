#!/usr/bin/env bash
# lib-estado.sh — preâmbulo comum dos scripts de deploy.
# Trazido para a FÁBRICA em 25/11/2026 (cópia do `produtos/deploy/lib-estado.sh` — a mesma
# biblioteca de Agenda, Núcleo, Compras e Financeiro; aqui só mudam o processo PM2
# (`fabrica-server`) e a branch de produção). Até então os scripts da Fábrica só registravam o
# SUCESSO: se abortassem (guarda, sonda de vizinho, health) nada ficava no REGISTRO.
#
# (texto original, 21/08/2026)
#
# Pergunta do cliente: "esses comandos estão com a configuração de avisar o que
# já foi aplicado?" — e, dias antes: "não lembro se já apliquei esse deploy,
# pode confirmar?". Os scripts já tinham GUARDAS de pré-requisito (falham
# dizendo "rode git pull antes" / "aplique a vNN do Núcleo primeiro") e
# migrations idempotentes, mas nada dizia se AQUELE deploy já havia rodado.
#
# `estado_antes <basename-do-script> <versao>` imprime, antes de tocar em nada:
#   • o commit que está no checkout;
#   • o processo PM2 (uptime/restarts) — dá para ver se subiu agora;
#   • se ESTE script já consta no REGISTRO-DEPLOYS.md, com data e commit, e se
#     é o MESMO commit (nada novo entra) ou um commit mais novo;
#   • os últimos registros, para situar.
# Exporta REAPLICANDO=1 quando já havia registro — a linha nova do registro
# nasce marcada "REAPLICADO", em vez de fingir que foi a primeira vez.
#
# Uso no início do script de deploy (depois do `cd` para o diretório do app):
#   source deploy/lib-estado.sh
#   estado_antes "$(basename "$0")" "lista de materiais como a venda"
# E na linha do registro:
#   echo "- $(date …) | ${REAPLICANDO:+REAPLICADO | }[$(basename "$0")] | …"

REAPLICANDO=""

estado_antes() {
  local script="${1:-desconhecido}" versao="${2:-}" reg="deploy/REGISTRO-DEPLOYS.md"
  local commit_atual linha commit_reg data_reg
  commit_atual=$(git rev-parse --short HEAD 2>/dev/null || echo '?')

  echo "======================================================================"
  echo " ESTADO ANTES ${versao:+— $versao}"
  echo "======================================================================"
  echo " commit no checkout : $commit_atual  $(git log -1 --format='%s' 2>/dev/null | cut -c1-70)"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 list 2>/dev/null | grep -E 'fabrica-server|produtos-api|agenda-api' \
      | sed 's/^/ pm2                : /' | cut -c1-160 || true
  fi

  if [ -f "$reg" ]; then
    # 16/09 — linha de FALHA não conta como "já aplicado" (só avisa)
    linha=$(grep -F "[$script]" "$reg" | grep -v 'FALHOU\|INTERROMPIDO' | tail -1 || true)
    local falha_ant; falha_ant=$(grep -F "[$script]" "$reg" | grep 'FALHOU\|INTERROMPIDO' | tail -1 || true)
    if [ -n "$falha_ant" ]; then
      echo " ⚠ tentativa anterior deste deploy FALHOU: $(printf '%s' "$falha_ant" | cut -c3-18) — $(printf '%s' "$falha_ant" | sed -n 's/.*| passo: \(.*\) | erro: \(.*\) | log:.*/\1 → \2/p' | cut -c1-120)"
    fi
    if [ -n "$linha" ]; then
      REAPLICANDO=1
      data_reg=$(printf '%s' "$linha" | sed -n 's/^- \([0-9-]* [0-9:]*\).*/\1/p')
      commit_reg=$(printf '%s' "$linha" | sed -n 's/.*commit \([0-9a-f]\{7,\}\).*/\1/p')
      echo " ----------------------------------------------------------------------"
      echo " ⚠  ESTE DEPLOY JA FOI APLICADO NESTE SERVIDOR"
      echo "    quando   : ${data_reg:-(data não identificada no registro)}"
      echo "    commit   : ${commit_reg:-?}$([ -n "$commit_reg" ] && [ "$commit_reg" = "$commit_atual" ] && echo '  (o MESMO que está no checkout — nada novo entra)' || echo '  (diferente do checkout: o script/código mudou desde então)')"
      echo "    reaplicar: SEGURO — migrations idempotentes, testes e restart rodam de novo."
      echo "               Ctrl+C agora se não era isso que você queria."
    else
      echo " este deploy       : NUNCA aplicado neste servidor (sem linha no registro)"
    fi
    echo " ultimos registros :"
    tail -3 "$reg" | cut -c1-150 | sed 's/^/   /'
  else
    echo " registro          : $reg não existe ainda (primeiro deploy registrado)"
  fi
  echo "======================================================================"
  _deploy_iniciar_log "$script" "$versao"
}

# ── 16/09/2026 — LOG COMPLETO + REGISTRO DE FALHA ─────────────────────────
# Pergunta do cliente (15/09): "todos os deploys quando feitos enviam que foi
# feito para o git e também envia um log de erro caso dê alguma coisa?" — em
# sucesso sim (a linha do registro + commit + push no fim de cada script); em
# erro, NÃO: o `set -e` parava na primeira falha, o erro ficava só no terminal
# e nada era registrado (incidentes v14.52 26/08 e Agenda v2.54+). Agora:
#   • TODA a saída do script vai também para deploy/logs/<script>-<data>.log
#     (fora do git — .gitignore tem `logs/`; os diagnósticos listam orçamentos/
#     clientes e não devem subir pro repositório);
#   • se o script sair com erro (guarda, migration, suíte, health…) ou for
#     interrompido (Ctrl+C), uma linha "FALHOU"/"INTERROMPIDO" entra no
#     REGISTRO-DEPLOYS.md com o passo que quebrou, a última linha do erro e o
#     caminho do log — e é commitada + pushada (fallback: registrada localmente).
#   Sucesso continua por conta do script (a linha "| health OK" de sempre).
DEPLOY_RAIZ=""
DEPLOY_SCRIPT=""
DEPLOY_VERSAO=""
DEPLOY_LOG=""
DEPLOY_FALHA_CMD=""
DEPLOY_FALHA_LINHA=""

_deploy_marcar_falha() { DEPLOY_FALHA_CMD="$2"; DEPLOY_FALHA_LINHA="$1"; }

_deploy_ao_sair() {
  local rc="$1" reg="deploy/REGISTRO-DEPLOYS.md" estado ultima passo branch
  [ "$rc" -eq 0 ] && return 0
  cd "$DEPLOY_RAIZ" 2>/dev/null || return 0
  # a linha de sucesso já entrou? então o erro foi só no push do registro — nada a fazer
  if [ -f "$reg" ] && grep -F "[$DEPLOY_SCRIPT]" "$reg" | tail -1 | grep -q "commit $(git rev-parse --short HEAD 2>/dev/null)" \
     && ! grep -F "[$DEPLOY_SCRIPT]" "$reg" | tail -1 | grep -q "FALHOU\|INTERROMPIDO"; then return 0; fi
  if [ "$rc" -eq 130 ] || [ "$rc" -eq 143 ]; then estado="INTERROMPIDO"; else estado="FALHOU (rc=$rc)"; fi
  passo="${DEPLOY_FALHA_CMD:-(guarda/exit explicito)}"
  [ -n "$DEPLOY_FALHA_LINHA" ] && passo="$passo (linha $DEPLOY_FALHA_LINHA)"
  ultima=""
  [ -n "$DEPLOY_LOG" ] && [ -f "$DEPLOY_LOG" ] && ultima=$(grep -v '^\s*$' "$DEPLOY_LOG" | grep -v '^=====' | tail -1 | cut -c1-200)
  echo
  echo "======================================================================"
  echo " ✗ DEPLOY $estado — ${DEPLOY_VERSAO:-$DEPLOY_SCRIPT}"
  echo "   passo : $passo"
  echo "   erro  : ${ultima:-(veja o log)}"
  echo "   log   : ${DEPLOY_LOG:-(sem log)}"
  echo "   Corrija e rode o MESMO script de novo (migrations idempotentes; ele avisa que está reaplicando)."
  echo "======================================================================"
  [ -f "$reg" ] || printf '# Registro de deploys\n\n' > "$reg"
  echo "- $(date '+%Y-%m-%d %H:%M') | $estado | [$DEPLOY_SCRIPT] | commit $(git rev-parse --short HEAD 2>/dev/null || echo '?') | ${DEPLOY_VERSAO:-} | passo: $(printf '%s' "$passo" | tr -d '\n|' | cut -c1-160) | erro: $(printf '%s' "$ultima" | tr -d '\n|') | log: ${DEPLOY_LOG:-}" >> "$reg"
  git add "$reg" >/dev/null 2>&1 || true
  git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" \
    commit -q -m "deploy: registro — ${DEPLOY_VERSAO:-$DEPLOY_SCRIPT} $estado" >/dev/null 2>&1 || true
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo claude/unified-server-status-7633oz)
  if GIT_TERMINAL_PROMPT=0 git push -q origin "$branch" >/dev/null 2>&1; then
    echo " registro da falha commitado e enviado ao git ($branch)."
  else
    echo " registro da falha commitado LOCALMENTE (push pendente — sobe no próximo deploy)."
  fi
  sleep 0.3
}

_deploy_iniciar_log() {
  DEPLOY_RAIZ="$PWD"; DEPLOY_SCRIPT="$1"; DEPLOY_VERSAO="$2"
  mkdir -p deploy/logs 2>/dev/null || true
  if [ -d deploy/logs ] && [ -w deploy/logs ]; then
    DEPLOY_LOG="deploy/logs/${DEPLOY_SCRIPT%.sh}-$(date '+%Y%m%d-%H%M%S').log"
    exec > >(tee -a "$DEPLOY_LOG") 2>&1
    echo " log desta execução: $DEPLOY_LOG (fora do git; também gravado se der erro)"
  fi
  set -E
  trap '_deploy_marcar_falha "$LINENO" "$BASH_COMMAND"' ERR
  trap '_deploy_ao_sair $?' EXIT
}

# ── 17/09/2026 — REGISTRO DE SUCESSO (registrar_deploy) ───────────────────
# Até aqui cada script repetia À MÃO o bloco final (append no
# REGISTRO-DEPLOYS.md + commit + push). Copiado versão a versão, esse bloco já
# custou dois incidentes: o `>>` comido pelo gerador (v2.74.2/v2.75.0 — o
# deploy funcionava e terminava com erro de git, sem registrar) e, em 17/09, a
# chamada a uma função que NÃO EXISTIA (`registrar_deploy` no
# aplicar-v14-64-tecido-relatorio.sh): o deploy aplicou migrations, suítes,
# restart e health e abortou na ÚLTIMA linha com rc=127, deixando uma linha
# FALHOU no registro apesar de tudo ter dado certo.
#
# Agora o bloco é UMA função, aqui:
#   registrar_deploy "<versao>" "<o que mudou, numa linha>" ["<processo pm2>"]
# Ela escreve a linha (marcada REAPLICADO quando o estado_antes achou registro
# anterior deste mesmo script), commita como "Deploy aplicativos" e empurra
# para a branch ATUAL. Sem rede, registra localmente e avisa — nunca derruba um
# deploy que já está aplicado no servidor.
registrar_deploy() {
  local versao="${1:-}" texto="${2:-}" app="${3:-${DEPLOY_APP:-}}" reg="deploy/REGISTRO-DEPLOYS.md" branch
  [ -n "$DEPLOY_RAIZ" ] && cd "$DEPLOY_RAIZ"
  [ -f "$reg" ] || printf '# Registro de deploys\n\n' > "$reg"
  echo "- $(date '+%Y-%m-%d %H:%M') | ${REAPLICANDO:+REAPLICADO | }[${DEPLOY_SCRIPT:-$(basename "$0")}] | commit $(git rev-parse --short HEAD 2>/dev/null || echo '?') |${app:+ $app |} ${versao}: ${texto} | health OK" >> "$reg"
  git add "$reg" >/dev/null 2>&1 || true
  git -c user.name="Deploy aplicativos" -c user.email="deploy@persianasparana.com.br" \
    commit -q -m "deploy: registro — ${versao}" >/dev/null 2>&1 || true
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo claude/unified-server-status-7633oz)
  if GIT_TERMINAL_PROMPT=0 git push -q origin "$branch" >/dev/null 2>&1; then
    echo "OK ${versao} DEPLOYADA e registrada (branch $branch)."
  else
    echo "OK ${versao} DEPLOYADA e registrada LOCALMENTE (push do registro pendente — sobe no próximo deploy)."
  fi
}
