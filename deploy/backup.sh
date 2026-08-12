#!/usr/bin/env bash
#
# One copy of the database, off this machine.
#
# Everything a church has typed lives in Postgres on this one VM: their plans,
# their songs, the slides somebody spent an evening timing. The files are in a
# bucket and could be re-uploaded; none of that could be typed again by Sunday.
#
# A dump is taken, checked that it is actually a dump, and put in the same
# bucket as the media under `backups/`. Nothing is deleted until the new copy
# is safely up there.
#
# Run by `churchviewer-backup.timer` every morning, and by hand before anything
# that touches the schema:
#
#   sudo -u churchviewer /srv/churchviewer/deploy/backup.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/churchviewer}"
BACKUP_DIR="${BACKUP_DIR:-/mnt/churchviewer/backups}"
# Long enough that a problem introduced quietly can still be undone once
# somebody notices — a bad migration is usually found weeks later, not hours.
KEEP_LOCAL_DAYS="${KEEP_LOCAL_DAYS:-14}"
KEEP_REMOTE_DAYS="${KEEP_REMOTE_DAYS:-120}"

# The same file the app reads, so the backup can never be pointed at a
# different database than the one being served.
set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env.local"
set +a

: "${DATABASE_URL:?DATABASE_URL is not set in $APP_DIR/.env.local}"
: "${GCS_BUCKET:?GCS_BUCKET is not set in $APP_DIR/.env.local}"
: "${GOOGLE_APPLICATION_CREDENTIALS:?GOOGLE_APPLICATION_CREDENTIALS is not set in $APP_DIR/.env.local}"

# The VM's own service account is scoped read-only for storage on purpose, so
# the upload has to be the app's storage account — the same key the app writes
# uploads with. It gets its own gcloud config directory rather than sharing the
# one an administrator logs into by hand.
export CLOUDSDK_CONFIG="${CLOUDSDK_CONFIG:-$BACKUP_DIR/.gcloud}"
mkdir -p "$CLOUDSDK_CONFIG"

# Named outright, and activated every time. On a VM, gcloud will happily report
# the machine's own metadata account as active — which is the read-only one, so
# an "is anything logged in?" check passes and the upload then fails at the
# bucket. Asking for this account by name is the only way to be sure of it.
CLOUDSDK_CORE_ACCOUNT="$(python3 -c 'import json,os,sys; print(json.load(open(os.environ["GOOGLE_APPLICATION_CREDENTIALS"]))["client_email"])')"
export CLOUDSDK_CORE_ACCOUNT
gcloud --quiet auth activate-service-account "$CLOUDSDK_CORE_ACCOUNT" \
  --key-file="$GOOGLE_APPLICATION_CREDENTIALS" >/dev/null

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$BACKUP_DIR/churchviewer-$stamp.dump"

mkdir -p "$BACKUP_DIR"

# Custom format: compressed, and `pg_restore` can pull a single table out of it
# without replaying the whole thing — which is the shape of nearly every real
# restore ("that one service got wiped", not "the server is gone").
pg_dump --format=custom --no-owner --no-privileges --file="$dump" "$DATABASE_URL"

# A dump that restores nothing is worse than no dump, because it looks like
# one. Read it back before it counts.
if ! pg_restore --list "$dump" | grep -q "TABLE DATA public churches"; then
  echo "backup: $dump does not contain the churches table — refusing to keep it" >&2
  rm -f "$dump"
  exit 1
fi

size="$(stat -c %s "$dump")"
gcloud --quiet storage cp "$dump" "gs://$GCS_BUCKET/backups/" || {
  echo "backup: took $dump ($size bytes) but could not upload it" >&2
  exit 1
}

echo "backup: gs://$GCS_BUCKET/backups/$(basename "$dump") ($size bytes)"

# Only now, with a copy off the machine, is anything removed.
find "$BACKUP_DIR" -name 'churchviewer-*.dump' -type f -mtime "+$KEEP_LOCAL_DAYS" -delete

# Remote pruning is by the date in the name rather than the object's age: it
# reads the same as the file list, and it can only ever match something this
# script wrote.
cutoff="$(date -u -d "$KEEP_REMOTE_DAYS days ago" +%Y%m%d)"
gcloud storage ls "gs://$GCS_BUCKET/backups/" 2>/dev/null | while read -r object; do
  name="$(basename "$object")"
  [[ "$name" =~ ^churchviewer-([0-9]{8})T[0-9]{6}Z\.dump$ ]] || continue
  [[ "${BASH_REMATCH[1]}" -lt "$cutoff" ]] || continue
  gcloud --quiet storage rm "$object"
  echo "backup: pruned $name"
done
