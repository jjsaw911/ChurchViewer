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

This is for the computer wired to the projector. It shows the words; the
service is driven from a phone, an iPad or another computer.

1. Open Terminal (press Command-Space, type "terminal", press Enter), type
   the word bash and a space, then drag "install.command" into the Terminal
   window and press Enter.

   Double-clicking will refuse, and that is not a fault. macOS only opens
   downloaded software from developers who pay Apple a yearly fee, and this
   doesn't — so it has to be run by name. Once installed, the app itself opens
   normally every time.

2. Type your church's name when it asks. If your church is at
   citychurch.churchviewer.com, that's "citychurch".

3. Say yes to filling the projector and yes to opening at startup.

4. When it opens, sign in once with your ChurchViewer account. It stays
   signed in.

5. Press Command-comma and pick which screen is the projector.

Then it looks after itself: every Sunday it shows whatever service that church
has planned for the day, without anybody changing a setting.

Command-Shift-F fills the chosen screen. Command-Escape leaves full screen.
Command-R reloads. The little TV icon in the menu bar has everything else,
including a pause for the music.
TXT

echo "==> Zipping"
# ditto rather than zip: it keeps the bundle's structure and its signature
# intact, which the plain zip tool does not.
ditto -c -k --sequesterRsrc --keepParent "$STAGE" "$ZIP"

rm -rf ".build/package"
echo "==> Built: $(pwd)/$ZIP"
