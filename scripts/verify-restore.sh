#!/usr/bin/env bash
# End-to-end backup/restore proof in an isolated throwaway project "travelapp-restoretest":
#   stack up -> fixtures (family, trip, stay+payment, journal entry, 1 Storage object) -> backup
#   -> destroy ALL volumes of that project -> clean stack (db only) -> restore -> start rest of stack
#   -> assert row counts, object sha256 and user login are identical -> tear down.
# Touches only resources labelled with the compose project travelapp-restoretest. Own temp secrets/keys.
# Usage: scripts/verify-restore.sh [--keep]    (--keep skips the final teardown for debugging)
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SB="$ROOT/docker/supabase"
PROJECT="travelapp-restoretest"
NET="${PROJECT}_backend"
KEEP=false; [ "${1:-}" = "--keep" ] && KEEP=true
TMP=$(mktemp -d)
TOOLS_IMAGE="travelapp-backup:pg15-1"
step() { printf '\n[verify-restore] %s\n' "$*"; }
fail() { printf '\n[verify-restore] FAILED: %s\n' "$*" >&2; exit 1; }

compose() {
  docker compose -p "$PROJECT" --env-file "$TMP/stack.secrets" -f "$SB/compose.yml" -f "$SB/compose.backup.yml" "$@"
}
teardown() {
  step "teardown: removing containers, volumes and network of project $PROJECT"
  compose --profile admin --profile restore down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "${TMP:?}"
}
if [ "$KEEP" = false ]; then trap teardown EXIT; else trap 'echo "kept: project $PROJECT, temp dir $TMP"' EXIT; fi

secret() { grep -E "^$1=" "$TMP/stack.secrets" | cut -d= -f2-; }
sql() { compose exec -T -e PGPASSWORD="$(secret POSTGRES_PASSWORD)" db psql -X -U postgres -h localhost -tA -v ON_ERROR_STOP=1 "$@"; }
# curl inside the project network (no host ports needed)
api() { docker run --rm --network "$NET" -v "$TMP:/t" --entrypoint curl "$TOOLS_IMAGE" -sS "$@"; }

SNAPSHOT_SQL="select (select count(*) from public.families), (select count(*) from public.trips), (select count(*) from public.stays), (select count(*) from public.payments), (select count(*) from public.journal_entries), (select count(*) from auth.users), (select count(*) from storage.objects), (select count(*) from public.schema_migrations)"

step "build tooling image, generate throwaway secrets and age key"
docker build -q -t "$TOOLS_IMAGE" "$ROOT/docker/backup" >/dev/null
node "$ROOT/scripts/gen-secrets.mjs" --out "$TMP/stack.secrets" --site-url http://localhost:3999 --api-url http://localhost:3998 >/dev/null
chmod 700 "$TMP"
docker run --rm --entrypoint age-keygen "$TOOLS_IMAGE" > "$TMP/restore.age.key" 2>/dev/null
RECIPIENT=$(grep -i '^# public key' "$TMP/restore.age.key" | sed 's/.*: //')
mkdir -p "$TMP/backups"
export BACKUP_AGE_RECIPIENT="$RECIPIENT" BACKUP_HOST_DIR="$TMP/backups"
SERVICE_KEY=$(secret SERVICE_ROLE_KEY); ANON_KEY=$(secret ANON_KEY)

step "1/7 start source stack and apply migrations"
compose up -d --wait db auth rest storage kong >/dev/null
compose run --rm --no-deps -T migrate | tail -1

