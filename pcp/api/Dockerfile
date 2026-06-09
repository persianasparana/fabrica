# Backend do PCP — PHP + Apache
FROM php:8.3-apache

# Extensões PDO (SQLite e MySQL)
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends libsqlite3-dev; \
    docker-php-ext-install pdo pdo_sqlite pdo_mysql; \
    a2enmod rewrite headers; \
    rm -rf /var/lib/apt/lists/*

# Document root = public/
ENV APACHE_DOCUMENT_ROOT=/var/www/pcp/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf \
 && sed -ri -e 's!/var/www/!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf

# Permite .htaccess (AllowOverride All) no document root
RUN printf '<Directory ${APACHE_DOCUMENT_ROOT}>\n  AllowOverride All\n  Require all granted\n</Directory>\n' \
    > /etc/apache2/conf-available/pcp.conf && a2enconf pcp

COPY . /var/www/pcp
RUN chown -R www-data:www-data /var/www/pcp \
 && chmod +x /var/www/pcp/docker/entrypoint.sh

EXPOSE 80
ENTRYPOINT ["/var/www/pcp/docker/entrypoint.sh"]
