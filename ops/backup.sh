#!/usr/bin/env bash
# Takes a compressed, dated backup of the CRM database and verifies it can be read.
#
#   ops/backup.sh
#
# Settings (environment variables, all optional):
#   BACKUP_DIR          where dumps go                          (default: ./backups next to this repo)
#   KEEP_DAYS           delete dumps older than this            (default: 30)
#   BACKUP_UPLOAD_CMD   run after a good backup with the file path appended — copy it off this
#                       server, e.g.  "rclone copy" or "aws s3 cp --endpoint-url ... " (see DEPLOY.md)
#   PG_DOCKER_CONTAINER use Postgres tools inside this container (development)
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-$here/../backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y-%m-%d_%H%M%S)"
file="$BACKUP_DIR/gcs-crm_${stamp}.dump"

echo "Backing up $DB_NAME to $file"
pg pg_dump -d "$DB_NAME" --format=custom --no-owner > "$file.partial"

# A backup nobody has read back is not a backup: make sure the archive is well formed and non-trivial.
entries="$(pg pg_restore --list < "$file.partial" | grep -c . || true)"
size="$(wc -c < "$file.partial" | tr -d ' ')"
if [ "$size" -lt 2000 ] || [ "$entries" -lt 20 ]; then
  rm -f "$file.partial"
  echo "Backup looks wrong ($size bytes, $entries entries) — discarded" >&2
  exit 1
fi
mv "$file.partial" "$file"
echo "OK: $size bytes, $entries objects"

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "Copying off-server: $BACKUP_UPLOAD_CMD"
  # shellcheck disable=SC2086
  $BACKUP_UPLOAD_CMD "$file"
fi

find "$BACKUP_DIR" -name 'gcs-crm_*.dump' -mtime +"$KEEP_DAYS" -print -delete | sed 's/^/Pruned: /' || true
