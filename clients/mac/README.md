# The display — the Mac at the church

Wired to the projector. Its one job is to put the right words on the screen and
to keep doing that when nothing else works.

**A first version exists.** SwiftUI, one window, no Xcode project.

## Installing it

On this Mac, or any Mac with Xcode:

```sh
./install.command
```

It asks its questions in ordinary Mac dialogs — the address of the output
screen, whether to fill the projector at launch, whether to open at startup —
builds if it has to, installs to `/Applications`, and offers to open it.

In Settings, typing the church's name is the whole setup: both windows are
pointed at `<church>.churchviewer.com/present/today/…`, which is whichever
service the church is on. Nobody has to come back and change it next week.

**For the Mac at the church, which almost certainly has no developer tools:**

```sh
./package.sh
```

That makes `ChurchViewer-Display.zip` — the built app, the installer, and a
short note. AirDrop it over, unzip, double-click `install.command`. No Xcode, no
source, no terminal on that machine.

Scripted, for anyone who prefers it:

```sh
./install.command --quiet --url "https://…/screen" --fullscreen --login
```

## Using it

Everything is in the menu bar icon (the little TV, top right of your Mac) — it
stays reachable even when the window is filling a projector. Settings opens as
its own window on your screen, never on the projector, and holds the church
name, the two addresses, the screen picker, "fill at launch", "open at startup", and buttons to fill the
projector or reload. Moving the mouse over the display window also shows a
Settings button; it fades when you stop.

⌘⇧F fills the chosen screen, ⌘⎋ leaves full screen, ⌘R reloads.

## How it follows the operator

The app shows the same output screen the browser does, and both are told what to
show by the server's live channel (`/api/live/<serviceId>/stream`, server-sent
events). So the operator drives from the run sheet on their own laptop and the
Mac follows across the room, with no pairing and nothing to configure.

It's a `WKWebView` around the web presenter rather than a slide renderer written
a second time in Swift. Two renderers drift, and the day they disagree is the
Sunday when the screen at the back of the room shows something the operator's
screen doesn't.

## What it does today

- Fills a **chosen** screen, not whichever one the window landed on — the church
  Mac has two and the projector isn't the one with the menu bar.
- Signs in once and stays signed in.
- Retries a failed load on its own, backing off to every 30 seconds, so a
  dropped wifi comes back without anybody walking to the Mac.
- Never starts audio or video by itself.

## What it still needs

- **Offline.** It streams from the server; it doesn't yet cache a service and run
  from disk. This is the big one, and the reason the parent README exists.
- **Local control.** No arrow keys of its own yet: control comes from the run
  sheet elsewhere. If that machine dies mid-service there's nothing at the Mac
  to drive it with.
- A Developer ID signature, so it opens on a Mac that didn't build it without
  a right-click.
- The local WebSocket server the iPad will eventually talk to.

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
