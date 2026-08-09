#!/usr/bin/env bash
#
# Pull, build, migrate, restart. Run on the VM as the churchviewer user:
#
#   sudo -u churchviewer /srv/churchviewer/deploy/deploy.sh
#
# The build happens before anything is restarted, so a compile error leaves the
# running site untouched.
set -euo pipefail

APP_DIR=${APP_DIR:-/srv/churchviewer}

# NOT main. `main` still holds the original scaffold — the working app lives on
# this branch, which is also the repo's default HEAD. Deploying main would roll
# the site back to a four-commit-old skeleton. Change this once they converge.
BRANCH=${BRANCH:-claude/new-churchviewer-repo-wkxvzr}

cd "$APP_DIR"

echo "==> Fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
git checkout --quiet -B deploy "origin/$BRANCH"

echo "==> Installing dependencies"
npm ci

# NEXT_PUBLIC_ROOT_DOMAIN is inlined at build time, so .env.local has to be in
# place and correct *before* this step — changing it later does nothing until
# the next build.
echo "==> Building"
set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env.local"
set +a
npm run build

echo "==> Migrating"
npm run db:migrate

echo "==> Restarting services"
sudo systemctl restart churchviewer.service
sudo systemctl restart churchviewer-worker.service

sleep 2
systemctl is-active --quiet churchviewer.service ||
  { echo "app failed to start:"; journalctl -u churchviewer.service -n 30 --no-pager; exit 1; }
systemctl is-active --quiet churchviewer-worker.service ||
  { echo "worker failed to start:"; journalctl -u churchviewer-worker.service -n 30 --no-pager; exit 1; }

echo "==> Deployed. $(git rev-parse --short HEAD)"
