#!/usr/bin/env bash
#
# Build the remote and put it on a simulator, or open it ready for a device.
#
#   ./build.sh                          simulator: build, install, launch
#   ./build.sh --device                 open Xcode ready to run on your iPhone
#   ./build.sh --device --team ABCDE12345 --bundle com.yourname.remote
#
# Your signing team is remembered in Local.xcconfig after the first time, so
# --team is only needed once. That file is deliberately not in git: it names
# your Apple developer account and nobody else's build should carry it.
#
# The Xcode project is generated from project.yml rather than committed — a
# .xcodeproj is a large plist that only one person can merge, and this way the
# whole build is a file you can read.
set -euo pipefail

cd "$(dirname "$0")"

SCHEME=ChurchViewerRemote
BUNDLE_ID_DEFAULT=com.churchviewer.remote
CONFIG=Local.xcconfig

DEVICE=""
TEAM=""
BUNDLE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --device) DEVICE=1; shift ;;
    --team) TEAM="${2:-}"; shift 2 ;;
    --bundle) BUNDLE="${2:-}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

command -v xcodegen >/dev/null || {
  echo "xcodegen isn't installed. brew install xcodegen" >&2
  exit 1
}

# --- signing -----------------------------------------------------------------

# Keep whatever was set last time unless this run overrides it.
[ -z "$TEAM" ] && [ -f "$CONFIG" ] && TEAM=$(sed -n 's/^CV_TEAM *= *//p' "$CONFIG" | tr -d ' ')
[ -z "$BUNDLE" ] && [ -f "$CONFIG" ] && BUNDLE=$(sed -n 's/^CV_BUNDLE_ID *= *//p' "$CONFIG" | tr -d ' ')
[ -z "$BUNDLE" ] && BUNDLE="$BUNDLE_ID_DEFAULT"

cat > "$CONFIG" << CFG
// Written by build.sh. Not in git — it names one developer's account.
CV_TEAM = $TEAM
CV_BUNDLE_ID = $BUNDLE
CFG

echo "==> Generating the project"
xcodegen generate --quiet

if [ -z "$DEVICE" ]; then
  DEVICE_ID=$(xcrun simctl list devices booted -j \
    | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; ids=[x['udid'] for v in d.values() for x in v if 'iPad' in x['name'] or 'iPhone' in x['name']]; print(ids[0] if ids else '')")

  if [ -z "$DEVICE_ID" ]; then
    echo "==> No simulator running; booting one"
    DEVICE_ID=$(xcrun simctl list devices available -j \
      | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; ids=[x['udid'] for v in d.values() for x in v if 'iPad' in x['name']]; print(ids[0] if ids else '')")
    [ -n "$DEVICE_ID" ] || { echo "No simulators are installed." >&2; exit 1; }
    xcrun simctl boot "$DEVICE_ID"
  fi

  echo "==> Building"
  xcodebuild -project ChurchViewerRemote.xcodeproj \
    -scheme "$SCHEME" \
    -configuration Debug \
    -destination "id=$DEVICE_ID" \
    -derivedDataPath .build \
    build | tail -3

  APP=".build/Build/Products/Debug-iphonesimulator/$SCHEME.app"
  [ -d "$APP" ] || { echo "The build produced no app." >&2; exit 1; }

  echo "==> Installing"
  xcrun simctl install "$DEVICE_ID" "$APP"
  xcrun simctl launch "$DEVICE_ID" "$BUNDLE" >/dev/null

  open -a Simulator
  echo "==> Running on $DEVICE_ID"
  exit 0
fi

# --- device ------------------------------------------------------------------

echo
if [ -z "$TEAM" ]; then
  cat << 'HELP'
==> No signing team set yet.

Find yours: Xcode → Settings → Accounts → pick your Apple ID → the team is
listed with a ten-character ID beside it. A free Apple ID works; its team is
called "(Personal Team)".

Then run:

  ./build.sh --device --team ABCDE12345

If Xcode says the bundle identifier is unavailable, add --bundle with something
of your own, like com.yourname.churchviewer.remote — that string has to be
unique across everyone using Apple's developer program.

HELP
else
  echo "==> Signing as team $TEAM, bundle $BUNDLE"
  echo "    Plug the iPhone in, unlock it, pick it in the toolbar, press Run."
  echo "    First launch: on the phone, Settings → General → VPN & Device"
  echo "    Management → trust your certificate."
  echo
fi

open ChurchViewerRemote.xcodeproj
