"use client";

import { useActionState, useState } from "react";
import {
  createInviteLinkAction,
  revokeInviteLinkAction,
  type PeopleState,
} from "@/lib/admin/people-actions";

/**
 * The link an owner texts to somebody.
 *
 * Shown whole, big enough to read out loud, with one button that copies it —
 * because it is going into a text message, and a link somebody has to
 * hand-transcribe is a link that arrives broken.
 */
export default function InviteLink({
  tenant,
  invite,
}: {
  tenant: string;
  invite: { url: string; expiresAt: string; uses: number } | null;
}) {
  const [created, create, creating] = useActionState<PeopleState, FormData>(
    createInviteLinkAction,
    {},
  );
  const [revoked, revoke, revoking] = useActionState<PeopleState, FormData>(
    revokeInviteLinkAction,
    {},
  );
  const [copied, setCopied] = useState(false);

  const state = created.error || created.ok ? created : revoked;

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Invite by link</h2>
        <p className="text-sm text-stone-500">
          Text this to somebody and they set their own password. They get the ordinary
          role: plans, songs, media and the screen — everything except adding other
          people.
        </p>
      </div>

      {invite ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
              {invite.url}
            </code>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(invite.url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // Clipboard refused — the link is on screen to be copied by hand.
                }
              }}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="text-xs text-stone-500">
            Works until{" "}
            {new Date(invite.expiresAt).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            {invite.uses > 0
              ? ` · used ${invite.uses} time${invite.uses === 1 ? "" : "s"}`
              : " · not used yet"}
            . Anyone who has it can join until then, so turn it off once it has done its
            job.
          </p>
        </>
      ) : (
        <p className="text-sm text-stone-500">
          No link at the moment. Make one when you need it — it lasts a fortnight.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={create}>
          <input type="hidden" name="tenant" value={tenant} />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 disabled:opacity-60 dark:border-stone-700"
          >
            {creating ? "Making one…" : invite ? "Make a new one" : "Make a link"}
          </button>
        </form>

        {invite ? (
          <form action={revoke}>
            <input type="hidden" name="tenant" value={tenant} />
            <button
              type="submit"
              disabled={revoking}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-red-400 disabled:opacity-60 dark:border-stone-700"
            >
              {revoking ? "Turning it off…" : "Turn it off"}
            </button>
          </form>
        ) : null}
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : state.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-500">{state.ok}</p>
      ) : null}

      <p className="text-xs text-stone-500">
        Making a new link turns the old one off, so a link that has been forwarded around
        can be replaced rather than lived with.
      </p>
    </section>
  );
}
