# The display — the Mac at the church

Wired to the projector. Its one job is to put the right words on the screen and
to keep doing that when nothing else works.

Not built yet. See [`../README.md`](../README.md) for the architecture this will
be built to.

## What it has to do

- **Fill a chosen display.** The church's Mac has two screens and the projector
  is not the one with the menu bar on it. Which screen is a setting, remembered,
  and re-applied when a projector is unplugged and plugged back in.
- **Hold the service locally.** Slides, images and audio for the plan are
  downloaded before the service starts. Once downloaded, the network is optional.
- **Be the authority while a service runs.** It knows what's on screen. Others
  ask it to change; nobody overwrites it.
- **Serve the remote.** A small WebSocket server on the local network, announced
  over Bonjour, so the iPad reaches it without going out to the internet.
- **Be drivable on its own.** Arrow keys, space, `B` to blank, `F` for
  fullscreen — the same keys as the web presenter. If the iPad's battery dies
  mid-service, somebody walks to the Mac and carries on.
- **Start clean.** Launch at login, open on the right screen, black rather than a
  desktop with somebody's files on it.

## Shape

Swift, SwiftUI, one window per display. Fastest credible first version wraps the
existing web presenter in a `WKWebView` and adds the things a browser can't do —
display selection, offline cache, launch at login, the local server. Writing a
second slide renderer is the thing to avoid; the words on screen should come out
identical to the web one because it *is* the web one.

## Before this can start

Server needs a plan bundle (slides plus signed media URLs, with something to
check for staleness) and device pairing. Both listed in the parent README.
