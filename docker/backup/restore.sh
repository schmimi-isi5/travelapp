#!/usr/bin/env bash
# Restore an encrypted backup. Safe by default: restores into a NEW database (restore_<timestamp>) and
# refuses to touch an existing non-empty database unless RESTORE_CONFIRM_OVERWRITE=<exact database name>.
#
# Usage: restore.sh <backup file | latest>
# Env:   BACKUP_AGE_IDENTITY  path to the age private key (mounted file)                  [required]
#        RESTORE_TARGET_DB    target database name (default restore_<timestamp>)
#        RESTORE_CONFIRM_OVERWRITE  must equal RESTORE_TARGET_DB for an existing non-empty target
#        RESTORE_STORAGE_DIR  directory to extract the storage files into (optional; skipped if unset)
#        PGHOST/PGUSER/PGPASSWORD  connection (superuser role, normally supabase_admin)
set -Eeuo pipefail
LOG_COMPONENT=restore
source "$(dirname "$0")/common.sh"

: "${BACKUP_AGE_IDENTITY:?path to the age private key is required}" "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
arg="${1:-}"; [ -n "$arg" ] || die "usage: restore.sh <backup file|latest>"
if [ "$arg" = latest ]; then arg="$BACKUP_DIR/$(ls -1 "$BACKUP_DIR" | grep -E '^travelapp-.*\.tar\.age$' | sort | tail -n1)"; fi
[ -f "$arg" ] || die "backup file not found" "file=$arg"
[ -f "$BACKUP_AGE_IDENTITY" ] || die "age identity file not found" "file=$BACKUP_AGE_IDENTITY"

target="${RESTORE_TARGET_DB:-restore_$(date -u +%Y%m%d%H%M%S)}"
[[ "$target" =~ ^[a-z_][a-z0-9_]*$ ]] || die "invalid target database name" "target=$target"
work=$(mktemp -d /work/restore.XXXXXX)
trap 'rm -rf "${work:?}"' EXIT
trap 'log error "restore failed" "line=$LINENO"' ERR

# 1. verify the encrypted file, decrypt, verify the inner manifest
if [ -f "$arg.sha256" ]; then
  expected=$(cut -d' ' -f1 "$arg.sha256"); actual=$(sha256sum "$arg" | cut -d' ' -f1)
  [ "$expected" = "$actual" ] || die "checksum of encrypted backup does not match" "file=$arg"
  log info "outer checksum ok"
else
  log warn "no .sha256 sidecar next to the backup, skipping outer checksum" "file=$arg"
fi
age -d -i "$BACKUP_AGE_IDENTITY" "$arg" | tar -C "$work" -xf -
( cd "$work" && sha256sum -c --quiet MANIFEST.sha256 ) || die "manifest verification failed (backup corrupted or tampered)"
log info "manifest verified" "files=$(wc -l < "$work/MANIFEST.sha256")"

# 2. target database: refuse to touch anything non-empty without explicit confirmation
exists=$(psql -X -tAd postgres -c "select 1 from pg_database where datname='$target'")
clean=()
if [ "$exists" = 1 ]; then
  tables=$(psql -X -tAd "$target" -c "select count(*) from pg_tables where schemaname in ('public','auth','storage')")
  if [ "$tables" != 0 ] && [ "${RESTORE_CONFIRM_OVERWRITE:-}" != "$target" ]; then
    die "refusing to restore into non-empty database; set RESTORE_CONFIRM_OVERWRITE=$target to overwrite" "target=$target" "tables=$tables"
  fi
  [ "$tables" = 0 ] || log warn "OVERWRITING existing database" "target=$target"
  clean=(--clean --if-exists)
else
  psql -X -q -d postgres -c "create database \"$target\""
  log info "created database" "target=$target"
fi

pg_restore --no-password -d "$target" "${clean[@]}" --exit-on-error "$work/db.dump"
log info "database restored" "target=$target"

# 3. storage files
if [ -n "${RESTORE_STORAGE_DIR:-}" ]; then
  mkdir -p "$RESTORE_STORAGE_DIR"
  if [ -n "$(ls -A "$RESTORE_STORAGE_DIR" 2>/dev/null)" ] && [ "${RESTORE_CONFIRM_OVERWRITE:-}" != "$target" ]; then
    die "refusing to extract into non-empty storage dir; set RESTORE_CONFIRM_OVERWRITE=$target" "dir=$RESTORE_STORAGE_DIR"
  fi
  tar -C "$RESTORE_STORAGE_DIR" --numeric-owner -xzf "$work/storage.tar.gz"
  log info "storage restored" "dir=$RESTORE_STORAGE_DIR"
else
  log info "storage not restored (RESTORE_STORAGE_DIR unset); archive is storage.tar.gz inside the bundle"
fi
log info "restore finished" "target=$target" "migrations=$(wc -l < "$work/schema_migrations.txt")"
