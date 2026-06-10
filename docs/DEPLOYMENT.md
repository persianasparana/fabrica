# Implantação — fabrica (Node + PostgreSQL + Nginx)

Guia para o servidor de aplicativos da Persianas Paraná (Ubuntu, Nginx,
PostgreSQL, apps Node). O `fabrica` roda como **mais um serviço Node** atrás do
Nginx, **sem alterar** nada do que já existe.

> Princípio de convivência: serviço próprio (systemd) em porta local dedicada,
> banco PostgreSQL próprio e um **novo** server block no Nginx. Portas, vhosts e
> bancos dos outros apps permanecem intactos.

---

## 1. Pré-requisitos

```bash
node -v      # precisa ser 20+  (se for menor, instale via nodesource/nvm)
psql --version
nginx -v
```

PostgreSQL e Nginx já estão no servidor. Só falta o código e a configuração.

---

## 2. Código

```bash
sudo mkdir -p /var/www/fabrica
sudo chown "$USER" /var/www/fabrica
git clone <repo> /var/www/fabrica
cd /var/www/fabrica
```

---

## 3. Banco de dados (isolado)

Crie um banco e um usuário **dedicados** — não reutilize bancos existentes:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE fabrica LOGIN PASSWORD 'DEFINA_UMA_SENHA_FORTE';
CREATE DATABASE fabrica OWNER fabrica;
SQL
```

O schema é criado automaticamente na instalação (passo 4).

---

## 4. Backend

```bash
cd /var/www/fabrica/server
cp .env.example .env
nano .env     # defina PGPASSWORD, SESSION_SECRET (aleatório), TRUST_PROXY=1, COOKIE_SECURE=auto
              # e FABRICA_ADMIN_USER / FABRICA_ADMIN_PASSWORD para o admin inicial

npm ci --omit=dev
npm run install-app    # aplica o schema e cria o admin
```

Gere um `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## 5. Frontend do PCP (build)

```bash
cd /var/www/fabrica/pcp/frontend
npm ci
npm run build          # gera dist/ (servido pelo backend)
```

> Pouca memória/CPU no servidor? Rode o build em outra máquina/CI e copie só
> `pcp/frontend/dist/`. O Qualidade não tem build (estático puro).

---

## 6. Serviço (systemd)

```bash
sudo cp /var/www/fabrica/infra/systemd/fabrica.service /etc/systemd/system/
sudo chown -R www-data:www-data /var/www/fabrica
sudo systemctl daemon-reload
sudo systemctl enable --now fabrica
sudo systemctl status fabrica        # deve estar "active (running)"
curl -s http://127.0.0.1:8080/healthz # {"ok":true}
```

O serviço lê as variáveis de `server/.env` (via dotenv) e escuta em
`127.0.0.1:8080` (não exposto publicamente).

---

## 7. Nginx (novo server block)

```bash
sudo cp /var/www/fabrica/infra/nginx/fabrica.conf /etc/nginx/sites-available/
# ajuste o server_name no arquivo
sudo ln -s /etc/nginx/sites-available/fabrica.conf /etc/nginx/sites-enabled/
sudo nginx -t          # valida SEM afetar os outros sites
sudo systemctl reload nginx
```

HTTPS (recomendado):

```bash
sudo certbot --nginx -d fabrica.persianas.com.br
```

Acesse: `https://fabrica.persianas.com.br/pcp/` e `…/qualidade/`.

---

## 8. Verificação de convivência

```bash
sudo ss -tlnp | grep -E ':3000|:3010|:3011'   # apps antigos seguem ativos
systemctl is-active fabrica nginx postgresql
sudo -u postgres psql -c "\l" | grep -E 'fabrica|<bancos_existentes>'
```

Nada das aplicações existentes é alterado — só foram **adicionados** um serviço,
um banco e um server block.

---

## 9. Atualizações

```bash
cd /var/www/fabrica && git pull
cd server && npm ci --omit=dev          # se mudaram dependências
cd ../pcp/frontend && npm ci && npm run build
sudo systemctl restart fabrica
```

O schema é idempotente (recriado/migrado no start).

---

## 10. Backup

```bash
# Banco
pg_dump -U fabrica -h 127.0.0.1 fabrica | gzip > fabrica_$(date +%F).sql.gz
# Restauração: gunzip -c arquivo.sql.gz | psql -U fabrica -h 127.0.0.1 fabrica
```

---

## Identidade visual

Ao receber a marca oficial: atualize `shared/brand/`, rode
`bash shared/brand/sync.sh`, recompile o PCP (`npm run build`) e reinicie o
serviço. Ver [`shared/brand/README.md`](../shared/brand/README.md).
