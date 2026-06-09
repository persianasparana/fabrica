# Implantação — fabrica

Dois caminhos. **Docker** é o mais rápido e portável; **Apache/PHP nativo**
encaixa no servidor de aplicativos já existente da Persianas Paraná.

---

## Opção A — Docker Compose (recomendado)

Pré-requisitos: Docker + Docker Compose no servidor.

```bash
git clone <repo> fabrica && cd fabrica
cp .env.example .env
# edite .env: defina PCP_ADMIN_PASSWORD e QUALIDADE_ADMIN_PASSWORD
docker compose up -d --build
```

- PCP → http://SERVIDOR:8080
- Qualidade → http://SERVIDOR:8081

Os bancos ficam em volumes (`pcp-data`, `qualidade-data`). O admin inicial é
criado no primeiro start a partir do `.env`.

**Produção:** coloque os serviços atrás de um proxy TLS (Nginx/Traefik/Apache)
e defina `PP_INSECURE_COOKIES=0` no `.env` (exige HTTPS para os cookies).

---

## Opção B — Apache + PHP nativo

Encaixa no servidor existente. Requisitos: Linux, Apache 2.4+ (mods `rewrite`,
`headers`), PHP 8.0+ (`pdo`, `pdo_sqlite` ou `pdo_mysql`, `mbstring`, `json`),
Node 20+ **apenas para compilar** o frontend do PCP (pode ser feito em outra
máquina/CI e enviar só o `dist/`).

### 1. Código no servidor

```bash
sudo mkdir -p /var/www/fabrica
sudo rsync -a ./ /var/www/fabrica/        # ou git clone
```

### 2. Compilar o frontend do PCP

```bash
cd /var/www/fabrica/pcp/frontend
npm ci && npm run build                   # gera dist/
```

> Sem Node no servidor? Rode `npm run build` em outra máquina/CI e copie apenas
> a pasta `dist/` para `/var/www/fabrica/pcp/frontend/dist`.

### 3. Instalar os backends

```bash
# PCP
cd /var/www/fabrica/pcp/api && php scripts/install.php

# Qualidade
cd /var/www/fabrica/qualidade && php scripts/install.php
```

Cada instalador gera `config/config.php` (com `secret_key` aleatório), cria o
banco/esquema e o usuário administrador.

### 4. Permissões

```bash
cd /var/www/fabrica
sudo chown -R www-data:www-data pcp/api/data qualidade/data
sudo find pcp qualidade -type d -exec chmod 755 {} \;
sudo find pcp qualidade -type f -exec chmod 644 {} \;
sudo chmod 750 pcp/api/data qualidade/data
```

### 5. VirtualHosts

Exemplos prontos em [`infra/apache/`](../infra/apache/):

```bash
sudo cp infra/apache/pcp.conf       /etc/apache2/sites-available/
sudo cp infra/apache/qualidade.conf /etc/apache2/sites-available/
sudo a2enmod rewrite headers
sudo a2ensite pcp qualidade
sudo systemctl reload apache2
```

O vhost do PCP serve o `dist/` e mapeia `/api` para `pcp/api/public/api`
(mesma origem → cookies de sessão funcionam). O do Qualidade serve `public/`.

### 6. HTTPS

Use Let's Encrypt (`certbot --apache`) e mantenha
`session_secure_cookie => true` nos `config/config.php` (padrão).

---

## Atualizações

```bash
cd /var/www/fabrica && git pull
cd pcp/frontend && npm ci && npm run build      # rebuild do frontend
# backends: o schema é idempotente; nenhum passo extra normalmente
sudo systemctl reload apache2
```

## Identidade visual

Ao receber o logotipo/cores oficiais: atualize `shared/brand/`, rode
`bash shared/brand/sync.sh` e recompile o PCP (`npm run build`). Ver
[`shared/brand/README.md`](../shared/brand/README.md).

## Backup

- **SQLite:** copie `pcp/api/data/*.db` e `qualidade/data/*.db` (com o serviço
  parado ou via `sqlite3 .backup`). O Qualidade inclui `scripts/backup.sh`.
- **MySQL:** `mysqldump` das bases `persianas_pcp` e `persianas_qualidade`.
