#!/bin/bash

set -euo pipefail

BACKUP_DIR="/home/spandreou/backups"
UPLOADS_DIR="/home/spandreou/docker-data/uploads"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${PROJECT_DIR}/backup.log"
DB_CONTAINER="${DB_CONTAINER:-homelabshare-db}"
DB_USER="admin"
DB_NAME="homelab_db"
TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
DB_BACKUP_FILE="${BACKUP_DIR}/db_backup_${TIMESTAMP}.sql"
FILES_BACKUP_FILE="${BACKUP_DIR}/uploads_backup_${TIMESTAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "Backup started"

if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
  if docker ps --format '{{.Names}}' | grep -qx "postgres"; then
    DB_CONTAINER="postgres"
    log "Primary DB container not found, using fallback container: $DB_CONTAINER"
  else
    log "DB container not running: $DB_CONTAINER"
    exit 1
  fi
fi

if docker exec -t "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$DB_BACKUP_FILE"; then
  log "DB backup succeeded: $DB_BACKUP_FILE"
else
  rm -f "$DB_BACKUP_FILE"
  log "DB backup failed"
  exit 1
fi

if tar -czf "$FILES_BACKUP_FILE" -C "$UPLOADS_DIR" .; then
  log "Uploads backup succeeded: $FILES_BACKUP_FILE"
else
  rm -f "$FILES_BACKUP_FILE"
  log "Uploads backup failed"
  exit 1
fi

find "$BACKUP_DIR" -type f \( -name "*.sql" -o -name "*.tar.gz" \) -mtime +7 -delete
log "Retention cleanup completed (removed backups older than 7 days)"

log "Backup finished"
