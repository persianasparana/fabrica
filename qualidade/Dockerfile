# Sistema de Qualidade — PHP + Apache (serve frontend e API)
FROM php:8.3-apache

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends libsqlite3-dev; \
    docker-php-ext-install pdo pdo_sqlite pdo_mysql; \
    a2enmod rewrite headers; \
    rm -rf /var/lib/apt/lists/*

ENV APACHE_DOCUMENT_ROOT=/var/www/qualidade/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

RUN printf '<Directory ${APACHE_DOCUMENT_ROOT}>\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
    > /etc/apache2/conf-available/qualidade.conf && a2enconf qualidade

COPY . /var/www/qualidade
RUN chown -R www-data:www-data /var/www/qualidade \
 && chmod +x /var/www/qualidade/docker/entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/var/www/qualidade/docker/entrypoint.sh"]
