#!/usr/bin/env bash
# Prisma auto-rollback monitor (cron, every minute).
# Probes DB-layer health; after THRESHOLD consecutive failures it triggers a
# one-shot rollback to Prisma 5 (guarded by a sentinel so it never loops).
set -uo pipefail
export PATH="/usr/bin:/bin:/usr/local/bin:${PNPM_HOME:-/home/bot/.local/share/pnpm}:$PATH"
cd /home/bot/bot

THRESHOLD=5                       # consecutive failing checks (≈5 min at 1/min)
STATE=/home/bot/bot/.prisma-monitor.state
SENTINEL=/home/bot/bot/.prisma-rollback-done
LOG=/home/bot/bot/logs/prisma-monitor.log
say(){ echo "[$(date -u +%FT%TZ)] monitor: $*" >> "$LOG"; }

# Kill switch: `touch .prisma-monitor.off` to disable without editing cron.
[ -f /home/bot/bot/.prisma-monitor.off ] && exit 0

if node scripts/db-healthcheck.mjs 2>>"$LOG"; then
  # healthy → reset counter
  [ -f "$STATE" ] && { prev=$(cat "$STATE" 2>/dev/null || echo 0); [ "$prev" -gt 0 ] && say "recovered after $prev failing check(s)"; }
  echo 0 > "$STATE"
  exit 0
fi

# unhealthy → increment
n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STATE"
say "DB health check FAILED ($n/$THRESHOLD consecutive)"

if [ "$n" -ge "$THRESHOLD" ]; then
  if [ -f "$SENTINEL" ]; then
    say "threshold reached but rollback already performed (sentinel present) — not repeating. MANUAL ATTENTION NEEDED."
    exit 0
  fi
  say "THRESHOLD REACHED — triggering one-shot Prisma rollback"
  touch "$SENTINEL"
  if bash scripts/prisma-rollback.sh; then
    echo 0 > "$STATE"
    say "rollback completed. Auto-rollback is now disarmed (sentinel). Review + push."
  else
    say "ROLLBACK SCRIPT FAILED — MANUAL INTERVENTION REQUIRED."
  fi
fi
