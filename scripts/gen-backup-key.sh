#!/usr/bin/env bash
# Creates an age keypair for backup encryption.
#   - prints ONLY the public key (set it as BACKUP_AGE_RECIPIENT)
#   - writes the private key to a gitignored *.age.key file (mode 0600). Store a copy OFF the server
#     (password manager / safe). Without it the backups cannot be decrypted.
# Usage: scripts/gen-backup-key.sh [private-key-file]   (default: docker/travelapp-backup.age.key)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEY_FILE="${1:-$ROOT/docker/travelapp-backup.age.key}"
case "$KEY_FILE" in *.age.key) ;; *) echo "key file must end in .age.key (it is gitignored)" >&2; exit 2 ;; esac
[ ! -e "$KEY_FILE" ] || { echo "refusing to overwrite $KEY_FILE" >&2; exit 1; }

umask 077
mkdir -p "$(dirname "$KEY_FILE")"
if command -v age-keygen >/dev/null 2>&1; then
  age-keygen -o "$KEY_FILE" 2>/dev/null
else
  # no local age: use the pinned backup image (built from docker/backup)
  docker build -q -t travelapp-backup:pg15-1 "$ROOT/docker/backup" >/dev/null
  docker run --rm --entrypoint age-keygen travelapp-backup:pg15-1 > "$KEY_FILE" 2>/dev/null
fi
chmod 600 "$KEY_FILE"
echo "Public key (BACKUP_AGE_RECIPIENT): $(grep -i '^# public key:' "$KEY_FILE" | sed 's/^# public key: *//I')"
echo "Private key written to: $KEY_FILE (mode 0600). Keep a copy off the server; never commit it."
