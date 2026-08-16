#!/usr/bin/env bash
#
# Install ChurchViewer Display on this Mac.
#
# Double-click it in Finder, or run it from a terminal. It asks its questions in
# ordinary Mac dialogs, because the person setting up the machine wired to the
# projector is not necessarily a person who wants a terminal — and because a
# script that fails silently in a window nobody is looking at is a script that
# fails on a Sunday.
#
#   ./install.command
#   ./install.command --quiet --church citychurch --fullscreen --login
#
# Options (all optional; without them it asks):
#   --church <name>   the church, e.g. citychurch
#   --fullscreen      fill the chosen screen as soon as it opens
#   --login           open automatically when this Mac starts up
#   --prefix <dir>    install somewhere other than /Applications
#   --quiet           never show a dialog; for scripted installs
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="ChurchViewer Display"
BUNDLE_ID="com.churchviewer.display"
PREFIX="/Applications"
CHURCH=""
FULLSCREEN=""
LOGIN=""
QUIET=""

while [ $# -gt 0 ]; do
  case "$1" in
    --church) CHURCH="${2:-}"; shift 2 ;;
    --fullscreen) FULLSCREEN=1; shift ;;
    --login) LOGIN=1; shift ;;
    --prefix) PREFIX="${2:-}"; shift 2 ;;
    --quiet) QUIET=1; shift ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

# --- talking to the person ---------------------------------------------------

# AppleScript needs its own quotes escaped, and a church name or address may
# well contain one.
escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

dialog() { # title, message, extra AppleScript
  osascript -e "display dialog \"$(escape "$2")\" with title \"$(escape "$1")\" $3" 2>/dev/null
}

fail() {
  echo "error: $1" >&2
  [ -z "$QUIET" ] && dialog "ChurchViewer Display" "$1" 'buttons {"OK"} default button 1 with icon stop' || true
  exit 1
}

ask_text() { # prompt, default -> answer on stdout
  local answer
  answer=$(osascript -e "display dialog \"$(escape "$1")\" with title \"ChurchViewer Display\" default answer \"$(escape "$2")\" buttons {\"Cancel\", \"Continue\"} default button \"Continue\"" 2>/dev/null) || return 1
  printf '%s' "${answer#*text returned:}"
}

ask_yes_no() { # question -> 0 for yes
  osascript -e "display dialog \"$(escape "$1")\" with title \"ChurchViewer Display\" buttons {\"No\", \"Yes\"} default button \"Yes\"" 2>/dev/null | grep -q "Yes$"
}

# --- finding something to install --------------------------------------------

find_built_app() {
  # Next to this script first: that's what a church Mac gets, copied off a USB
  # stick or AirDropped, with no developer tools anywhere on the machine.
  for candidate in \
    "./$APP_NAME.app" \
    "./.build/arm64-apple-macosx/release/$APP_NAME.app" \
    "./.build/release/$APP_NAME.app" \
    "./.build/arm64-apple-macosx/debug/$APP_NAME.app"
  do
    [ -d "$candidate" ] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

APP_SOURCE=""
if APP_SOURCE=$(find_built_app); then
  echo "==> Using the build that's already here: $APP_SOURCE"
elif command -v swift >/dev/null 2>&1 && [ -f Package.swift ]; then
  echo "==> Building from source (this takes a minute)"
  ./build.sh --release >/dev/null || fail "The build failed. Run ./build.sh --release to see why."
  APP_SOURCE=$(find_built_app) || fail "The build finished but produced no app."
else
  fail "There's no built copy here and no Swift compiler to build one.
Run this on a Mac with Xcode, then copy the whole folder — including the built app — to this one."
fi

# --- the questions -----------------------------------------------------------

if [ -z "$QUIET" ]; then
  dialog "ChurchViewer Display" \
    "This installs the display app on this Mac — the one wired to the projector.

All it needs is your church's name: the first part of your address. If your church is at citychurch.churchviewer.com, that's citychurch." \
    'buttons {"Cancel", "Continue"} default button "Continue"' >/dev/null || exit 0

  if [ -z "$CHURCH" ]; then
    # Whatever was copied is usually the address, so take the name out of it.
    CLIPBOARD=$(pbpaste 2>/dev/null | head -1 || true)
    SUGGESTION=$(printf '%s' "$CLIPBOARD" \
      | sed -E 's#^[a-z]+://##; s#/.*$##; s#\.churchviewer\.com$##' \
      | tr '[:upper:]' '[:lower:]')
    case "$SUGGESTION" in
      ""|*[!a-z0-9-]*) SUGGESTION="" ;;
    esac

    CHURCH=$(ask_text "Your church's name:" "$SUGGESTION") || exit 0
  fi

  # Typed in full, or pasted from a browser: take the name out of either.
  CHURCH=$(printf '%s' "$CHURCH" \
    | sed -E 's#^[a-z]+://##; s#/.*$##; s#\.churchviewer\.com$##' \
    | tr '[:upper:]' '[:lower:]')

  case "$CHURCH" in
    ""|*[!a-z0-9-]*) fail "That doesn't look like a church name: $CHURCH" ;;
  esac

  ask_yes_no "Fill the projector as soon as the app opens?" && FULLSCREEN=1 || FULLSCREEN=""
  ask_yes_no "Open it automatically when this Mac starts up?" && LOGIN=1 || LOGIN=""
fi

# --- installing --------------------------------------------------------------

TARGET="$PREFIX/$APP_NAME.app"

echo "==> Installing to $TARGET"
mkdir -p "$PREFIX"
# The app may be running from an earlier install; replacing it under itself is
# what leaves a half-copied bundle.
osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
rm -rf "$TARGET"
cp -R "$APP_SOURCE" "$TARGET" || fail "Couldn't copy the app into $PREFIX. Is it write-protected?"

# A copy that arrived by AirDrop or download is quarantined, and Gatekeeper
# refuses an ad-hoc signature. This is the church's own software, put here
# deliberately by the person standing at the machine.
xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true

echo "==> Settings"
# Both windows, pointed at whichever service the church is on that morning —
# so nobody has to come back and change this next week.
if [ -n "$CHURCH" ]; then
  defaults write "$BUNDLE_ID" projectorURL \
    -string "https://$CHURCH.churchviewer.com/present/today/screen"
  defaults write "$BUNDLE_ID" stageURL \
    -string "https://$CHURCH.churchviewer.com/present/today/stage"
fi
defaults write "$BUNDLE_ID" fullScreenOnLaunch -bool "$([ -n "$FULLSCREEN" ] && echo true || echo false)"

AGENT="$HOME/Library/LaunchAgents/$BUNDLE_ID.plist"
if [ -n "$LOGIN" ]; then
  echo "==> Opening at login"
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$AGENT" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$BUNDLE_ID</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    <string>$TARGET</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLIST
  launchctl unload "$AGENT" 2>/dev/null || true
  launchctl load "$AGENT" 2>/dev/null || true
elif [ -f "$AGENT" ]; then
  launchctl unload "$AGENT" 2>/dev/null || true
  rm -f "$AGENT"
fi

echo "==> Installed: $TARGET"

if [ -z "$QUIET" ]; then
  if dialog "ChurchViewer Display" \
      "Installed.

One thing left, inside the app: press ⌘, and choose which screen the projector is. The list there is the real one, which is why it isn't asked for here.

Open it now?" \
      'buttons {"Later", "Open it"} default button "Open it"' | grep -q "Open it$"; then
    open "$TARGET"
  fi
fi
