# Implantação — fabrica (no servidor compartilhado `aplicativos`)

O servidor já roda **Logística** e **Agenda de Consultores** em produção
(Nginx + Node/PM2 + PostgreSQL). O `fabrica` entra como **app novo isolado**,
seguindo as regras de `docs/SERVIDOR-COMPARTILHADO.md` — **sem tocar** no que
existe.

Recursos próprios do fabrica:

| Recurso | Valor |
|---|---|
| Diretório | `/var/www/fabrica` |
| Porta interna | **3020** (127.0.0.1) |
| Processo PM2 | `fabrica-server` |
| Banco / usuário | `fabrica_db` / `fabrica_user` |
| Rota pública | `/fabrica/` (subpath) **ou** hostname dedicado |

> ⚠️ Antes de qualquer comando global ou que toque o compartilhado (incluir
> linha no vhost, etc.), **combine com o responsável** e rode `sudo nginx -t`
> antes de `reload`. Nunca use `restart`/`pm2 kill`/`pm2 delete all`.

---

## Instalação rápida (script)

No servidor, depois de clonar o repositório em `/var/www/fabrica`:

```bash
cd /var/www/fabrica
bash deploy/install.sh
```

O script pergunta o usuário/senha do admin e a senha do banco e cuida de:
dependências do backend, banco próprio (`fabrica_db`), schema + admin, build do
PCP (subpath) e o processo PM2 `fabrica-server`. Ao final, imprime o **único
passo manual** (Nginx). Os passos detalhados (caso prefira manual) seguem abaixo.

---

## 1. Pré-requisitos (já presentes no servidor)

```bash
node -v        # 20+  (mesma versão dos outros apps)
psql --version # PostgreSQL 16
nginx -v       # 1.24
pm2 -v
```

---

## 2. Código

```bash
sudo mkdir -p /var/www/fabrica && sudo chown "$USER" /var/www/fabrica
git clone <repo> /var/www/fabrica && cd /var/www/fabrica
```

## 3. Banco isolado (não tocar nos existentes)

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE fabrica_user LOGIN PASSWORD 'DEFINA_SENHA_FORTE';
CREATE DATABASE fabrica_db OWNER fabrica_user;
SQL
```

## 4. Backend

```bash
cd /var/www/fabrica/server
cp .env.example .env
# edite: PGPASSWORD, SESSION_SECRET (aleatório), TRUST_PROXY=1, COOKIE_SECURE=auto,
#        FABRICA_ADMIN_USER / FABRICA_ADMIN_PASSWORD, PORT=3020
npm ci --omit=dev
npm run install-app        # cria schema + admin (idempotente)
```

`SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 5. Frontend do PCP (build)

**Subpath `/fabrica/`** (opção A):

```bash
cd /var/www/fabrica/pcp/frontend && npm ci
VITE_BASE=/fabrica/pcp/ VITE_API_PREFIX=/fabrica/api npm run build
```

**Hostname dedicado** (opção B): `npm ci && npm run build` (padrão).

> O Qualidade é estático e usa caminhos relativos — não precisa de build e
> funciona nas duas opções sem alteração.

## 6. Processo (PM2)

```bash
cd /var/www/fabrica
pm2 start deploy/ecosystem.config.js --only fabrica-server
pm2 save                     # persiste (o pm2 startup do servidor já existe)
pm2 status fabrica-server
curl -s http://127.0.0.1:3020/healthz   # {"ok":true}
```

Após mudar código: `pm2 delete fabrica-server && pm2 start deploy/ecosystem.config.js --only fabrica-server && pm2 save`.

> Alternativa a PM2: `infra/systemd/fabrica.service` (se preferir systemd).

## 7. Nginx

### Opção A — subpath `/fabrica/` (recomendada; como a Agenda)

```bash
sudo cp infra/nginx/fabrica-subpath.conf /etc/nginx/snippets/fabrica-subpath.conf
```
No vhost compartilhado (`/etc/nginx/sites-available/persianas`), **antes** do
fallback `/*` da Logística, adicionar **uma linha** (única alteração no arquivo
compartilhado — combine com o responsável):
```nginx
include snippets/fabrica-subpath.conf;
```
```bash
sudo nginx -t && sudo systemctl reload nginx
```
Acesso: `https://192.168.0.207/fabrica/pcp/` e `…/fabrica/qualidade/`.

### Opção B — hostname dedicado

Arquivo novo, sem tocar nos vhosts existentes — ver `infra/nginx/fabrica-host.conf`
(requer SAN no certificado para o novo nome; alinhar antes de regenerar o cert,
ou usar `tailscale cert`).

---

## 8. Verificação de convivência (checklist)

```bash
sudo ss -tlnp | grep -E ':(3000|3001|3010|3011)'   # apps antigos intactos
pm2 status                                          # persianas-api, agenda-api, agenda-admin OK + fabrica-server
sudo -u postgres psql -c "\l" | grep -E 'persianas_db|agenda_consultores|fabrica_db'
curl -sik https://192.168.0.207/ | head -1          # Logística responde
curl -sik https://192.168.0.207/agenda/ | head -1   # Agenda responde
curl -sik https://192.168.0.207/fabrica/pcp/ | head -1
```

Nada dos sistemas existentes é alterado — só foram **adicionados** porta, processo,
banco e (subpath) uma linha de `include` no vhost.

---

## 9. Atualizações

```bash
cd /var/www/fabrica && git pull
bash shared/brand/install-galano.sh   # fonte oficial Galano (idempotente; pula se a origem não existir)
cd server && npm ci --omit=dev
cd ../pcp/frontend && npm ci && VITE_BASE=/fabrica/pcp/ VITE_API_PREFIX=/fabrica/api npm run build   # (subpath)
pm2 delete fabrica-server && pm2 start ../../deploy/ecosystem.config.js --only fabrica-server && pm2 save
```

## 10. Backup

```bash
pg_dump -U fabrica_user -h 127.0.0.1 fabrica_db | gzip > fabrica_$(date +%F).sql.gz
```
(O servidor ainda não tem rotina automática — pendência compartilhada nos docs de infra.)

---

## Acesso remoto

Hoje via **OpenVPN**; **Tailscale** (split-tunnel) está planejado — quando
entrar, um nome MagicDNS para o fabrica habilita a opção B com HTTPS válido
(ver `ACESSO-TAILSCALE.md` no repo da Logística).

## Identidade visual

Paleta provisória. Ao definir a marca oficial, atualize `shared/brand/`, rode
`bash shared/brand/sync.sh` e recompile o PCP.
