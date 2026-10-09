#!/usr/bin/env bash
# Measures per-container memory/CPU of the local stack idle and under a short synthetic load.
# Usage: scripts/measure-resources.sh [--out FILE.md]     (requires: scripts/stack.sh up)
# Load: 200 PostgREST requests (authenticated user, 10 parallel), 20 password logins,
#       6 Storage uploads of 2 MB + downloads, then peak per container from 1 s samples.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${STACK_PROJECT:-travelapp-local}"
API="${STACK_API_URL:-http://localhost:18000}"
OUT=""
[ "${1:-}" = "--out" ] && OUT="${2:?}"

# shellcheck disable=SC1090
set -a; source "$ROOT/docker/stack.secrets"; set +a

work=$(mktemp -d); trap 'rm -rf "$work"' EXIT
containers() { docker ps --filter "label=com.docker.compose.project=$PROJECT" --format '{{.Names}}' | sort; }
sample() { docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $(containers) | sed 's/ \/ [^ ]*//'; }

echo "[measure] idle sample" >&2
sleep 5
sample > "$work/idle.txt"

# Test user (idempotent) and token
auth_h=(-H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY")
curl -s -X POST "$API/auth/v1/admin/users" "${auth_h[@]}" -H 'content-type: application/json' \
  -d '{"email":"loadtest@example.invalid","password":"load-test-password-1","email_confirm":true}' >/dev/null || true
login() { curl -s "$API/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H 'content-type: application/json' \
  -d '{"email":"loadtest@example.invalid","password":"load-test-password-1"}'; }
token=$(login | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
head -c 2097152 /dev/urandom > "$work/blob.pdf"

echo "[measure] load phase" >&2
( while :; do sample >> "$work/load.txt"; sleep 1; done ) & sampler=$!
conns_max=0
( for _ in $(seq 1 200); do echo "$API/rest/v1/trips?select=*&limit=50"; done |
    xargs -P 10 -I{} curl -s -o /dev/null -H "apikey: $ANON_KEY" -H "Authorization: Bearer $token" {} ) &
( for _ in $(seq 1 20); do login >/dev/null; done ) &
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -X POST "$API/storage/v1/object/documents/loadtest/blob-$i.pdf" "${auth_h[@]}" -H 'content-type: application/pdf' -H 'x-upsert: true' --data-binary @"$work/blob.pdf"
  curl -s -o /dev/null "$API/storage/v1/object/documents/loadtest/blob-$i.pdf" "${auth_h[@]}"
  c=$(docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "${PROJECT}-db-1" psql -U postgres -h localhost -tAc "select count(*) from pg_stat_activity where datname='postgres'")
  [ "$c" -gt "$conns_max" ] && conns_max=$c
done
wait %2 %3 2>/dev/null || true
sleep 2; kill "$sampler" 2>/dev/null || true; wait "$sampler" 2>/dev/null || true
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -X DELETE "$API/storage/v1/object/documents/loadtest/blob-$i.pdf" "${auth_h[@]}"; done

report=$(python3 - "$work/idle.txt" "$work/load.txt" "$conns_max" <<'PY'
import sys, re, collections
def mib(s):
    m = re.match(r'([\d.]+)([KMG]i?B)', s); v = float(m.group(1)); u = m.group(2)[0]
    return v / 1024 if u == 'K' else v * 1024 if u == 'G' else v
idle, peak, cpu = {}, collections.defaultdict(float), collections.defaultdict(float)
for l in open(sys.argv[1]):
    n, m, c = l.split(); idle[n] = mib(m)
for l in open(sys.argv[2]):
    n, m, c = l.split(); peak[n] = max(peak[n], mib(m)); cpu[n] = max(cpu[n], float(c.rstrip('%')))
print('| Container | Idle MiB | Peak MiB (load) | Peak CPU % |\n|---|---:|---:|---:|')
for n in sorted(idle):
    print(f'| {n.replace("travelapp-local-","").rstrip("-1")} | {idle[n]:.0f} | {peak[n]:.0f} | {cpu[n]:.0f} |')
print(f'\nMax. DB connections observed during load: {sys.argv[3]}')
PY
)
report="Measured $(date -u +%F) on $(uname -sm), Docker VM $(docker info --format '{{.NCPU}} CPUs / {{.MemTotal}} bytes RAM').

$report"
echo "$report"
[ -z "$OUT" ] || printf '%s\n' "$report" > "$OUT"
