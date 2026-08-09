# ChurchViewer

A media library for recorded services — browse messages by series, speaker, or
passage, and watch or listen to them in the browser.

Built with Next.js (App Router), TypeScript, and Tailwind CSS.

## Running it

```sh
npm install
npm run dev          # http://localhost:3000
```

```sh
npm run build && npm run start   # production build
npm run lint
```

## What's here

| Route             | What it shows                                              |
| ----------------- | ---------------------------------------------------------- |
| `/`               | The latest message, then the full searchable library        |
| `/sermons/[slug]` | The player, with details and a link to the next in a series |
| `/series`         | Every teaching series                                       |
| `/series/[slug]`  | The messages in one series                                  |

The player handles video and audio, remembers where you stopped (per message,
in `localStorage`) and offers to resume next time, and has a playback-speed
control — useful at 1.5× on a 40-minute message.

Every page is statically prerendered at build time, so the site can be hosted
anywhere that serves static files plus a Node runtime (Vercel, Netlify, a
container, etc.).

## Adding a message

Content lives in two plain TypeScript files — no database, no CMS:

- `src/data/sermons.ts` — one entry per message
- `src/data/series.ts` — one entry per series

```ts
{
  slug: "the-house-on-the-rock",      // becomes /sermons/the-house-on-the-rock
  title: "The House on the Rock",
  speaker: "Pastor Alina Reyes",
  seriesSlug: "sermon-on-the-mount",  // or null for a standalone message
  date: "2026-08-02",                 // YYYY-MM-DD
  scripture: "Matthew 7:24–27",
  description: "Two houses, one storm…",
  durationSeconds: 2196,
  media: {
    kind: "video",                    // "video" | "audio"
    src: "https://cdn.example.org/2026-08-02.mp4",
    poster: "https://cdn.example.org/2026-08-02.jpg",
    captions: "/captions/2026-08-02.vtt",   // optional WebVTT track
  },
}
```

`src` can be any URL your host serves, or a path under `public/` — drop files in
`public/media/` and reference them as `/media/your-file.mp4`. Self-hosted files
are served with HTTP range support, so seeking works.

> The seed entries point at Google's public sample bucket so the player works
> out of the box. Replace them with your own recordings.

## Layout

```
src/
  app/                  routes (library, sermon, series, 404)
  components/
    MediaPlayer.tsx     video/audio player, resume + speed  (client)
    SermonLibrary.tsx   search and filtering                (client)
    SermonCard.tsx      grid tile
  data/                 the content — sermons.ts, series.ts
  lib/
    sermons.ts          lookups, sorting, formatting
    types.ts            Sermon, Series, Media
```

`src/lib/sermons.ts` is the only thing that touches the data files. When the
content outgrows a TypeScript array, swap that module's internals for a database
or CMS call and nothing else has to change.
