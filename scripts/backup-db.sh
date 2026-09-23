#!/bin/sh
set -eu

project_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
backup_dir=${WEBEDUCATION_BACKUP_DIR:-"$project_root/backups"}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/webeducation-$timestamp.dump"
temporary_file="$backup_file.tmp"

mkdir -p "$backup_dir"
trap 'rm -f "$temporary_file"' EXIT HUP INT TERM

cd "$project_root"
docker compose exec -T db sh -c 'pg_dump --format=custom --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$temporary_file"
mv "$temporary_file" "$backup_file"
trap - EXIT HUP INT TERM

printf 'Database backup created: %s\n' "$backup_file"
