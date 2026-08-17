"use client";

import { useActionState } from "react";
import {
  saveMailAction,
  sendTestMailAction,
  type PlatformState,
} from "@/lib/admin/platform-actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/**
 * Where the site's mail goes out through.
 *
 * With a test button, because the only thing anybody wants to know after
 * setting this up is whether a message actually arrives — and finding that out
 * through a forgotten password at eleven at night is finding it out the hard
 * way.
 */
export default function MailForm({
  from,
  replyTo,
  hasKey,
}: {
  from: string | null;
  replyTo: string | null;
  hasKey: boolean;
}) {
  const [saveState, save, saving] = useActionState<PlatformState, FormData>(saveMailAction, {});
  const [testState, test, testing] = useActionState<PlatformState, FormData>(
    sendTestMailAction,
    {},
  );
  const state = saveState.error || saveState.ok ? saveState : testState;

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div>
        <h2 className="font-semibold">Sending mail</h2>
        <p className="text-sm text-stone-500">
          {hasKey && from
            ? `Sending as ${from}.`
            : "Not set up. Password resets and emailed invitations do nothing until it is."}
        </p>
      </div>

      <form action={save} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">From</span>
          <input
            name="from"
            defaultValue={from ?? ""}
            placeholder="ChurchViewer &lt;hello@churchviewer.com&gt;"
            className={field}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Replies go to <span className="font-normal text-stone-500">(optional)</span>
          </span>
          <input
            name="replyTo"
            defaultValue={replyTo ?? ""}
            placeholder="you@yourchurch.org"
            className={field}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Relay API key</span>
          <input
            name="apiKey"
            type="password"
            placeholder={hasKey ? "•••••••• (stored)" : "re_…"}
            className={field}
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </form>

      {hasKey ? (
        <form action={test} className="flex flex-wrap items-end gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
          <label className="min-w-48 flex-1 space-y-1">
            <span className="text-sm font-medium">Send a test to</span>
            <input name="to" placeholder="you@example.com" className={field} />
          </label>
          <button
            type="submit"
            disabled={testing}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 disabled:opacity-60 dark:border-stone-700"
          >
            {testing ? "Sending…" : "Send a test"}
          </button>
        </form>
      ) : null}

      {state.scope === "mail" && state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : state.scope === "mail" && state.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-500">{state.ok}</p>
      ) : null}

      <p className="text-xs text-stone-500">
        Empty both boxes and save to turn it off. The address has to be at a domain the
        relay has been shown you own, or the messages are binned as forgeries before
        anybody sees them.
      </p>
    </section>
  );
}
