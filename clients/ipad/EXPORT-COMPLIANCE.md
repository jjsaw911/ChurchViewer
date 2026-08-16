# Encryption and export compliance

Apple asks, at every upload, whether the app uses encryption. This is the
answer, written down once so nobody has to work it out again at eleven at night
with a build waiting.

## What the app actually does

The remote is a `WKWebView` pointed at `https://<church>.churchviewer.com`. That
is the whole of it. Specifically:

- **It uses HTTPS**, which is encryption — TLS, provided by iOS.
- **It implements no encryption of its own.** There is no cryptography in the
  source: no key handling, no hashing, no signing, no encrypted storage. The
  church's name sits in `UserDefaults` in plain text, and the session cookie is
  held by `WKWebView` in the app's own data store, where iOS looks after it.
- **It does not encrypt anything at rest** beyond whatever the operating system
  does with every app's container.

Sign-in, passwords and everything else happen inside the web page, over that
HTTPS connection. Nothing about them is the app's doing.

## The answer

`ITSAppUsesNonExemptEncryption` is set to `false` in `Info.plist`, which is what
tells App Store Connect the app uses no encryption beyond the exempt kind and
stops it asking on each build.

That key is set because the app's encryption is limited to what iOS provides for
an ordinary HTTPS connection, which is exempt under Category 5 Part 2 of the US
Export Administration Regulations — the same exemption that covers every app
that talks to a server and does nothing clever.

## If App Store Connect asks anyway

An older build, or a change to the questionnaire, and it will ask. The answers
that match the plist:

1. **Does your app use encryption?** — Yes. It makes HTTPS connections.
2. **Does it qualify for any of the exemptions?** — Yes.
3. **Which one** — the one about encryption that is *limited to what is
   available within the operating system*, sometimes worded as only using
   encryption provided by iOS or macOS. Not the "proprietary algorithms" one,
   and not the "specially designed for military use" one.
4. **Does your app implement proprietary or non-standard encryption?** — No.
5. **France declaration**, if offered — nothing here changes it; the app carries
   no encryption of its own to declare.

## When this stops being true

Change the answer, and this file, if the app ever:

- encrypts or decrypts anything itself, including "just" hashing a password
  before sending it;
- stores church data in a file it encrypts;
- ships a copy of a crypto library rather than calling the system's.

None of those are true today, and none of them need to be — the server does that
work, and the app is a window onto it.

*This is a declaration you are making about your own software. It's written from
what the source does, which is little enough to check in ten minutes: search the
`Sources` folder for anything cryptographic and you will find nothing.*
