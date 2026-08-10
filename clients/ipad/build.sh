#!/usr/bin/env bash
#
# Build the remote and put it on a simulator.
#
#   ./build.sh                 build, install on a booted iPad simulator, launch
#   ./build.sh --device        build for a real iPad (needs a signing team)
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
  echo "    plug the iPad in and press Run. Signing needs an Apple account and"
  echo "    can't be done from here."
  open ChurchViewerRemote.xcodeproj
  exit 0
fi

DEVICE_ID=$(xcrun simctl list devices booted -j \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; ids=[x['udid'] for v in d.values() for x in v if 'iPad' in x['name']]; print(ids[0] if ids else '')")

if [ -z "$DEVICE_ID" ]; then
  echo "==> No iPad simulator is running; booting one"
  DEVICE_ID=$(xcrun simctl list devices available -j \
    | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; ids=[x['udid'] for v in d.values() for x in v if 'iPad' in x['name']]; print(ids[0] if ids else '')")
  [ -n "$DEVICE_ID" ] || { echo "No iPad simulators are installed." >&2; exit 1; }
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
