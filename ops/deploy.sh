#!/usr/bin/env bash
# Runs ON THE SERVER after the new code has been copied to /opt/gcs-crm (the GitHub deploy workflow does both).
# Installs, migrates, builds, restarts and checks the app is healthy; if it is not, puts the previous build back.
# Database changes are NOT undone by a rollback, which is why migrations must only ever add things.
set -euo pipefail

APP=${APP_DIR:-/opt/gcs-crm}
SITE=${SITE_DIR:-/var/www/gcs-crm}
SERVICE=${SERVICE:-gcs-crm}
HEALTH=${HEALTH_URL:-http://127.0.0.1:4000/crm/api/health}
as_app() { sudo -n -u gcs "$@"; }

say() { printf '\n== %s\n' "$*"; }

say "Keeping the current build in case we need to go back"
as_app rm -rf "$APP/backend/dist.prev"
[ -d "$APP/backend/dist" ] && as_app cp -a "$APP/backend/dist" "$APP/backend/dist.prev"

say "Backend: install, migrate, build"
cd "$APP/backend"
as_app npm ci --no-audit --no-fund
as_app npx prisma migrate deploy
as_app npm run build

say "Front end: install, build"
cd "$APP/frontend"
as_app npm ci --no-audit --no-fund
as_app npm run build

say "Restarting the API"
sudo -n /usr/bin/systemctl restart "$SERVICE"

healthy() {
  for _ in $(seq 1 20); do
    if curl -fsS "$HEALTH" | grep -q '"database":true'; then return 0; fi
    sleep 2
  done
  return 1
}

if healthy; then
  say "Publishing the front end"
  sudo -n /usr/bin/rsync -a --delete "$APP/frontend/dist/" "$SITE/"
  say "Deployed OK"
  exit 0
fi

say "The API did not come back healthy - restoring the previous build"
if [ -d "$APP/backend/dist.prev" ]; then
  as_app rm -rf "$APP/backend/dist"
  as_app mv "$APP/backend/dist.prev" "$APP/backend/dist"
  sudo -n /usr/bin/systemctl restart "$SERVICE"
  healthy && echo "Previous build is running again. Any database migration from this deploy was NOT undone."
fi
exit 1
