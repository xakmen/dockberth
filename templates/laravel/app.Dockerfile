# Dockberth — app image for WSL2-hosted Laravel projects.
# Remaps www-data to the distro user's UID/GID (serversideup's supported
# local-dev pattern) so the unprivileged container can write bind-mounted
# files at native speed. Regenerated from .dockberth/config.json.
FROM serversideup/php:{php_version}-fpm-nginx
USER root
RUN docker-php-serversideup-set-id www-data {uid}:{gid} && \
    docker-php-serversideup-set-file-permissions --owner www-data:www-data --service nginx
USER www-data
