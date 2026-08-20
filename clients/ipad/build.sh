#!/usr/bin/env bash
#
# Build the remote and put it on a simulator.
#
#   ./build.sh                 build, install on a booted simulator, launch
#   ./build.sh --iphone        force an iPhone simulator
#   ./build.sh --ipad          force an iPad simulator
#   ./build.sh --device        build for a real iPhone or iPad (needs a team)
#
# The app is universal. With nothing booted it picks an iPhone, because that's
# the device the person running the service actually has on them every week.
#
# The Xcode project is generated from project.yml rather than committed: a
# .xcodeproj is a large plist that only one person can merge, and this way the
# whole build is a file you can read.
set -euo pipefail

cd "$(dirname "$0")"

SCHEME=ChurchViewerRemote
BUNDLE_ID=com.churchviewer.remote

command -v xcodegen >/dev/null || {
  echo "xcodegen isn't installed. brew install xcodegen" >&2
  exit 1
}

echo "==> Generating the project"
xcodegen generate --quiet

if [ "${1:-}" = "--device" ]; then
  echo "==> Building for a device"
  echo "    Open ChurchViewerRemote.xcodeproj, pick your team under Signing,"
  echo "    plug the iPhone or iPad in and press Run. Signing needs an Apple"
  echo "    account and can't be done from here."
  open ChurchViewerRemote.xcodeproj
  exit 0
fi

# Which family to look for. Empty means "anything already booted".
case "${1:-}" in
  --iphone) WANT=iPhone ;;
  --ipad)   WANT=iPad ;;
  "")       WANT= ;;
  *)        echo "Unknown option: $1" >&2; exit 1 ;;
esac

# Pick a simulator by state and name. $1 is booted|available, $2 the name
# filter ("" matches any).
pick() {
  xcrun simctl list devices "$1" -j | python3 -c "
import json, sys
want = sys.argv[1]
devices = json.load(sys.stdin)['devices']
ids = [d['udid'] for runtime in devices.values() for d in runtime
       if want in d['name'] and d.get('isAvailable', True)]
print(ids[0] if ids else '')
" "$2"
}

DEVICE_ID=$(pick booted "$WANT")

if [ -z "$DEVICE_ID" ]; then
  # Nothing suitable is running. An iPhone is the better default: it's the
  # device that's always in somebody's pocket.
  FAMILY="${WANT:-iPhone}"
  echo "==> No $FAMILY simulator is running; booting one"
  DEVICE_ID=$(pick available "$FAMILY")
  [ -n "$DEVICE_ID" ] || { echo "No $FAMILY simulators are installed." >&2; exit 1; }
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
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" >/dev/null

open -a Simulator
echo "==> Running on $DEVICE_ID"
