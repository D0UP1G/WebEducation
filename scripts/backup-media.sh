#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backup_dir=${WEBEDUCATION_BACKUP_DIR:-"$project_root/backups"}
timestamp=${WEBEDUCATION_BACKUP_STAMP:-$(date -u +%Y%m%dT%H%M%SZ)}
backup_file="$backup_dir/webeducation-$timestamp.media.zip"
temporary_file="$backup_file.tmp"

mkdir -p "$backup_dir"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM
cd "$project_root"
docker compose run --rm --no-deps -T --entrypoint python web -m config.media_archive backup > "$temporary_file"
ln "$temporary_file" "$backup_file"
rm -f "$temporary_file"
trap - EXIT HUP INT TERM
printf 'Media backup created: %s\n' "$backup_file"
