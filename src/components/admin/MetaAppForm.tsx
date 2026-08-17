"use client";

import { useActionState } from "react";
import {
  clearMetaAppAction,
  saveMetaAppAction,
  type PlatformState,
} from "@/lib/admin/platform-actions";

/**
 * The Facebook app the whole site posts through.
 *
 * One for ChurchViewer rather than one per church: Meta registers a single
 * redirect address, and a church per subdomain would mean registering every
 * church with Meta. Churches then connect their own pages to this.
 *
 * The secret is a password field and never comes back down, same as the
 * transcription key next to it.
 */
export default function MetaAppForm({
  appId,
  hasSecret,
  redirectUri,
}: {
  appId: string | null;
  hasSecret: boolean;
  redirectUri: string;
}) {
  const [saveState, save, saving] = useActionState<PlatformState, FormData>(
    saveMetaAppAction,
    {},
  );
  const [clearState, clear, clearing] = useActionState<PlatformState, FormData>(
    clearMetaAppAction,
    {},
  );
  const state = saveState.error || saveState.ok ? saveState : clearState;

  const field =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div>
        <h2 className="font-semibold">Posting to Facebook and Instagram</h2>
        <p className="text-sm text-stone-500">
          {appId && hasSecret
            ? `App ${appId} — churches can connect their pages.`
            : "Not set. Churches see a note asking you to set it up."}
        </p>
      </div>

      <form action={save} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">App ID</span>
          <input name="appId" defaultValue={appId ?? ""} placeholder="1234567890" className={field} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">App secret</span>
          <input
            name="appSecret"
            type="password"
            placeholder={hasSecret ? "•••••••• (stored)" : ""}
            className={field}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          {appId ? (
            <button
              type="submit"
              formAction={clear}
              disabled={clearing}
              className="text-sm text-stone-500 hover:text-red-600 disabled:opacity-60 dark:hover:text-red-400"
            >
              {clearing ? "Removing…" : "Remove"}
            </button>
          ) : null}
        </div>
      </form>

      {state.scope === "meta" && state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : state.scope === "meta" && state.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-500">{state.ok}</p>
      ) : null}

      <div className="space-y-1 border-t border-stone-200 pt-3 text-xs text-stone-500 dark:border-stone-800">
        <p>
          Make the app at developers.facebook.com, add <strong>Facebook Login</strong>, and
          set the redirect to:
        </p>
        <code className="block rounded bg-stone-100 px-2 py-1 dark:bg-stone-800">
          {redirectUri}
        </code>
        <p>
          While the app is in development, it can only post to pages owned by people listed
          on it as developers or testers &mdash; enough for your own church, not for
          anybody else&rsquo;s. Other churches need Meta to review the app first, which
          takes business verification and a few weeks.
        </p>
      </div>
    </section>
  );
}
