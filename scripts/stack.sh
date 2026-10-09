#!/usr/bin/env bash
# Local convenience wrapper for the self-hosted Supabase stack (compose project "travelapp-local").
# Usage: scripts/stack.sh secrets|up|down|reset|status|logs [service]|migrate|app-up
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS="$ROOT/docker/stack.secrets"
SB="$ROOT/docker/supabase"
PROJECT="travelapp-local"
export COMPOSE_IGNORE_ORPHANS=true   # the app container belongs to the same project but not to every file set

compose() {
  docker compose --env-file "$SECRETS" \
    -f "$SB/compose.yml" -f "$SB/compose.local.yml" "$@"
}
compose_with_app() {
  docker compose --env-file "$SECRETS" \
    -f "$SB/compose.yml" -f "$SB/compose.local.yml" \
    -f "$ROOT/docker/compose.app.yml" -f "$ROOT/docker/compose.app.local.yml" "$@"
}
log() { printf '[stack] %s\n' "$*"; }

cmd_secrets() {
  if [ -f "$SECRETS" ]; then log "docker/stack.secrets already exists, keeping it"; else node "$ROOT/scripts/gen-secrets.mjs"; fi
}

require_secrets() { [ -f "$SECRETS" ] || { log "missing $SECRETS, run: scripts/stack.sh secrets"; exit 1; }; }

# Core services; "migrate" is a one-shot job and is run explicitly (a finished container is not re-run by "up").
CORE_SERVICES=(db auth rest storage kong mailpit)

run_migrate() {
  compose rm -f -s migrate >/dev/null 2>&1 || true
  compose run --rm --no-deps -T migrate
}

cmd_up() {
  cmd_secrets
  log "starting stack (waits for healthy services and the migrate job)"
  compose up -d --wait "${CORE_SERVICES[@]}"
  run_migrate
  log "stack healthy, migrations applied. API: http://localhost:18000  Mailpit: http://localhost:18025  Postgres: 127.0.0.1:54329"
}

cmd_down() { require_secrets; compose --profile admin down --remove-orphans; }

cmd_reset() {
  require_secrets
  log "reset removes ONLY these volumes of project ${PROJECT}:"
  docker volume ls -q --filter "label=com.docker.compose.project=${PROJECT}" | sed 's/^/  - /'
  compose --profile admin down --volumes --remove-orphans
  log "reset done (docker/stack.secrets kept)"
}

cmd_status() { require_secrets; compose --profile admin ps -a; }
cmd_logs() { require_secrets; compose --profile admin logs --tail=200 "$@"; }

cmd_migrate() {
  require_secrets
  compose up -d --wait db auth rest storage
  run_migrate
}

cmd_app_up() {
  cmd_secrets
  compose_with_app up -d --build --wait "${CORE_SERVICES[@]}" app
  run_migrate
  log "app: http://localhost:18080 (healthy)"
}

case "${1:-}" in
  secrets) cmd_secrets ;;
  up) cmd_up ;;
  down) cmd_down ;;
  reset) cmd_reset ;;
  status) cmd_status ;;
  logs) shift; cmd_logs "$@" ;;
  migrate) cmd_migrate ;;
  app-up) cmd_app_up ;;
  *) echo "usage: scripts/stack.sh secrets|up|down|reset|status|logs [service]|migrate|app-up" >&2; exit 2 ;;
esac
