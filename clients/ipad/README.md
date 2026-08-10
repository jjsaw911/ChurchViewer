# The remote — the iPad

Held by whoever is running the service. It drives the display; it never puts
anything on the projector itself.

**A first version exists.** SwiftUI, one screen, no committed Xcode project.

## Building it

```sh
brew install xcodegen   # once
./build.sh              # builds, installs on an iPad simulator, launches it
./build.sh --device     # generates the project and opens it for a real iPad
```

The project is generated from `project.yml` rather than committed: an
`.xcodeproj` is a large plist only one person can merge, and this way the whole
build is a file you can read.

Onto a real iPad: `./build.sh --device` opens the project, then pick your team
under Signing & Capabilities and press Run. Signing needs an Apple account, so
it can't be done from a script.

## Using it

First run asks for the run sheet address — the page you drive from, **not** the
output screen the projector shows. From a plan, press **Run it** and copy that
page's address. You sign in once inside the app and it stays signed in.

Along the bottom: **Back**, **Next**, **Blank**, and settings. Next is the
biggest target on purpose — it's pressed ten times as often as Back, this gets
used one-handed in a dark room, and pressing the wrong one mid-verse is the
mistake worth designing against.

The screen won't sleep while the app is open.

## How it works

The page inside is the same run sheet the operator uses in a browser. The native
buttons press that page's own keys — the run sheet already listens for arrows
and `B`, and everything behind them lives there: what "next" means at the end of
a song, how the change reaches the projector, who's allowed to do it. Sending a
key borrows all of it rather than writing a second copy that can disagree with
the first.

From there it's the server's live channel to the display, which is why the iPad
and the Mac need nothing of each other but a network.

## What it still needs

- **The local path.** Today it goes iPad → server → Mac. The design calls for
  iPad → Mac directly over the local network, so a service survives the wifi
  losing the internet. That needs the display to serve its socket first.
- **A connection light.** An operator pressing Next and seeing nothing happen
  needs to know within a second whether the problem is the network.
- **A touch-first layout.** Right now the list is the web page as it renders on
  a tablet. Fine, not tuned: rows could be taller and the slide list could be a
  grid of big tiles.
