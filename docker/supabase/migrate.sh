#!/bin/bash
# Idempotent migration runner (one-shot compose service "migrate").
#  1. waits until auth.users, storage.buckets, storage.objects(owner_id) exist (created by GoTrue / Storage API)
#  2. re-syncs the service role passwords with POSTGRES_PASSWORD (matters after a password rotation)
#  3. takes an advisory lock and applies /migrations/*.sql in lexical order, one transaction per file
#  4. records name + sha256 + timestamp in public.schema_migrations; skips applied files;
#     FAILS if the checksum of an applied file changed.
# Output: JSON lines. Exit code != 0 on any failure.
set -euo pipefail
export LC_ALL=C

MIGRATIONS_DIR="${MIGRATIONS_DIR:-/migrations}"
WAIT_SECONDS="${MIGRATE_WAIT_SECONDS:-180}"
MIGRATE_DB_USER="${MIGRATE_DB_USER:-postgres}"       # same role as Supabase's own migrations (default privileges!)
LOCK_KEY=727274001                                      # arbitrary, fixed advisory lock id
ADMIN_USER="${PGUSER:-supabase_admin}"

log() { printf '{"ts":"%s","level":"%s","component":"migrate","message":"%s"}\n' "$(date -u +%FT%TZ)" "$1" "$2"; }
fail() { log error "$1"; exit 1; }

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
[ "${#files[@]}" -gt 0 ] || fail "no *.sql files in $MIGRATIONS_DIR"

# 1. wait for schemas created by other services
deadline=$((SECONDS + WAIT_SECONDS))
until [ "$(psql -X -tA -c "select (to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null and exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id'))" 2>/dev/null || echo f)" = "t" ]; do
  [ "$SECONDS" -lt "$deadline" ] || fail "timeout after ${WAIT_SECONDS}s waiting for auth.users / storage.buckets / storage.objects.owner_id"
  sleep 2
done
log info "auth and storage schemas present"

# 2. role passwords follow POSTGRES_PASSWORD
psql -X -q -v ON_ERROR_STOP=1 -v pw="$MIGRATE_ROLE_PASSWORD" <<'SQL' >/dev/null
ALTER ROLE authenticator PASSWORD :'pw';
ALTER ROLE supabase_auth_admin PASSWORD :'pw';
ALTER ROLE supabase_storage_admin PASSWORD :'pw';
ALTER ROLE postgres PASSWORD :'pw';
ALTER ROLE supabase_admin PASSWORD :'pw';
SQL
log info "service role passwords synchronised"

# 3./4. generate one psql script, run it in ONE session (the advisory lock lives as long as the session)
script=$(mktemp)
{
  echo '\set ON_ERROR_STOP on'
  echo "set client_min_messages = warning;"
  echo "set lock_timeout = '120s';"
  echo "select pg_advisory_lock($LOCK_KEY);"
  echo "set lock_timeout = 0;"
  cat <<'SQL'
create table if not exists public.schema_migrations (
  name text primary key,
  sha256 text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from public, anon, authenticated, service_role;
SQL
  for f in "${files[@]}"; do
    name=$(basename "$f")
    sum=$(sha256sum "$f" | cut -d' ' -f1)
    cat <<SQL
select coalesce((select sha256 from public.schema_migrations where name = '$name'), '') as prev \\gset
select (:'prev' = '') as is_new, (:'prev' = '$sum') as is_same \\gset
\\if :is_new
  begin;
  \\i $f
  insert into public.schema_migrations(name, sha256) values ('$name', '$sum');
  commit;
  \\echo {"level":"info","component":"migrate","event":"applied","file":"$name","sha256":"$sum"}
\\elif :is_same
  \\echo {"level":"info","component":"migrate","event":"skipped","file":"$name","sha256":"$sum"}
\\else
  \\echo {"level":"error","component":"migrate","event":"checksum_mismatch","file":"$name","current_sha256":"$sum","message":"recorded checksum differs"}
  do \$\$ begin raise exception 'checksum of applied migration $name changed (applied files are immutable, add a new migration instead)'; end \$\$;
\\endif
SQL
  done
  echo "notify pgrst, 'reload schema';"
  echo "select pg_advisory_unlock($LOCK_KEY);"
} > "$script"

out=$(mktemp)
if ! PGUSER="$MIGRATE_DB_USER" psql -X -q -t -A -v ON_ERROR_STOP=1 -f "$script" >"$out" 2>"$out.err"; then
  grep -h '^{' "$out" || true
  sed 's/"/\\"/g; s/^/{"level":"error","component":"migrate","message":"/; s/$/"}/' "$out.err"
  fail "migration run failed (the failing file was rolled back)"
fi
grep -h '^{' "$out" || true
applied=$(grep -c '"event":"applied"' "$out" || true)
skipped=$(grep -c '"event":"skipped"' "$out" || true)
log info "done applied=$applied skipped=$skipped"
