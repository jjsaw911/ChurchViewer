# ChurchViewer

Churches register, upload their recordings, and get their own sermon site at
`theirname.churchviewer.com` — searchable, with a player that remembers where
each listener stopped.

Next.js (App Router) · TypeScript · Tailwind · Postgres (Drizzle) · Google Cloud
Storage. Designed to run on a single Google Compute Engine VM.

## Running it locally

```sh
npm install
cp .env.example .env.local     # then set DATABASE_URL
npm run db:migrate
npm run db:seed                # optional demo church
npm run dev
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
npm test          # unit checks (node:test)
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
| `<church>.churchviewer.com/admin` | Manage messages and series (members only) |

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

**Not built yet:** email verification for password signups (no mail provider is
wired up), password reset, and inviting extra admins to a church. The schema has
`email_verified_at` and a `memberships.role` of `owner`/`editor` ready for them.

## Media

A recording is either a link the church already hosts or a file in our bucket.
Both live in one column as a location string — `https://…` or `gcs:<object-key>`
— so a church can start by pasting links and move to uploads without a migration.

Uploads go **straight from the browser to Cloud Storage** via a signed URL from
`/api/uploads`; the bytes never pass through the VM. Objects stay private and are
served as short-lived signed URLs, which still support range requests, so seeking
and resuming work.

Leave `GCS_BUCKET` unset and the admin UI simply accepts links only.

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
