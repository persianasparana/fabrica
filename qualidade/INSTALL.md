# Guia Rápido de Instalação

> Documento sintético para a equipe de TI. Para instruções detalhadas, consulte **`docs/DEPLOYMENT.md`**.

---

## TL;DR — instalação em 6 comandos

```bash
# 1. Extrair o ZIP no servidor
sudo unzip persianas-parana-qualidade.zip -d /var/www/

# 2. Instalar dependências (Ubuntu/Debian)
sudo apt update && sudo apt install -y apache2 php php-cli php-pdo php-sqlite3 php-mbstring

# 3. Habilitar módulos Apache
sudo a2enmod rewrite headers deflate expires

# 4. Permissões
sudo chown -R www-data:www-data /var/www/persianas-parana-qualidade
sudo chmod 750 /var/www/persianas-parana-qualidade/data

# 5. Rodar instalador (cria DB e usuário admin)
cd /var/www/persianas-parana-qualidade
sudo -u www-data php scripts/install.php

# 6. Configurar VirtualHost (criar /etc/apache2/sites-available/qualidade.conf)
#    e habilitar:
sudo a2ensite qualidade && sudo systemctl reload apache2
```

---

## VirtualHost mínimo

```apache
<VirtualHost *:80>
    ServerName qualidade.local
    DocumentRoot /var/www/persianas-parana-qualidade/public

    <Directory /var/www/persianas-parana-qualidade/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

---

## Antes de liberar para os usuários

- [ ] HTTPS configurado (Certbot ou certificado interno)
- [ ] `session_secure_cookie => true` em `config/config.php`
- [ ] Backup automatizado via cron (`scripts/backup.sh`)
- [ ] Senha do admin com 12+ caracteres
- [ ] Acesso restrito por IP/VPN se for sistema só interno

---

## Documentação completa

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Visão geral |
| `docs/DEPLOYMENT.md` | Implantação detalhada (HTTPS, MySQL, backup, troubleshooting) |
| `docs/ARCHITECTURE.md` | Arquitetura interna |
| `docs/API.md` | Especificação REST |
| `docs/SECURITY.md` | Modelo de segurança e checklist de hardening |
| `docs/USER_MANUAL.md` | Para o usuário final (Qualidade) |

---

## Suporte

Em caso de dúvidas:
1. Verificar logs: `/var/log/apache2/qualidade-error.log`
2. Consultar seção **Troubleshooting** em `docs/DEPLOYMENT.md`
