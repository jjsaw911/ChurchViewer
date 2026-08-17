#!/usr/bin/env bash
#
# Pull, build, migrate, restart. Run on the VM as a user with sudo:
#
#   sudo /srv/churchviewer/deploy/deploy.sh
#
# It drops to the `churchviewer` user for everything touching the checkout, and
# stays root only for systemctl. Don't run the whole thing as `churchviewer` —
# that account is a --system user with no sudo rights, so the restarts at the
# end would fail after the build had already replaced .next.
#
# The build happens before anything is restarted, so a compile error leaves the
# running site untouched.
set -euo pipefail

APP_DIR=${APP_DIR:-/srv/churchviewer}
APP_USER=${APP_USER:-churchviewer}

# NOT main. `main` still holds the original scaffold — the working app lives on
# this branch, which is also the repo's default HEAD. Deploying main would roll
# the site back to a skeleton. Change this once they converge.
BRANCH=${BRANCH:-claude/new-churchviewer-repo-wkxvzr}

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo — the restarts at the end need root." >&2
  exit 1
fi

as_app() { sudo -u "$APP_USER" "$@"; }

cd "$APP_DIR"

echo "==> Fetching $BRANCH"
as_app git fetch --quiet origin "$BRANCH"
as_app git checkout --quiet -B deploy "origin/$BRANCH"
echo "    at $(as_app git rev-parse --short HEAD)"

echo "==> Installing dependencies"
as_app npm ci --no-audit --no-fund

# NEXT_PUBLIC_ROOT_DOMAIN is inlined at build time, so .env.local has to be in
# place and correct *before* this step — changing it later does nothing until
# the next build. The file is mode 600 and owned by the app user, which is why
# the env is loaded in the child rather than sourced here as root.
echo "==> Building"
as_app bash -c 'set -a; source "$1/.env.local"; set +a; npm run build' _ "$APP_DIR"

echo "==> Migrating"
as_app bash -c 'set -a; source "$1/.env.local"; set +a; npm run db:migrate' _ "$APP_DIR"

echo "==> Restarting"
systemctl restart churchviewer.service
# Only if it's actually enabled — the worker stays off until OPENAI_API_KEY is set.
if systemctl is-enabled --quiet churchviewer-worker.service; then
  systemctl restart churchviewer-worker.service
fi

sleep 3
if ! systemctl is-active --quiet churchviewer.service; then
  echo "app failed to start:" >&2
  journalctl -u churchviewer.service -n 30 --no-pager >&2
  exit 1
fi

echo "==> Deployed $(as_app git rev-parse --short HEAD)"
