# TestFlight

What App Store Connect asks for, written out so it can be pasted rather than
composed at the last minute. Update *What to Test* per build; the rest stays.

---

## Beta App Description

> ChurchViewer Remote is the handset for a church service. The words go on the
> projector from a computer at the back of the room; this is what the person
> running the service holds.
>
> It shows the morning as a list of boxes — the welcome, each song, the message
> — with a small picture of exactly what the screen will show. Tap a box and it
> asks before it goes up, because a service is live and there is no undo. Next
> walks the slides. On a song, one press starts the recording on the church's
> computer and the words follow the music on their own.
>
> The buttons are along the bottom, all the same size, reachable one-handed
> without looking, because this gets used in a dark room by somebody who is also
> watching a band. The screen doesn't sleep while it's open.
>
> You need an account at a church that uses ChurchViewer. Everything is private
> to that church.

## What to Test

> The whole run of a service, in the order it happens.
>
> 1. First run asks for your church's name — just the name, like `citychurch`,
>    not a web address. Then sign in once.
> 2. You land on today's service. Check the times and the songs look right.
> 3. Tap a box. It should ask before anything happens, and forget the question
>    if you leave it a while.
> 4. Confirm it. Then use **Next** and **Back** along the bottom to walk the
>    slides, and at the end of one item Next should move into the next one.
> 5. **Play** on a song. **Blank** hides the screen; the symbol fills in while
>    it's blanked, and Play becomes Pause while a recording is running.
> 6. **Run through it** at the top walks the entire service in a preview window
>    without any of it reaching the projector.
> 7. Put the app in the background for a minute and come back — it should
>    re-sync rather than showing what was true when you put it down.
>
> Worth telling us about: anything that looked like it worked but didn't, and
> anything you had to think about twice.

## Feedback email

> joseph.sawyer@outlook.com

## Beta App Review Information

**Sign-in required: yes.** Apple's reviewer cannot get past the first screen
without an account, and a beta is rejected for exactly that. Give them the demo
church and account, and these notes:

> This app is a remote control. It drives a display that runs on a separate
> computer at the church — usually a Mac wired to a projector — so during review
> there will be no display connected. That is expected and the app says so: a
> red dot and a line reading "No screen is connected".
>
> Everything else works without one. The service, its songs and its slides all
> appear, the preview shows exactly what the projector would show, and
> "Run through it" walks the whole service without needing any second machine.
>
> To sign in: church name `demo`, then the account below.

---

## Before submitting

Two things App Store Connect will stop you on, and both are ours to provide:

- **A demo account**, as above. Without one the beta is rejected on the first
  screen.
- **A privacy policy URL.** Required for the app record even in TestFlight.

## Encryption

Answered in `EXPORT-COMPLIANCE.md`. The short version: *None of the algorithms
mentioned above* — the app's only encryption is the HTTPS that iOS provides.
