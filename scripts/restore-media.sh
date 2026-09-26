#!/bin/sh
set -eu

if [ "${CONFIRM_RESTORE:-}" != "1" ]; then
    printf '%s\n' 'Set CONFIRM_RESTORE=1 after stopping web and proxy services to restore media.' >&2
    exit 2
fi
if [ "$#" -ne 1 ] || [ ! -f "$1" ]; then
    printf '%s\n' 'Usage: CONFIRM_RESTORE=1 ./scripts/restore-media.sh path/to/backup.media.zip' >&2
    exit 2
fi

backup_file=$1
project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_root"
running=$(docker compose ps --status running --services)
if printf '%s\n' "$running" | grep -Eq '^(web|proxy)$'; then
    printf '%s\n' 'Stop web and proxy before restoring media.' >&2
    exit 2
fi
docker compose run --rm --no-deps -T --entrypoint python web -m config.media_archive restore < "$backup_file"
printf 'Media restored from: %s\n' "$backup_file"
