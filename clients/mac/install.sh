#!/usr/bin/env bash
#
# One line, pasted into Terminal, and the display app is installed.
#
#   curl -fsSL https://<church>.churchviewer.com/downloads/install.sh | bash -s <church>
#
# This exists because of Gatekeeper. macOS refuses to open an app downloaded
# from the internet unless its developer pays Apple a yearly fee, and the way
# that refusal appears — a dialog with one button saying "Done" — reads exactly
# like the software being broken. A volunteer in a church hall does not deserve
# to spend twenty minutes on that.
#
# Nothing here is a trick: the file is downloaded from the church's own site
# over https, unzipped, and the same installer that ships inside the zip is run.
# The one thing this adds is that a file executed by name is not put through the
# check that a file opened by double-click is — which is Apple's rule, not a way
# round it. The app is still exactly what was downloaded.
set -euo pipefail

CHURCH="${1:-}"
HOST="${CV_HOST:-churchviewer.com}"
ZIP_URL="${CV_ZIP:-https://$HOST/downloads/ChurchViewer-Display.zip}"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }

say "Fetching the display app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

curl -fsSL "$ZIP_URL" -o "$WORK/display.zip" || {
  echo "Couldn't download it. Is this machine online?" >&2
  exit 1
}

say "Unpacking"
ditto -x -k "$WORK/display.zip" "$WORK/unpacked"

INSTALLER="$(find "$WORK/unpacked" -name install.command -maxdepth 3 | head -1)"
[ -n "$INSTALLER" ] || { echo "That download didn't contain an installer." >&2; exit 1; }

say "Installing"
if [ -n "$CHURCH" ]; then
  # The church is already known from the page this line was copied off, so
  # nothing needs asking — it goes straight in, filling the projector and
  # opening at startup, which is what a church machine wants every time.
  bash "$INSTALLER" --quiet --church "$CHURCH" --fullscreen --login
else
  bash "$INSTALLER"
fi

say "Done — ChurchViewer Display is in your Applications folder."
echo "Open it, sign in once, then press Command-comma to choose which screen is the projector."
