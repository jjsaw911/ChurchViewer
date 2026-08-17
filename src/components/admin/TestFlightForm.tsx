"use client";

import { useActionState } from "react";
import { saveTestFlightAction, type PlatformState } from "@/lib/admin/platform-actions";

/**
 * The public TestFlight invitation for the iPhone remote.
 *
 * Kept here rather than in the code because it changes when a build expires,
 * and needing a deploy to fix a link is how the link ends up wrong on every
 * church's download page at once.
 */
export default function TestFlightForm({ url }: { url: string | null }) {
  const [state, save, saving] = useActionState<PlatformState, FormData>(
    saveTestFlightAction,
    {},
  );

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div>
        <h2 className="font-semibold">The iPhone and iPad remote</h2>
        <p className="text-sm text-stone-500">
          {url
            ? "Offered on every church's download page."
            : "No invitation set — download pages offer Android and the browser only."}
        </p>
      </div>

      <form action={save} className="flex flex-wrap gap-2">
        <input
          name="url"
          defaultValue={url ?? ""}
          placeholder="https://testflight.apple.com/join/…"
          className="min-w-64 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {state.scope === "testflight" && state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : state.scope === "testflight" && state.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-500">{state.ok}</p>
      ) : null}

      <p className="text-xs text-stone-500">
        Empty the box and save to take it down — worth doing when a build expires, since
        an invitation that has run out looks like the app being broken.
      </p>
    </section>
  );
}
