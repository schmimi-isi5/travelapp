#!/bin/sh
# Renders kong.yml from the template (placeholders __ANON_KEY__, __SERVICE_ROLE_KEY__, __CORS_ORIGINS__)
# and starts Kong in DB-less mode. Secrets never touch the image, only the container's /tmp.
set -eu
: "${KONG_ANON_KEY:?}" "${KONG_SERVICE_ROLE_KEY:?}" "${KONG_CORS_ORIGINS:?}"
# "https://a, https://b" -> https://a", "https://b (inside a YAML flow sequence of quoted strings)
cors=$(printf '%s' "$KONG_CORS_ORIGINS" | sed 's/ *, */", "/g')
sed -e "s|__ANON_KEY__|${KONG_ANON_KEY}|g" \
    -e "s|__SERVICE_ROLE_KEY__|${KONG_SERVICE_ROLE_KEY}|g" \
    -e "s|__CORS_ORIGINS__|${cors}|g" \
    /home/kong/kong.tmpl.yml > /tmp/kong.yml
export KONG_DECLARATIVE_CONFIG=/tmp/kong.yml
unset KONG_ANON_KEY KONG_SERVICE_ROLE_KEY
exec /docker-entrypoint.sh kong docker-start
