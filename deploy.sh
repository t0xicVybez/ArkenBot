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
  npx prisma db push
  npx prisma generate
fi

# Always rebuild the workspace libraries first: bot/api/web compile against
# their dist, so a stale lib is the classic "builds locally, breaks on deploy".
echo "── building workspace libs (shared, addon-sdk) ──"
(cd packages/shared && npm run build)
(cd packages/addon-sdk && npm run build)

# Web is served by `next start`, which reads `.next` (client reference manifests)
# per request. Rebuilding it in place under the live process throws "Could not
# find the module … in the React Client Manifest" errors until the restart lands.
# So when web is deploying, stop it first and clear its stale build; it comes
# back fresh below. bot/api don't have this issue (they load dist once at boot).
WEB_SELECTED=0
for pkg in "${PACKAGES[@]}"; do [ "$pkg" = web ] && WEB_SELECTED=1; done
if [ "$WEB_SELECTED" -eq 1 ]; then
  echo "── stopping web for a clean .next rebuild (brief downtime) ──"
  pm2 stop web 2>/dev/null || true
  rm -rf packages/web/.next
fi

for pkg in "${PACKAGES[@]}"; do
  echo "── building $pkg ──"
  (cd "packages/$pkg" && npm run build)
done

echo "── reloading PM2 ──"
pm2 startOrReload ecosystem.config.cjs --update-env
# startOrReload may not revive a stopped app; hard-start web on the fresh build.
[ "$WEB_SELECTED" -eq 1 ] && pm2 restart web --update-env

sleep 4
echo "── status ──"
pm2 list
echo
echo "── recent errors (last 60 lines) ──"
pm2 logs --nostream --lines 60 2>/dev/null | grep -E '"level":(50|40)' | grep -v "Reddit alert skipped" | tail -5 || echo "none"
echo
echo "Deploy complete: ${PACKAGES[*]}"
