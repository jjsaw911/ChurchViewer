#!/usr/bin/env bash
#
# Build "ChurchViewer Display.app".
#
#   ./build.sh            debug build, into .build/
#   ./build.sh --release  what you'd actually install on the church's Mac
#
# SwiftPM produces a bare executable; a Mac needs it wrapped in a bundle with an
# Info.plist before it can own a window, appear in the Dock, or be dragged into
# Applications. That wrapping is all this script is.
set -euo pipefail

cd "$(dirname "$0")"

CONFIG=debug
[ "${1:-}" = "--release" ] && CONFIG=release

echo "==> Building ($CONFIG)"
swift build -c "$CONFIG"

BIN="$(swift build -c "$CONFIG" --show-bin-path)"
APP="$BIN/ChurchViewer Display.app"

echo "==> Assembling the bundle"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN/ChurchViewerDisplay" "$APP/Contents/MacOS/ChurchViewer Display"

cat > "$APP/Contents/Info.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>ChurchViewer Display</string>
  <key>CFBundleDisplayName</key><string>ChurchViewer Display</string>
  <key>CFBundleExecutable</key><string>ChurchViewer Display</string>
  <key>CFBundleIdentifier</key><string>com.churchviewer.display</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- It talks to one https server and nothing else; no exceptions needed. -->
  <key>NSPrincipalClass</key><string>NSApplication</string>
</dict>
</plist>
PLIST

# Ad-hoc signature: enough for the machine that built it to run it without
# argument. Distributing it to another Mac wants a Developer ID and notarising.
codesign --force --sign - "$APP" >/dev/null 2>&1 || echo "    (unsigned — fine locally)"

echo "==> Built: $APP"
echo "    open \"$APP\""
