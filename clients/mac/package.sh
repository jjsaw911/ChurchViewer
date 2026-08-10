#!/usr/bin/env bash
#
# Make the thing you carry to the church.
#
#   ./package.sh
#
# Produces ChurchViewer-Display.zip: the built app and the installer, and
# nothing else. AirDrop it to the Mac at the church, unzip, double-click
# install.command. That machine needs no developer tools, no source, and no
# terminal — which matters, because it usually has none of them.
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="ChurchViewer Display"
STAGE=".build/package/ChurchViewer Display"
ZIP="ChurchViewer-Display.zip"

echo "==> Building a release"
./build.sh --release >/dev/null

BUILT=".build/arm64-apple-macosx/release/$APP_NAME.app"
[ -d "$BUILT" ] || { echo "The build produced no app." >&2; exit 1; }

echo "==> Staging"
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"
cp -R "$BUILT" "$STAGE/"
cp install.command "$STAGE/"
chmod +x "$STAGE/install.command"

cat > "$STAGE/READ ME FIRST.txt" << 'TXT'
ChurchViewer Display
====================

1. Double-click "install.command".
2. Paste the address of the output screen when it asks. (In a browser: open the
   service plan, press Run it, then Open the output screen, and copy that
   window's address.)
3. Say yes to filling the projector, and yes to opening at startup.
4. When the app opens, sign in once, then press Command-comma and choose which
   screen the projector is.

If macOS says the installer is from an unidentified developer: right-click it,
choose Open, and confirm. That only happens the first time.
TXT

echo "==> Zipping"
# ditto rather than zip: it keeps the bundle's structure and its signature
# intact, which the plain zip tool does not.
ditto -c -k --sequesterRsrc --keepParent "$STAGE" "$ZIP"

rm -rf ".build/package"
echo "==> Built: $(pwd)/$ZIP"
