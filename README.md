# ChurchViewer

Churches register, upload their recordings, and get their own sermon site at
`theirname.churchviewer.com` — searchable, with a player that remembers where
each listener stopped.

Next.js (App Router) · TypeScript · Tailwind · Postgres (Drizzle) · Google Cloud
Storage. Designed to run on a single Google Compute Engine VM.

## Running it locally

Postgres has to be running; everything else the setup script handles.

```sh
npm install
npm run setup -- --admin you@example.com
npm run db:seed      # optional: a demo church with a few recordings
npm run dev
```

`setup` writes `.env.local`, creates the database if it isn't there, and applies
migrations. Run it again any time you're unsure what state a checkout is in —
every step checks before it acts.

To use the platform console over every church, give that address a login:

```sh
npm run admin:create -- you@example.com
```

It prompts for a password (10 characters minimum) and refuses any address not in
`PLATFORM_ADMIN_EMAILS`, so the login and the grant can't drift apart. Sign in at
`http://lvh.me:3000/login`; the console is at `http://lvh.me:3000/admin`.

On a Mac without Postgres:

```sh
brew install postgresql@16 && brew services start postgresql@16
```

The worker needs **ffmpeg** on the PATH to pull audio out of a video a church has
uploaded. Without it everything else still works; that one step fails with a
message saying so.

```sh
brew install ffmpeg
```

Open **http://lvh.me:3000** — not `localhost`. `lvh.me` and every subdomain
resolve to 127.0.0.1 through public DNS, which is what makes
`grace.lvh.me:3000` work. Plain `localhost` will *not* do: browsers never send a
`localhost` cookie to `sub.localhost`, so you'd be signed out the moment you
left the apex.

The seed creates **Grace Chapel** at `grace.lvh.me:3000`, owned by
`demo@churchviewer.com` / `sunday-morning`.

```sh
npm run build && npm run start
npm run worker    # transcription worker — see below
npm test          # unit checks (node:test)
npm run test:db   # queue integration checks (needs DATABASE_URL)
npm run lint
```

## How it fits together

| URL | What it is |
| --- | --- |
| `churchviewer.com` | Marketing site, registration, login |
| `churchviewer.com/register` | Creates the account *and* the church in one step |
| `<church>.churchviewer.com` | That church's public library |
| `<church>.churchviewer.com/sermons/<slug>` | The player |
| `<church>.churchviewer.com/series` | Series index |
| `<church>.churchviewer.com/admin` | Manage messages, songs and services (members only) |
| `<church>.churchviewer.com/admin/songs` | Worship songs and their timed slides |
| `<church>.churchviewer.com/admin/services` | Plan a service against the clock |
| `<church>.churchviewer.com/present/songs/<slug>` | Full-screen slides that follow the recording |
| `<church>.churchviewer.com/present/services/<slug>` | The run sheet for the day |

`src/proxy.ts` reads the `Host` header and rewrites `<church>.churchviewer.com/x`
onto the `/s/<church>/x` route tree. Links inside a church site are written as
ordinary paths (`/sermons/…`), so they stay on that church's host.

### Layout

```
src/
  proxy.ts              subdomain -> /s/[tenant] rewrite
  app/
    (marketing)/        apex: landing, register, login
    s/[tenant]/         one church's public site
    s/[tenant]/admin/   its management screens
    api/auth/…          Google OAuth start + callback, logout
    api/uploads         signs a direct-to-bucket upload URL
  db/
    schema.ts           churches, users, memberships, sessions, series, sermons
    migrate.ts seed.ts
  lib/
    tenant.ts           pure helpers (slugify, host parsing) — no database
    youtube.ts          video-id parsing for every link shape
    ai/openai.ts        transcription + the optional tidy pass
    songs/slides.ts     timed words -> slides (pure, and unit tested)
    services/timeline.ts running order -> clock times (pure, and unit tested)
    churches.ts         tenant lookups
    content.ts          every read a church site performs
    auth/               password hashing, sessions, Google, account linking
    admin/              access guard + the write actions
    storage.ts          GCS signed URLs
```

`lib/tenant.ts` is kept free of database imports on purpose — the proxy runs on
the edge runtime and client components import `slugify`, and neither can pull in
`pg`.

## Accounts and access

Churches sign in with **Google or an email and password** — both land on the same
account when the email matches and Google says it's verified.

- Passwords are hashed with Node's own scrypt (no native build to break on a VM).
- Sessions are random 32-byte tokens in an HttpOnly cookie; only a SHA-256 of the
  token is stored, so a database leak doesn't hand anyone a live session.
- The cookie is set on `.churchviewer.com`, so one login covers every subdomain.
- Google uses the authorization-code flow with PKCE and a state cookie. The ID
  token's `iss`, `aud`, and `exp` are checked; its signature isn't, because the
  token came straight from Google's token endpoint over TLS authenticated with
  our client secret (OIDC Core §3.1.3.7).

Every `/admin` page and every write action calls `requireChurchAccess()`. Server
actions are public endpoints — the form that rendered them proves nothing about
who is posting.

Adding people to a church and resetting their passwords both work from
`/admin/people`. Because no mail provider is wired up, neither is sent by email:
the admin gets a one-time link to read out or hand over. Completing a reset
revokes every existing session for that account.

