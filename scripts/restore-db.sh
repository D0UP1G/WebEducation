#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "1" ]; then
    printf '%s\n' 'Set CONFIRM_RESTORE=1 after stopping web and proxy services to restore a database backup.' >&2
    exit 2
fi

if [ "$#" -ne 1 ]; then
    printf '%s\n' 'Usage: CONFIRM_RESTORE=1 ./scripts/restore-db.sh path/to/backup.dump' >&2
    exit 2
fi

backup_file=$1
if [ ! -f "$backup_file" ]; then
    printf 'Backup file not found: %s\n' "$backup_file" >&2
    exit 2
fi

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$backup_file"

printf 'Database restored from: %s\n' "$backup_file"
