#!/usr/bin/env bash
# Scheduler for the Coolify "backup" service: supercronic with a configurable cron expression.
set -Eeuo pipefail
LOG_COMPONENT=backup-cron
source "$(dirname "$0")/common.sh"
schedule="${BACKUP_SCHEDULE:-30 2 * * *}"
printf '%s /usr/local/bin/backup.sh\n' "$schedule" > /tmp/crontab
log info "scheduler started" "schedule=$schedule" "tz=${TZ:-UTC}"
if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then /usr/local/bin/backup.sh || log error "initial backup failed"; fi
exec supercronic -json /tmp/crontab
