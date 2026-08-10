# The remote — the iPad

Held by whoever is running the service. It drives the Mac; it never puts
anything on the projector itself.

Not built yet. See [`../README.md`](../README.md) for the architecture this will
be built to.

## What it has to do

- **Find the display.** Bonjour on the local network, with a paired Mac
  remembered so the second Sunday needs no setup at all.
- **Show the running order and the slides**, the same two panes as the web run
  sheet: what's coming, and the slides of whatever is happening now.
- **Big targets.** This gets used one-handed, in a dark room, by someone also
  watching a band. Next and back want to be thumb-sized, not pointer-sized.
- **Never sleep mid-service.** Idle timer off while a service is running.
- **Say when it isn't connected.** An operator pressing next and seeing nothing
  happen needs to know within a second whether the problem is the network, and
  needs the Mac's own keys to still work while they sort it out.
- **Reconnect without being asked.** Wifi drops, the iPad wakes from sleep — the
  right behaviour is to reconnect and resynchronise silently, not to show a
  dialog somebody has to dismiss with one hand.

## Shape

Swift, SwiftUI. Speaks `src/lib/live/protocol.ts` over a WebSocket to the Mac,
falling back to the server relay when they aren't on the same network. Sends
intent — "step forward" — never a slide number.

## Before this can start

The display has to exist and serve its local socket, or the relay has to. The
web run sheet in Safari covers this job in the meantime and is worth living with
first, to find out what actually needs improving.
