#!/usr/bin/env bash
# Nightly ArkenBot Postgres backup with 14-day rotation.
# Installed in the bot user's crontab (03:15 daily). Restore with:
#   gunzip -c ~/backups/postgres/arkenbot-YYYY-MM-DD.sql.gz | psql "$DATABASE_URL"
set -euo pipefail

BACKUP_DIR="$HOME/backups/postgres"
KEEP_DAYS=14
mkdir -p "$BACKUP_DIR"

DATABASE_URL=$(grep '^DATABASE_URL' /home/bot/bot/.env | cut -d= -f2- | tr -d '"')
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL not found"; exit 1; }

STAMP=$(date +%F)
OUT="$BACKUP_DIR/arkenbot-$STAMP.sql.gz"

pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"

# Sanity check: a healthy dump is never tiny.
SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 10240 ]; then
  echo "WARNING: backup suspiciously small ($SIZE bytes): $OUT" >&2
  exit 1
fi

# Rotate
find "$BACKUP_DIR" -name 'arkenbot-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: $OUT ($SIZE bytes)"
