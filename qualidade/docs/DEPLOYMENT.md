# Guia de Implantação

Este documento descreve a instalação completa do **Sistema de Gestão de Não Conformidades** em um servidor Linux com Apache.

> **Público-alvo:** Equipe de TI e administradores de sistemas.

---

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Instalação](#2-instalação)
3. [Configuração do Apache](#3-configuração-do-apache)
4. [HTTPS / SSL](#4-https--ssl)
5. [Banco de Dados](#5-banco-de-dados)
6. [Backup e Restauração](#6-backup-e-restauração)
7. [Monitoramento](#7-monitoramento)
8. [Atualização de Versão](#8-atualização-de-versão)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Pré-requisitos

### Sistema operacional
- Ubuntu Server 20.04+ / Debian 11+ / CentOS 8+ / RHEL 8+
- 1 GB RAM (mínimo), 2 GB recomendado
- 5 GB de espaço em disco

### Software

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install apache2 php php-cli php-pdo php-sqlite3 php-mbstring php-json unzip

# CentOS/RHEL
sudo yum install httpd php php-cli php-pdo php-mbstring php-json unzip
```

### Verificar versões mínimas

```bash
php --version    # Deve ser 8.0 ou superior
apache2 -v       # Deve ser 2.4 ou superior
```

### Módulos Apache obrigatórios

```bash
sudo a2enmod rewrite
sudo a2enmod headers
sudo a2enmod deflate
sudo a2enmod expires
sudo systemctl restart apache2
```

---

## 2. Instalação

### 2.1. Extração dos arquivos

```bash
# Criar diretório destino
sudo mkdir -p /var/www/persianas-parana-qualidade

# Extrair o ZIP enviado
sudo unzip persianas-parana-qualidade.zip -d /var/www/

# Ajustar propriedade
sudo chown -R www-data:www-data /var/www/persianas-parana-qualidade
```

### 2.2. Permissões corretas

A regra fundamental é: **somente `data/` precisa ser gravável pelo Apache**. Todo o restante deve ser apenas leitura para o usuário do servidor web.

```bash
cd /var/www/persianas-parana-qualidade

# Diretórios públicos (somente leitura)
sudo find public/ src/ config/ -type d -exec chmod 755 {} \;
sudo find public/ src/ config/ -type f -exec chmod 644 {} \;

# Diretório data/ (leitura e escrita)
sudo chmod 750 data/
sudo chown -R www-data:www-data data/

# Scripts CLI executáveis
sudo chmod 755 scripts/*.sh
```

### 2.3. Executar o instalador

```bash
cd /var/www/persianas-parana-qualidade
sudo -u www-data php scripts/install.php
```

O instalador irá:
- Verificar requisitos do PHP
- Gerar `config/config.php` com `secret_key` aleatório
- Criar o banco de dados SQLite em `data/qualidade.db`
- Solicitar dados do usuário administrador inicial

**Anote** as credenciais cadastradas — são a única forma de acessar o sistema na primeira vez.

### 2.4. Proteger arquivos sensíveis

```bash
sudo chmod 640 config/config.php
sudo chmod 640 data/qualidade.db
```

---

## 3. Configuração do Apache

### 3.1. VirtualHost

Crie o arquivo `/etc/apache2/sites-available/qualidade.conf`:

```apache
<VirtualHost *:80>
    ServerName qualidade.persianasparana.local
    # ServerAlias qualidade.persianasparana.com.br

    DocumentRoot /var/www/persianas-parana-qualidade/public

    <Directory /var/www/persianas-parana-qualidade/public>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>

    # Bloqueia explicitamente acesso aos diretórios privados
    <Directory /var/www/persianas-parana-qualidade/src>
        Require all denied
    </Directory>
    <Directory /var/www/persianas-parana-qualidade/config>
        Require all denied
    </Directory>
    <Directory /var/www/persianas-parana-qualidade/data>
        Require all denied
    </Directory>

    ErrorLog ${APACHE_LOG_DIR}/qualidade-error.log
    CustomLog ${APACHE_LOG_DIR}/qualidade-access.log combined

    # Limita timeout para mitigar slowloris
    Timeout 30
</VirtualHost>
```

Habilite o site:

```bash
sudo a2ensite qualidade
sudo a2dissite 000-default  # opcional, desabilita o site padrão
sudo apache2ctl configtest
sudo systemctl reload apache2
```

### 3.2. Acesso pela rede interna

Caso o sistema seja apenas para uso interno, recomenda-se restringir por IP no VirtualHost:

```apache
<Directory /var/www/persianas-parana-qualidade/public>
    Options -Indexes +FollowSymLinks
    AllowOverride All
    # Permite apenas a rede local
    Require ip 192.168.0.0/16
    Require ip 10.0.0.0/8
</Directory>
```

---

## 4. HTTPS / SSL

**HTTPS é obrigatório em produção.** Senhas e tokens CSRF não podem trafegar em texto plano.

### 4.1. Com Let's Encrypt (servidor público)

```bash
sudo apt install certbot python3-certbot-apache
sudo certbot --apache -d qualidade.persianasparana.com.br
```

O Certbot configura HTTPS automaticamente e renova o certificado a cada 90 dias.

### 4.2. Com certificado interno (servidor local)

Para uso na rede interna, gere um certificado autoassinado ou use uma CA corporativa:

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/qualidade.key \
    -out /etc/ssl/certs/qualidade.crt
```

VirtualHost SSL em `/etc/apache2/sites-available/qualidade-ssl.conf`:

```apache
<VirtualHost *:443>
    ServerName qualidade.persianasparana.local
    DocumentRoot /var/www/persianas-parana-qualidade/public

    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/qualidade.crt
    SSLCertificateKeyFile /etc/ssl/private/qualidade.key

    <Directory /var/www/persianas-parana-qualidade/public>
        AllowOverride All
        Require all granted
    </Directory>

    Header always set Strict-Transport-Security "max-age=63072000"
</VirtualHost>
```

```bash
sudo a2enmod ssl
sudo a2ensite qualidade-ssl
sudo systemctl reload apache2
```

### 4.3. Após habilitar HTTPS

Edite `config/config.php` e garanta:

```php
'session_secure_cookie' => true,
```

E descomente no `public/.htaccess` o bloco que força HTTPS:

```apache
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

---

## 5. Banco de Dados

### 5.1. SQLite (padrão)

Já configurado pelo instalador. Vantagens:
- Zero configuração
- Backup = copiar um arquivo
- Suficiente para até ~50 usuários simultâneos

Localização: `data/qualidade.db`

### 5.2. Migrar para MySQL (opcional)

Se a empresa preferir MySQL/MariaDB:

```sql
-- 1. Criar banco e usuário
CREATE DATABASE persianas_qualidade CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'qualidade_user'@'localhost' IDENTIFIED BY 'SENHA_FORTE_AQUI';
GRANT ALL PRIVILEGES ON persianas_qualidade.* TO 'qualidade_user'@'localhost';
FLUSH PRIVILEGES;
```

```php
// 2. Editar config/config.php
'database' => [
    'driver' => 'mysql',
    'mysql' => [
        'host'     => 'localhost',
        'port'     => 3306,
        'database' => 'persianas_qualidade',
        'username' => 'qualidade_user',
        'password' => 'SENHA_FORTE_AQUI',
        'charset'  => 'utf8mb4',
    ],
],
```

```bash
# 3. Instalar extensão mysql do PHP
sudo apt install php-mysql
sudo systemctl restart apache2

# 4. Re-executar instalador (criará schema no MySQL)
php scripts/install.php
```

---

## 6. Backup e Restauração

### 6.1. Backup automatizado via cron

O sistema inclui `scripts/backup.sh` que compacta banco + configuração e mantém os últimos 30 dias.

```bash
# Editar crontab do root
sudo crontab -e

# Adicionar a linha (executa todo dia às 02:00)
0 2 * * * /var/www/persianas-parana-qualidade/scripts/backup.sh >> /var/log/persianas-backup.log 2>&1
```

### 6.2. Backup manual

```bash
cd /var/www/persianas-parana-qualidade
./scripts/backup.sh
```

Os backups ficam em `backups/qualidade_YYYYMMDD_HHMMSS.tar.gz`.

### 6.3. Restauração

```bash
cd /var/www/persianas-parana-qualidade

# Parar Apache temporariamente para evitar gravação concorrente
sudo systemctl stop apache2

# Restaurar do backup escolhido
tar -xzf backups/qualidade_20260505_020000.tar.gz

# Religar Apache
sudo systemctl start apache2
```

### 6.4. Backup off-site (recomendado)

Sincronize os backups para um servidor externo via `rsync` ou storage em nuvem:

```bash
# Exemplo com rsync para um NAS
rsync -avz /var/www/persianas-parana-qualidade/backups/ usuario@nas.local:/backups/qualidade/
```

---

## 7. Monitoramento

### 7.1. Logs do Apache

```bash
tail -f /var/log/apache2/qualidade-access.log
tail -f /var/log/apache2/qualidade-error.log
```

### 7.2. Logs de auditoria do sistema

A tabela `audit_log` no banco registra todas as ações sensíveis:

```bash
# SQLite
sqlite3 /var/www/persianas-parana-qualidade/data/qualidade.db \
    "SELECT created_at, action, user_id FROM audit_log ORDER BY id DESC LIMIT 50;"
```

### 7.3. Health check

Endpoint simples para uptime monitoring (a ser configurado se necessário):

```bash
curl -I http://qualidade.persianasparana.local/login.html
# Deve retornar HTTP/1.1 200 OK
```

---

## 8. Atualização de Versão

Quando uma nova versão for fornecida:

```bash
cd /var/www

# 1. Backup completo
sudo tar -czf persianas-pre-update-$(date +%Y%m%d).tar.gz persianas-parana-qualidade/

# 2. Backup do banco e config
cd persianas-parana-qualidade
./scripts/backup.sh

# 3. Substituir arquivos (preservando data/ e config/)
cd /tmp
unzip persianas-parana-qualidade-NOVA-VERSAO.zip
sudo cp -r persianas-parana-qualidade/public/* /var/www/persianas-parana-qualidade/public/
sudo cp -r persianas-parana-qualidade/src/* /var/www/persianas-parana-qualidade/src/
sudo cp -r persianas-parana-qualidade/scripts/* /var/www/persianas-parana-qualidade/scripts/
sudo cp -r persianas-parana-qualidade/docs/* /var/www/persianas-parana-qualidade/docs/

# 4. Re-aplicar permissões
sudo chown -R www-data:www-data /var/www/persianas-parana-qualidade
sudo chmod 750 /var/www/persianas-parana-qualidade/data/

# 5. Verificar a versão
grep "version" /var/www/persianas-parana-qualidade/config/config.php
```

---

## 9. Troubleshooting

### Erro 500 ao acessar a aplicação

Verificar:
```bash
sudo tail -50 /var/log/apache2/qualidade-error.log
```

Causas comuns:
- `data/` não tem permissão de escrita para `www-data`
- `config/config.php` não existe (rode `php scripts/install.php`)
- Extensão PHP ausente (`pdo_sqlite`, `mbstring`, `json`)

### "Database is locked" (SQLite)

Indica concorrência elevada. Soluções:
- Reduzir uso simultâneo
- Migrar para MySQL (seção 5.2)

### Login não funciona — sempre dá "Credenciais inválidas"

```bash
# Reset de senha via CLI
cd /var/www/persianas-parana-qualidade
sudo -u www-data php -r '
require "src/Database.php";
require "src/Auth.php";
$cfg = require "config/config.php";
$db = Database::getInstance($cfg["database"]);
$auth = new Auth($db, $cfg["security"]);
$db->query("UPDATE users SET password_hash = ? WHERE username = ?",
    [password_hash("NovaSenha123", PASSWORD_DEFAULT), "admin"]);
echo "Senha redefinida.\n";
'
```

### Sessão expira muito rápido

Aumentar em `config/config.php`:
```php
'session_lifetime' => 3600 * 12, // 12 horas
```

### "Token CSRF inválido" em todas as operações

Indica que a sessão expirou. Fazer logout/login novamente.

---

**Em caso de dúvidas, consulte também:** [SECURITY.md](SECURITY.md) e [ARCHITECTURE.md](ARCHITECTURE.md).
