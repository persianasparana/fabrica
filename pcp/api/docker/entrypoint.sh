#!/bin/sh
set -e

# Garante diretório de dados gravável (volume montado em runtime)
mkdir -p /var/www/pcp/data
chown -R www-data:www-data /var/www/pcp/data

# Provisiona config + admin a partir do ambiente (idempotente)
php /var/www/pcp/docker/bootstrap.php || echo "[entrypoint] bootstrap falhou (seguindo)"

exec apache2-foreground
