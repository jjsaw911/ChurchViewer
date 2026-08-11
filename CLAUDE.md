@AGENTS.md

# ChurchViewer notes

Read `README.md` before making broad changes. It explains the product model,
local setup, deployment assumptions, and several invariants that are easy to
break if you treat this like a standard single-site CRUD app.

## What this app is

- ChurchViewer is a multi-tenant Next.js App Router app where the apex host is
  marketing/auth and each church lives on its own subdomain.
- `<church>.<root-domain>` requests are rewritten to `/s/[tenant]/*` by
  `src/proxy.ts`. Preserve that mental model when adding routes, redirects, URL
  generation, or auth checks.
- Local development should be tested on `lvh.me`, not plain `localhost`,
  because the session cookie must work across subdomains.

## Guardrails

- Do not treat this as a generic localhost-only app. Use `rootUrl()` and
  `tenantUrl()` for absolute in-product URLs instead of hardcoding hosts.
- Keep `src/lib/tenant.ts` pure and database-free. It is used by the proxy and
  shared helpers, so it must stay safe for edge-style usage.
- Preserve the distinction between platform-wide admin access and per-church
  membership access.
- Preserve the location-string media model: stored media is either an external
  `https://...` URL or a `gcs:<object-key>` reference.

## Auth and access

- Every admin page, server action, and mutating path must enforce access on the
  server. Rendering a form is not proof that the submitter is allowed to act.
- Church-scoped admin work should go through `requireChurchAccess(tenant)` or an
  equivalent server-side check.
- Platform-wide admin work should go through `requirePlatformAdmin()`.
- Route handlers that create or clear sessions must set cookies on the returned
  `NextResponse` when they construct one directly. Do not assume writes through
  `cookies()` survive a custom response.
- Be careful with redirects: this app uses the marketing host for shared login,
  reset, and password-change flows, and tenant hosts for church-specific admin.

## Worker and AI flows

- Song transcription is asynchronous by design. Web requests enqueue work; the
  worker performs extraction/transcription later.
- Do not convert queued transcription or extraction into a synchronous request
  flow just because it looks simpler.
- The worker can run without an OpenAI key and still extract audio or derive
  useful metadata. Preserve that partial-success behavior.
- Slide timing depends on word-level transcription timestamps. Be cautious about
  changing models, response formats, or fallback logic in `src/lib/ai/openai.ts`
  and the song slide pipeline.
- The tidy pass may improve formatting, but it must never invent lyrics or
  silently change slide counts.

## Next.js notes

- This repo uses Next.js 16. Read the relevant guide in `node_modules/next/dist/docs/`
  before making framework-level changes if behavior seems unfamiliar.
- Prefer existing patterns in `src/app`, server actions, and route handlers over
  inventing older Next.js conventions from memory.

## Verification

- Run `npm test` and `npm run lint` after meaningful code changes.
- Run `npm run test:db` when touching queue claiming, worker behavior, or other
  database-backed transcription flow logic.
- If you change auth, tenant routing, redirects, cookies, uploads, or playback
  URLs, verify the behavior with the host model in mind, ideally using
  `lvh.me`/subdomains rather than a single-host assumption.

## Known product gaps

- README may mention older gaps; verify against the code before repeating them.
- As of this snapshot, password reset code exists in the repo even if some docs
  still describe it as not fully built.
