#!/usr/bin/env bash
# ============================================================================
# Persianas Paraná — instalador do fabrica (PCP + Qualidade)
# ----------------------------------------------------------------------------
# Faz as partes ISOLADAS (não tocam nos outros sistemas):
#   deps do backend, banco próprio (fabrica_db), schema + admin, build do PCP,
#   e o processo PM2 `fabrica-server`.
#
# A ÚNICA etapa que mexe em arquivo compartilhado (Nginx) é MANUAL e fica
# impressa ao final — combine com o responsável pela Logística.
#
# Uso (a partir da raiz do repositório, no servidor):
#   bash deploy/install.sh
#
# Reexecutável (idempotente): não recria o que já existe.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "==> Instalando o fabrica (repositório: $ROOT)"

# 1) Pré-requisitos -----------------------------------------------------------
for c in node npm psql pm2 curl; do
  command -v "$c" >/dev/null 2>&1 || { echo "ERRO: '$c' não encontrado no servidor."; exit 1; }
done
echo "    node $(node -v) · pm2 $(pm2 -v)"

# 2) server/.env --------------------------------------------------------------
ENV="$ROOT/server/.env"
if [[ ! -f "$ENV" ]]; then
  echo "==> Configuração inicial (server/.env)"
  read -rp  "    Usuário do admin do sistema: " ADMIN_USER
  read -rsp "    Senha do admin (mínimo 8 caracteres): " ADMIN_PASS; echo
  read -rsp "    Senha NOVA para o banco (usuário fabrica_user, evite aspas): " DB_PASS; echo
  SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  cp "$ROOT/server/.env.example" "$ENV"
  sed -i "s|^PGPASSWORD=.*|PGPASSWORD=${DB_PASS}|"                 "$ENV"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SECRET}|"          "$ENV"
  sed -i "s|^TRUST_PROXY=.*|TRUST_PROXY=1|"                        "$ENV"
  sed -i "s|^COOKIE_SECURE=.*|COOKIE_SECURE=auto|"                 "$ENV"
  sed -i "s|^FABRICA_ADMIN_USER=.*|FABRICA_ADMIN_USER=${ADMIN_USER}|"     "$ENV"
  sed -i "s|^FABRICA_ADMIN_PASSWORD=.*|FABRICA_ADMIN_PASSWORD=${ADMIN_PASS}|" "$ENV"
  echo "    server/.env criado."
else
  echo "==> server/.env já existe — mantendo a configuração atual."
fi

# carrega variáveis do .env (leitura literal — sem interpretar a senha)
getenv() { grep -E "^$1=" "$ENV" | tail -n1 | cut -d= -f2-; }
PGUSER="$(getenv PGUSER)";         PGUSER="${PGUSER:-fabrica_user}"
PGDATABASE="$(getenv PGDATABASE)"; PGDATABASE="${PGDATABASE:-fabrica_db}"
PGPASSWORD="$(getenv PGPASSWORD)"
PORT="$(getenv PORT)";             PORT="${PORT:-3020}"

# 3) Banco próprio (isolado) --------------------------------------------------
echo "==> Banco PostgreSQL (${PGDATABASE} / ${PGUSER})"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PGUSER}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE ${PGUSER} LOGIN PASSWORD '${PGPASSWORD}';"
  echo "    role ${PGUSER} criada."
else
  echo "    role ${PGUSER} já existe (mantida)."
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE ${PGDATABASE} OWNER ${PGUSER};"
  echo "    banco ${PGDATABASE} criado."
else
  echo "    banco ${PGDATABASE} já existe (mantido)."
fi

# 4) Backend: dependências + schema + admin -----------------------------------
echo "==> Backend (dependências, schema e admin)"
( cd "$ROOT/server" && npm ci --omit=dev && npm run install-app )

# 5) Fonte oficial Galano (OTFs licenciados da pasta compartilhada da Agenda;
#    idempotente — se a origem não existir, segue com o fallback Manrope) -----
echo "==> Fonte oficial Galano Grotesque"
bash "$ROOT/shared/brand/install-galano.sh"

# 6) Frontend do PCP: build para o subpath /fabrica/ --------------------------
echo "==> Build do PCP (subpath /fabrica/)"
( cd "$ROOT/pcp/frontend" && npm ci && VITE_BASE=/fabrica/pcp/ VITE_API_PREFIX=/fabrica/api npm run build )

# 7) PM2 ----------------------------------------------------------------------
echo "==> Serviço PM2 (fabrica-server)"
pm2 delete fabrica-server >/dev/null 2>&1 || true
pm2 start "$ROOT/deploy/ecosystem.config.js" --only fabrica-server
pm2 save

# 8) Verificação --------------------------------------------------------------
sleep 1
if curl -fsS "http://127.0.0.1:${PORT}/healthz" >/dev/null 2>&1; then
  echo "==> OK: backend respondendo em 127.0.0.1:${PORT}"
else
  echo "==> ATENÇÃO: backend não respondeu ainda. Veja: pm2 logs fabrica-server"
fi

cat <<EOF

============================================================================
 INSTALAÇÃO DA APLICAÇÃO CONCLUÍDA.

 Falta 1 passo no Nginx (mexe no arquivo COMPARTILHADO — combine com a
 Logística antes):

   1) sudo cp infra/nginx/fabrica-subpath.conf /etc/nginx/snippets/fabrica-subpath.conf

   2) Edite  /etc/nginx/sites-available/persianas  e, ANTES do bloco
      "location /" (o fallback da Logística), adicione a linha:

          include snippets/fabrica-subpath.conf;

   3) sudo nginx -t && sudo systemctl reload nginx

 Depois, acesse:
   https://192.168.0.207/fabrica/pcp/
   https://192.168.0.207/fabrica/qualidade/
============================================================================
EOF
