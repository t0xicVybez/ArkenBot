#!/usr/bin/env bash
# Nightly ArkenBot source backup with 14-day rotation.
# Backs up source only — no node_modules/dist/.next/build output, no the
# packages/docs submodule (that's its own git repo on GitHub). Includes
# .env since a source-only restore without it can't actually run.
# Installed in the bot user's crontab (03:45 daily, offset from the 03:15
# Postgres dump so they don't compete for disk I/O). Restore with:
#   mkdir restored && tar -xzf ~/backups/source/arkenbot-source-YYYY-MM-DD.tar.gz -C restored
set -euo pipefail

SRC_DIR="/home/bot/bot"
BACKUP_DIR="$HOME/backups/source"
KEEP_DAYS=14
mkdir -p "$BACKUP_DIR"

STAMP=$(date +%F)
OUT="$BACKUP_DIR/arkenbot-source-$STAMP.tar.gz"

tar -czf "$OUT.tmp" \
  -C "$SRC_DIR" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='.next' \
  --exclude='.turbo' \
  --exclude='*.tsbuildinfo' \
  --exclude='.pnpm-store' \
  --exclude='logs' \
  --exclude='.claude' \
  --exclude='packages/docs' \
  .

# Backup contains .env in plaintext (DB/Discord/API credentials) — owner-only.
chmod 600 "$OUT.tmp"
mv "$OUT.tmp" "$OUT"

# Sanity check: a healthy backup is never tiny.
SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 1048576 ]; then
  echo "WARNING: backup suspiciously small ($SIZE bytes): $OUT" >&2
  exit 1
fi

# Rotate
find "$BACKUP_DIR" -name 'arkenbot-source-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) backup ok: $OUT ($SIZE bytes)"
