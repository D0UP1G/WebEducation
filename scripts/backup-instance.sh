#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
running=$(docker compose ps --status running --services)
if printf '%s\n' "$running" | grep -Eq '^(web|proxy)$'; then
    printf '%s\n' 'Stop web and proxy before creating a consistent database + media pair.' >&2
    exit 2
fi
WEBEDUCATION_BACKUP_STAMP=$(date -u +%Y%m%dT%H%M%SZ)
export WEBEDUCATION_BACKUP_STAMP
./scripts/backup-db.sh
./scripts/backup-media.sh
