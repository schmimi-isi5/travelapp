#!/usr/bin/env bash
# Shared helpers for backup.sh / restore.sh: JSON-line logging and the retention policy.

log() { # level message [key=value ...]
  local level="$1" message="$2"; shift 2
  local extra="" kv
  for kv in "$@"; do extra+=$(printf ',"%s":"%s"' "${kv%%=*}" "${kv#*=}"); done
  printf '{"ts":"%s","level":"%s","component":"%s","message":"%s"%s}\n' \
    "$(date -u +%FT%TZ)" "$level" "${LOG_COMPONENT:-backup}" "${message//\"/\\\"}" "$extra"
}
die() { log error "$1" "${@:2}"; exit 1; }

# Reads backup file names (travelapp-YYYYMMDDTHHMMSSZ.tar.age) on stdin, newest first, and prints the
# names that fall outside the policy: newest per day (BACKUP_KEEP_DAILY), per ISO week (BACKUP_KEEP_WEEKLY)
# and per month (BACKUP_KEEP_MONTHLY).
retention_prune_list() {
  local keep_daily="${BACKUP_KEEP_DAILY:-7}" keep_weekly="${BACKUP_KEEP_WEEKLY:-4}" keep_monthly="${BACKUP_KEEP_MONTHLY:-6}"
  local -A seen_day=() seen_week=() seen_month=()
  local name stamp day week month keep
  while read -r name; do
    [ -n "$name" ] || continue
    stamp="${name#travelapp-}"; stamp="${stamp%%T*}"
    day="${stamp:0:4}-${stamp:4:2}-${stamp:6:2}"
    week=$(date -u -d "$day" +%G-%V); month="${day:0:7}"
    keep=0
    if [ -z "${seen_day[$day]:-}" ] && [ "${#seen_day[@]}" -lt "$keep_daily" ]; then seen_day[$day]=1; keep=1; fi
    if [ -z "${seen_week[$week]:-}" ] && [ "${#seen_week[@]}" -lt "$keep_weekly" ]; then seen_week[$week]=1; keep=1; fi
    if [ -z "${seen_month[$month]:-}" ] && [ "${#seen_month[@]}" -lt "$keep_monthly" ]; then seen_month[$month]=1; keep=1; fi
    [ "$keep" = 1 ] || echo "$name"
  done
}
