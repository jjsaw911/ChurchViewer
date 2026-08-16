"use client";

import { useActionState } from "react";
import { createSongsFromLinksAction, type SongLinksState } from "@/lib/songs/actions";

/**
 * A backlog, pasted in one go.
 *
 * Forty recordings is forty trips through an upload box, which is an afternoon.
 * Forty links is a minute, and the server does the fetching while nobody
 * watches — so the shape of this is a big empty box and one button.
 */
export default function SongLinkImport({ tenant }: { tenant: string }) {
  const [state, submit, pending] = useActionState<SongLinksState, FormData>(
    createSongsFromLinksAction,
    {},
  );

  return (
    <details className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <summary className="cursor-pointer font-semibold">Add songs from links</summary>

      <form action={submit} className="space-y-3 pt-4">
        <input type="hidden" name="tenant" value={tenant} />

        <p className="text-sm text-stone-600 dark:text-stone-400">
          One link per line, each one pointing straight at the file. The server fetches
          each, takes the audio out, and builds the slides &mdash; nothing to download or
          upload here.
        </p>

        <textarea
          name="links"
          rows={6}
          required
          placeholder={"https://example.org/recordings/all-hail-king-jesus.mp4\nhttps://example.org/recordings/more-than-anything.mp3"}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-xs focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
        />

        <p className="text-xs text-stone-500">
          A YouTube page address won&rsquo;t work &mdash; it isn&rsquo;t a file. For your
          church&rsquo;s own uploads, YouTube Studio will hand you the original: Content,
          then the ⋮ menu, then Download. Put those somewhere with a direct link, or drop
          them in the upload box above.
        </p>

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {pending ? "Queuing…" : "Fetch and transcribe"}
        </button>

        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : null}

        {state.results ? (
          <ul className="space-y-1 border-t border-stone-200 pt-3 text-xs dark:border-stone-800">
            {state.results.map((result) => (
              <li key={result.link} className="flex flex-wrap gap-2">
                <span
                  className={
                    result.ok
                      ? "font-medium text-emerald-700 dark:text-emerald-500"
                      : "font-medium text-red-600 dark:text-red-400"
                  }
                >
                  {result.ok ? "✓" : "✗"}
                </span>
                <span className="min-w-0 flex-1 truncate text-stone-500">{result.link}</span>
                <span className="text-stone-700 dark:text-stone-300">{result.note}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </details>
  );
}
