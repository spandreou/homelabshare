#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${CONTAINER_NAME:-postgres}"
DB_NAME="${DB_NAME:-homelab_db}"
DB_USER="${DB_USER:-}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

if [[ -z "$DB_USER" ]]; then
  DB_USER="$(docker exec "$CONTAINER_NAME" sh -lc 'printf "%s" "${POSTGRES_USER:-postgres}"')"
fi

echo "[backup] container=$CONTAINER_NAME db=$DB_NAME user=$DB_USER"

docker exec "$CONTAINER_NAME" sh -lc 'pg_dump -U "$0" -d "$1"' "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

echo "[backup] done: $BACKUP_FILE"
