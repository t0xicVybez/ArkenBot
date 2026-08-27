#!/usr/bin/env bash
# Emergency rollback: Prisma 7 (driver adapter) → Prisma 5, then rebuild+reload
# bot & api. Restores the exact pre-upgrade file state from the `pre-prisma7`
# tag. Commits locally (does NOT push — leaves that for human review).
set -euo pipefail
export PATH="/usr/bin:/bin:/usr/local/bin:${PNPM_HOME:-/home/bot/.local/share/pnpm}:$PATH"
cd /home/bot/bot
LOG=/home/bot/bot/logs/prisma-monitor.log
say(){ echo "[$(date -u +%FT%TZ)] rollback: $*" | tee -a "$LOG"; }

say "STARTING Prisma 7→5 rollback"
FILES="package.json packages/bot/package.json packages/api/package.json prisma/schema.prisma packages/bot/src/database.ts packages/api/src/database.ts pnpm-lock.yaml"
git checkout pre-prisma7 -- $FILES
git rm -f --ignore-unmatch prisma.config.ts >/dev/null 2>&1 || true
say "restored prisma5 files; installing"
pnpm install >>"$LOG" 2>&1
npx prisma generate >>"$LOG" 2>&1
say "rebuilding bot + api"
pnpm --filter @arkenbot/shared build >>"$LOG" 2>&1 || true
pnpm --filter @arkenbot/bot build >>"$LOG" 2>&1
pnpm --filter @arkenbot/api build >>"$LOG" 2>&1
say "reloading bot + api"
pm2 reload bot >>"$LOG" 2>&1
pm2 reload api >>"$LOG" 2>&1
git -c user.name='Cory Lynch' -c user.email='cory.lynch88@gmail.com' commit -am "revert: auto-rollback Prisma 7 → 5 after sustained DB failure" >>"$LOG" 2>&1 || true
say "DONE. Prisma rolled back to 5. NOT pushed — review logs and 'git push' if correct."