**Not built yet:** email verification for password signups, and self-service
"forgot my password" — both wait on a mail provider. The schema has
`email_verified_at` ready for the first.

## Media

A recording is either a link the church already hosts or a file in our bucket.
Both live in one column as a location string — `https://…` or `gcs:<object-key>`
— so a church can start by pasting links and move to uploads without a migration.

Uploads go **straight from the browser to Cloud Storage** via a signed URL from
`/api/uploads`; the bytes never pass through the VM. Objects stay private and are
served as short-lived signed URLs, which still support range requests, so seeking
and resuming work.

Leave `GCS_BUCKET` unset and the admin UI simply accepts links only.

## Worship slides

Paste a YouTube link and the song plays from it; add an audio file and OpenAI
transcribes it into **slides timed to the recording**, so the words change
themselves as the song plays.

How the timing works: `whisper-1` is asked for word-level timestamps, and
`src/lib/songs/slides.ts` turns those into slides. Line breaks follow the
singer's breath — a pause of about half a second ends a line, and a longer one
starts a new slide, which is what keeps a chorus from beginning on the tail of a
verse. Character count is only the fallback for one long unbroken phrase. An
optional second pass tidies capitalisation and labels sections; it is explicitly
told to reshape the transcript and never to add words of its own, and its reply
is discarded if the slide count doesn't match.

Nothing about this is trusted blindly. The editor at `/admin/songs/<slug>` plays
the song beside the slides, highlights whichever is live, and lets you retype any
line, drag a cue with **Set to now** while it plays, or shift everything at once
with the nudge field. The presenter follows the recording and still takes arrow
keys — stepping by hand seeks the audio too, so the screen and the band stay
together.

### The transcription worker

Transcribing takes tens of seconds for a song and minutes for a sermon, so the
web request only ever puts the job in a queue. **`npm run worker` does the actual
work** — without it, songs sit at "Queued" for ever. The editor polls and fills
itself in when the worker finishes, so nobody has to sit on the page.

Jobs are claimed with `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`,
which is what lets several workers share one queue without a lock server: each
grabs a different row rather than queueing behind the same one. A worker killed
mid-job leaves its row claimed, so the same statement also reclaims anything held
longer than 15 minutes. Failures retry up to three times and then stop with the
reason on the song. `npm run test:db` checks all of that against a real database.

On the VM, run it as its own unit so it restarts with the machine:

```ini
# /etc/systemd/system/churchviewer-worker.service
[Unit]
Description=ChurchViewer transcription worker
After=network.target

[Service]
WorkingDirectory=/srv/churchviewer
ExecStart=/usr/bin/npm run worker
Restart=always
RestartSec=5
EnvironmentFile=/srv/churchviewer/.env.local

[Install]
WantedBy=multi-user.target
```

It shuts down cleanly: on `SIGTERM` it finishes the job in hand before exiting,
so a deploy never strands one half-done.

### Before you use it

- **Downloading audio from YouTube breaks YouTube's Terms of Service.** The
  YouTube link here is for playback and timing. Transcription reads an audio file
  you supply and hold the rights to.
- **Showing lyrics needs a licence** — CCLI or equivalent. There's a CCLI number
  field on each song for your own reporting.
- OpenAI's transcription endpoint accepts files up to 25MB; larger uploads are
  rejected with a message rather than a stack trace.

## Planning a service

`/admin/services` builds a run sheet for a date: an ordered list of items, each
with a kind, an owner and a duration. Times are computed from the service start,
so changing one duration moves everything after it and the finish time updates
with it. A song item links straight to its slides, which is the point — the
person running Sunday opens the run sheet and everything they need is one tap
away.

## Deploying to the VM

Not automated yet — this is the shape it assumes.

1. **DNS** — an `A` record for `churchviewer.com` and a **wildcard** `*.churchviewer.com`,
   both pointing at the VM's static IP. The wildcard is what gives every new
   church a working address the moment it registers.
2. **TLS** — a wildcard certificate (`churchviewer.com` + `*.churchviewer.com`).
   Let's Encrypt issues wildcards only over the DNS-01 challenge, so certbot needs
   the Cloud DNS plugin, not the usual webroot method.
3. **Postgres** — Cloud SQL, or a local cluster on the VM. Set `DATABASE_URL` and
   run `npm run db:migrate` on deploy.
4. **App** — `npm ci && npm run build && npm run start` behind nginx, kept alive by
   a systemd unit. nginx must pass the original `Host` through
   (`proxy_set_header Host $host`) — the whole tenant routing reads it.
5. **Bucket** — one bucket, uniform access, not public. The VM's service account
   needs `roles/storage.objectAdmin` on it plus the ability to sign
   (`iam.serviceAccountTokenCreator` on itself) for signed URLs.
6. **Config** — set `NEXT_PUBLIC_ROOT_DOMAIN=churchviewer.com` before building;
   it's inlined at build time.

## Known gaps

- `@google-cloud/storage` pulls in transitive advisories (`npm audit` reports 9
  moderate, all under `teeny-request`). Worth a look before launch.
- Signed playback URLs are generated per sermon on render; a very large library
  will want caching or a CDN in front of the bucket.
- No rate limiting on login or registration yet.
- Slides are stored per song, so two churches singing the same song each
  transcribe it themselves.
