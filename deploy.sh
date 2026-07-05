#!/usr/bin/env bash
# ArkenBot deploy — builds packages, then reloads PM2 so the running services
# always match the source. Prevents the "fixed but not live" stale-dist problem.
#
# Usage:
#   ./deploy.sh              # build bot + api + web, then reload
#   ./deploy.sh bot api      # build only the named packages, then reload
#   ./deploy.sh --prisma     # also run prisma db push + generate first
set -euo pipefail
cd "$(dirname "$0")"

PACKAGES=()
RUN_PRISMA=0
for arg in "$@"; do
  case "$arg" in
    --prisma) RUN_PRISMA=1 ;;
    bot|api|web) PACKAGES+=("$arg") ;;
    *) echo "unknown argument: $arg (expected: bot, api, web, --prisma)"; exit 1 ;;
  esac
done
[ ${#PACKAGES[@]} -eq 0 ] && PACKAGES=(bot api web)

if [ "$RUN_PRISMA" -eq 1 ]; then
  echo "── prisma db push + generate ──"
  npx prisma db push --skip-generate
  npx prisma generate
fi

for pkg in "${PACKAGES[@]}"; do
  echo "── building $pkg ──"
  (cd "packages/$pkg" && npm run build)
done

echo "── reloading PM2 ──"
pm2 startOrReload ecosystem.config.cjs --update-env

sleep 4
echo "── status ──"
pm2 list
echo
echo "── recent errors (last 60 lines) ──"
pm2 logs --nostream --lines 60 2>/dev/null | grep -E '"level":(50|40)' | grep -v "Reddit alert skipped" | tail -5 || echo "none"
echo
echo "Deploy complete: ${PACKAGES[*]}"
