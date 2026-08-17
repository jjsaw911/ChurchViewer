# The two clients

Three programs, three jobs:

| | Runs on | Job |
|---|---|---|
| **The web app** | Anywhere, any browser | Planning: the running order, songs, slides, media |
| **The display** (`clients/mac`) | The Mac at the church, wired to the projector | Puts words on the screen. Holds everything it needs locally |
| **The remote** (`clients/ipad`) | An iPad in somebody's hand | Drives the display: next, back, blank, jump to a song |

Nothing is built in these folders yet. This is the design they'll be built to,
written down while it's cheap to change.

## The rule that decides the architecture

**A service cannot depend on the internet.** Wifi in a church hall drops, and
when it does, the screen behind the band must keep working. That single
constraint settles most of the design:

- The Mac downloads everything it needs **before** the service — slides, images,
  audio — and runs from its own disk.
- The iPad talks to the Mac **directly over the local network**, not out to the
  server and back. When they're on the same wifi, nothing needs to leave the
  room.
- The server is for planning, sync, and reaching the Mac when the iPad isn't on
  the same network. It is never in the path of a slide change if it doesn't have
  to be.

The display, not the server, is the authority during a service. If everything
else disappears mid-song, the Mac still knows what's on screen and the operator
can still drive it from the Mac's own keyboard.

## How they talk

`src/lib/live/protocol.ts` is the contract, and it's versioned. Both clients
will speak it; only the transport differs:

- **iPad → Mac, same network:** a WebSocket the Mac serves, found over Bonjour
  (`_churchviewer._tcp`). No round trip out of the building.
- **iPad → Mac, different networks:** the same messages relayed by the server.
- **Server → both:** "the plan changed, refetch it".

Messages from a controller are *intent* — "step forward one" rather than "go to
slide 7". Two people holding two iPads pressing next at the same moment should
advance one slide, and a message carrying a slide number can't express that.

## Pairing and identity

Neither client can use a browser session cookie, so devices get their own
identity:

1. The Mac shows a short pairing code.
2. Somebody types it into the iPad.
3. The server hands each a long-lived **device token** scoped to one church, and
   tells them about each other.

Device tokens are revocable from the platform console, per device. A stolen iPad
should cost somebody one revocation, not a password change.

## What has to be built on the server first

The web app moves live state through `localStorage`, which is why it only works
between windows of **one browser on one machine**. That's fine for a laptop
driving a projector, and it is not enough for an iPad controlling a Mac. Before
either client can exist:

1. **Server-held live state per service**, with a realtime channel out (SSE is
   enough for the display; a WebSocket if the relay needs to be two-way).
2. **Device pairing and tokens**, as above.
3. **A plan bundle**: one request that returns a service, its slides, and signed
   URLs for its media, so the Mac can cache the lot and check later whether
   anything changed.

Those three are useful on their own, before any native code exists — they'd let
a second machine on the network follow along today.

## What to build, in what order

1. **Nothing.** Chrome on the Mac, fullscreen on the projector, run sheet on the
   iPad's browser. Needs item 1 above and no native code at all. Start here and
   find out what actually hurts.
2. **The display app** when the pain is offline media, choosing which monitor to
   fill, launching itself on boot, or surviving a dropped connection.
3. **The remote app** when the pain is the browser's reconnect behaviour, a
   touch target too small to hit in a dark room, or the screen sleeping mid-song.

A native shell that wraps the existing web presenter (WKWebView plus display
management and a cache) gets most of the way for a fraction of the work of a
from-scratch renderer. Worth exhausting before writing a slide renderer twice.
