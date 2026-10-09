# Backup/restore tooling. pg_dump major version must match the server (supabase/postgres 15.x) -> postgres:15.
FROM postgres:15.19-alpine3.24
RUN apk add --no-cache bash coreutils tar jq curl age rclone supercronic tzdata \
 && mkdir -p /backups /work
COPY common.sh backup.sh restore.sh backup-cron.sh /usr/local/bin/
RUN chmod 0755 /usr/local/bin/*.sh
ENV BACKUP_DIR=/backups
ENTRYPOINT []
CMD ["/usr/local/bin/backup-cron.sh"]