step "2/7 load fixtures (user via admin API, SQL rows, one Storage object)"
USER_ID=$(api -X POST http://kong:8000/auth/v1/admin/users -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H 'content-type: application/json' -d '{"email":"restore@example.invalid","password":"restore-test-pass-1","email_confirm":true}' | jq -r .id)
[ -n "$USER_ID" ] && [ "$USER_ID" != null ] || fail "could not create test user"
sql -v uid="$USER_ID" < "$ROOT/scripts/fixtures/restore-test.sql" >/dev/null
head -c 300000 /dev/urandom > "$TMP/object.pdf"
SRC_SHA=$(shasum -a 256 "$TMP/object.pdf" | cut -d' ' -f1)
code=$(api -o /dev/null -w '%{http_code}' -X POST "http://kong:8000/storage/v1/object/documents/11111111-1111-4111-8111-111111111111/restore-test.pdf" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'content-type: application/pdf' --data-binary @/t/object.pdf)
[ "$code" = 200 ] || fail "object upload returned HTTP $code"
BEFORE=$(sql -c "$SNAPSHOT_SQL")
echo "row snapshot before (families|trips|stays|payments|journal|auth.users|storage.objects|migrations): $BEFORE"
echo "object sha256 before: $SRC_SHA"

step "3/7 run backup (encrypted, manifest, retention)"
compose run --rm --no-deps -T backup /usr/local/bin/backup.sh | tail -2
BACKUP_FILE=$(ls -1 "$TMP/backups" | grep -E '\.tar\.age$' | tail -n1)
[ -n "$BACKUP_FILE" ] || fail "no backup file produced"
if grep -a -q 'PGDMP' "$TMP/backups/$BACKUP_FILE"; then fail "backup is not encrypted"; fi
echo "backup: $BACKUP_FILE ($(wc -c < "$TMP/backups/$BACKUP_FILE" | tr -d ' ') bytes, encrypted)"

step "4/7 destroy the stack including all volumes (simulated total loss)"
compose --profile admin down --volumes --remove-orphans >/dev/null 2>&1
if docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" | grep -q .; then fail "volumes of $PROJECT still exist after down"; fi
# keep the backup (lives in $TMP/backups bind mount, not in a project volume)
[ -f "$TMP/backups/$BACKUP_FILE" ] || fail "backup file vanished"

step "5/7 clean stack: database only, then restore over the freshly initialised database (explicit confirm)"
compose up -d --wait db >/dev/null
INIT_TABLES=$(sql -c "select count(*) from pg_tables where schemaname in ('public','auth','storage')")
echo "tables from image init in public/auth/storage before restore: $INIT_TABLES"
RESTORE_TARGET_DB=postgres RESTORE_CONFIRM_OVERWRITE=postgres RESTORE_STORAGE_DIR=/var/lib/storage \
  compose --profile restore run --rm --no-deps -T -v "$TMP/restore.age.key:/key:ro" restore "/backups/$BACKUP_FILE" 2>&1 | sed 's/^/  /'

step "6/7 start the remaining services on the restored data, re-run migrations (must apply nothing)"
compose up -d --wait db auth rest storage kong >/dev/null
compose run --rm --no-deps -T migrate | tail -1 | tee "$TMP/migrate.out"
grep -q 'applied=0' "$TMP/migrate.out" || fail "migrate applied something after restore"

step "7/7 assertions"
AFTER=$(sql -c "$SNAPSHOT_SQL")
echo "row snapshot after:  $AFTER"
[ "$BEFORE" = "$AFTER" ] || fail "row counts differ: before=$BEFORE after=$AFTER"
api -o /t/restored.pdf "http://kong:8000/storage/v1/object/documents/11111111-1111-4111-8111-111111111111/restore-test.pdf" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY"
DST_SHA=$(shasum -a 256 "$TMP/restored.pdf" | cut -d' ' -f1)
echo "object sha256 after:  $DST_SHA"
[ "$SRC_SHA" = "$DST_SHA" ] || fail "object sha256 differs"
login=$(api -o /dev/null -w '%{http_code}' "http://kong:8000/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
  -H 'content-type: application/json' -d '{"email":"restore@example.invalid","password":"restore-test-pass-1"}')
[ "$login" = 200 ] || fail "login of restored user returned HTTP $login"
echo "login of restored user: HTTP $login"

printf '\n[verify-restore] PASSED: row counts, object sha256 and user login identical after total-loss restore\n'
