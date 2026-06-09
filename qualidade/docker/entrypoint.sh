#!/bin/sh
set -e

mkdir -p /var/www/qualidade/data
chown -R www-data:www-data /var/www/qualidade/data

php /var/www/qualidade/docker/bootstrap.php || echo "[entrypoint] bootstrap falhou (seguindo)"

exec apache2-foreground
