# Dockberth — app image for PHP projects that need a local build:
# WSL2 projects (www-data remapped to the distro user's UID/GID so the
# unprivileged container can write the bind mount — serversideup's
# supported local-dev pattern) and/or presets with extra PHP extensions.
# Regenerated from .dockberth/config.json.
FROM serversideup/php:{php_version}-fpm-nginx
USER root
#[section:php_extensions]
RUN install-php-extensions {php_extensions}
#[/section]
#[section:wsl_ids]
RUN docker-php-serversideup-set-id www-data {uid}:{gid} && \
    docker-php-serversideup-set-file-permissions --owner www-data:www-data --service nginx
#[/section]
USER www-data
