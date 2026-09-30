#!/usr/bin/env bash
# Proves a backup restores: loads it into a throwaway database, compares row counts
# with the live database, then drops the throwaway. Run it monthly.
#
#   ops/restore-check.sh                 # newest backup
#   ops/restore-check.sh path/to.dump    # a specific one
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

BACKUP_DIR="${BACKUP_DIR:-$here/../backups}"
dump="${1:-$(ls -1t "$BACKUP_DIR"/gcs-crm_*.dump 2>/dev/null | head -1)}"
[ -f "${dump:-}" ] || { echo "No backup found in $BACKUP_DIR" >&2; exit 1; }

scratch="gcs_crm_restorecheck_$(date +%s)"
cleanup() { pg psql -d postgres -q -c "DROP DATABASE IF EXISTS \"$scratch\" WITH (FORCE)" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Restoring $(basename "$dump") into $scratch"
pg psql -d postgres -q -c "CREATE DATABASE \"$scratch\""
pg pg_restore -d "$scratch" --no-owner --exit-on-error < "$dump"

count() { pg psql -d "$1" -At -c "SELECT count(*) FROM \"$2\"" | tr -d '[:space:]'; }
fail=0
printf '%-16s %10s %10s\n' TABLE LIVE RESTORED
for t in User Lead Application Applicant Sanction Disbursement Commission Document AuditLog Setting; do
  live="$(count "$DB_NAME" "$t")"; restored="$(count "$scratch" "$t")"
  mark=""; [ "$restored" -gt "$live" ] && { mark="  <- more than live?"; fail=1; }
  printf '%-16s %10s %10s%s\n' "$t" "$live" "$restored" "$mark"
done

# Rows added after the backup are expected to be missing from it; rows in the backup that are not live are not.
[ "$fail" -eq 0 ] && echo "Restore check passed." || { echo "Restore check found something odd." >&2; exit 1; }
