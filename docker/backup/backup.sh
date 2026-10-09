#!/usr/bin/env bash
# Full backup: storage files, pg_dump -Fc, pg_dumpall --globals-only, non-secret config, SHA-256 manifest.
# Everything is bundled as one tar stream and encrypted with age to BACKUP_AGE_RECIPIENT (public key only).
# Output: $BACKUP_DIR/travelapp-<UTC timestamp>.tar.age (+ .sha256 of the encrypted file).
# Exit code != 0 on any failure; partial files are removed.
set -Eeuo pipefail
LOG_COMPONENT=backup
# shellcheck source=common.sh
source "$(dirname "$0")/common.sh"

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT (age public key) is required}"
: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STORAGE_DIR="${STORAGE_DIR:-/var/lib/storage}"
CONFIG_DIR="${CONFIG_DIR:-/config}"
export PGDATABASE="${PGDATABASE:-postgres}"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="travelapp-$stamp.tar.age"
stage=$(mktemp -d /work/backup.XXXXXX)
partial="$BACKUP_DIR/.$name.partial"

mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || die "another backup is already running (lock $BACKUP_DIR/.backup.lock)"

cleanup() { rm -rf "${stage:?}" "${partial:?}"; }
on_error() { log error "backup failed" "line=$1" "exit=$2"; cleanup; exit "$2"; }
trap 'on_error "$LINENO" "$?"' ERR
trap cleanup EXIT

started=$SECONDS
log info "backup started" "file=$name"

mkdir -p "$stage/config"
# 1. storage first, database second: every DB row then has its file (orphan files are harmless)
[ -d "$STORAGE_DIR" ] || die "storage dir $STORAGE_DIR not mounted"
tar -C "$STORAGE_DIR" --numeric-owner -czf "$stage/storage.tar.gz" .
log info "storage archived" "bytes=$(stat -c %s "$stage/storage.tar.gz")"

# 2. database
pg_dump -Fc --no-password -f "$stage/db.dump"
pg_restore -l "$stage/db.dump" >/dev/null     # archive is readable
pg_dumpall --globals-only --no-password -f "$stage/globals.sql"
psql -X -tA -c "select name || ' ' || sha256 || ' ' || applied_at from public.schema_migrations order by name" > "$stage/schema_migrations.txt"
log info "database dumped" "bytes=$(stat -c %s "$stage/db.dump")"

# 3. non-secret configuration (compose files, kong.yml, scripts, migrations) - never the secrets file
if [ -d "$CONFIG_DIR/supabase" ]; then
  mkdir -p "$stage/config/supabase" && cp -a "$CONFIG_DIR/supabase/." "$stage/config/supabase/"
fi
if [ -d "$CONFIG_DIR/migrations" ]; then
  mkdir -p "$stage/config/migrations" && cp -a "$CONFIG_DIR/migrations/." "$stage/config/migrations/"
fi
find "$stage/config" \( -name 'stack.secrets' -o -name '*.age.key' -o -name '.env*' \) -delete

# 4. manifest (inside the encrypted bundle)
jq -n --arg created "$(date -u +%FT%TZ)" --arg pg "$(pg_dump --version)" --arg db "$PGDATABASE" \
  '{created:$created, format:1, pg_dump:$pg, database:$db}' > "$stage/INFO.json"
( cd "$stage" && find . -type f ! -name MANIFEST.sha256 -print0 | sort -z | xargs -0 sha256sum > MANIFEST.sha256 )

# 5. bundle + encrypt (public key only) to a partial file, then publish atomically
tar -C "$stage" -cf - . | age -r "$BACKUP_AGE_RECIPIENT" -o "$partial"
sha=$(sha256sum "$partial" | cut -d' ' -f1)
mv "$partial" "$BACKUP_DIR/$name"
printf '%s  %s\n' "$sha" "$name" > "$BACKUP_DIR/$name.sha256"
log info "backup written" "file=$name" "bytes=$(stat -c %s "$BACKUP_DIR/$name")" "sha256=$sha"

# 6. optional S3-compatible target via rclone (configured purely by env, off by default)
if [ "${BACKUP_S3_ENABLED:-false}" = "true" ]; then
  : "${BACKUP_S3_ENDPOINT:?}" "${BACKUP_S3_BUCKET:?}" "${BACKUP_S3_ACCESS_KEY_ID:?}" "${BACKUP_S3_SECRET_ACCESS_KEY:?}"
  export RCLONE_CONFIG_REMOTE_TYPE=s3 RCLONE_CONFIG_REMOTE_PROVIDER="${BACKUP_S3_PROVIDER:-Other}" \
    RCLONE_CONFIG_REMOTE_ENDPOINT="$BACKUP_S3_ENDPOINT" RCLONE_CONFIG_REMOTE_REGION="${BACKUP_S3_REGION:-}" \
    RCLONE_CONFIG_REMOTE_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" RCLONE_CONFIG_REMOTE_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
  remote="remote:${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX:-travelapp}"
  rclone copyto "$BACKUP_DIR/$name" "$remote/$name" --s3-no-check-bucket
  rclone copyto "$BACKUP_DIR/$name.sha256" "$remote/$name.sha256" --s3-no-check-bucket
  log info "uploaded to S3 target" "remote=$remote"
  rclone lsf "$remote" --include 'travelapp-*.tar.age' | sort -r | retention_prune_list | while read -r old; do
    rclone deletefile "$remote/$old"
    rclone deletefile "$remote/$old.sha256" || true
    log info "retention: deleted remote" "file=$old"
  done
fi

# 7. local retention
( cd "$BACKUP_DIR" && ls -1 travelapp-*.tar.age 2>/dev/null | sort -r | retention_prune_list ) | while read -r old; do
  rm -f "${BACKUP_DIR:?}/${old:?}" "${BACKUP_DIR:?}/${old:?}.sha256"
  log info "retention: deleted local" "file=$old"
done

log info "backup finished" "file=$name" "seconds=$((SECONDS - started))"
