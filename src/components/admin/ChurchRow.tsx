"use client";

import { useActionState, useState } from "react";
import {
  addOwnerAction,
  archiveChurchAction,
  removeOwnerAction,
  restoreChurchAction,
  updateChurchAction,
  type PlatformState,
} from "@/lib/admin/platform-actions";
import { slugify } from "@/lib/tenant";

export type ChurchView = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  archivedAt: string | null;
  createdAt: string;
  sermonCount: number;
  songCount: number;
  memberCount: number;
  owners: string[];
};

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

function Message({ state }: { state: PlatformState }) {
  if (state.error) {
    return <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>;
  }
  if (state.ok) {
    return <p className="text-sm text-emerald-700 dark:text-emerald-500">{state.ok}</p>;
  }
  return null;
}

export default function ChurchRow({
  church,
  rootDomain,
}: {
  church: ChurchView;
  rootDomain: string;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(church.slug);
  const [confirm, setConfirm] = useState("");

  const [saveState, save, saving] = useActionState<PlatformState, FormData>(
    updateChurchAction,
    {},
  );
  const [archiveState, archive, archiving] = useActionState<PlatformState, FormData>(
    archiveChurchAction,
    {},
  );
  const [restoreState, restore, restoring] = useActionState<PlatformState, FormData>(
    restoreChurchAction,
    {},
  );
  const [ownerState, addOwner, addingOwner] = useActionState<PlatformState, FormData>(
    addOwnerAction,
    {},
  );
  const [dropState, dropOwner] = useActionState<PlatformState, FormData>(
    removeOwnerAction,
    {},
  );

  const archived = church.archivedAt !== null;
  const address = `${church.slug}.${rootDomain}`;
  const moving = slugify(slug) !== church.slug;

  return (
    <li
      className={`rounded-xl border p-4 ${
        archived
          ? "border-dashed border-stone-300 bg-stone-50 dark:border-stone-700 dark:bg-stone-900/40"
          : "border-stone-200 dark:border-stone-800"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{church.name}</h3>
            {archived ? (
              <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                archived
              </span>
            ) : null}
          </div>
          {archived ? (
            <p className="text-sm text-stone-500">{address} — not serving</p>
          ) : (
            <a
              href={`https://${address}`}
              className="text-sm text-amber-700 underline underline-offset-2 dark:text-amber-500"
            >
              {address}
            </a>
          )}
          <p className="mt-1 text-xs text-stone-500">
            {church.sermonCount} sermons · {church.songCount} songs ·{" "}
            {church.memberCount} members
            {church.owners.length > 0 ? ` · ${church.owners.join(", ")}` : " · no owner"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-6 border-t border-stone-200 pt-4 dark:border-stone-800">
          <form action={save} className="space-y-3">
            <input type="hidden" name="id" value={church.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor={`name-${church.id}`}>
                  Name
                </label>
                <input
                  id={`name-${church.id}`}
                  name="name"
                  defaultValue={church.name}
                  className={field}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor={`slug-${church.id}`}>
                  Address
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id={`slug-${church.id}`}
                    name="slug"
                    value={slug}
                    onChange={(event) => setSlug(event.target.value)}
                    className={field}
                  />
                  <span className="whitespace-nowrap text-sm text-stone-500">
                    .{rootDomain}
                  </span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`tagline-${church.id}`}>
                Tagline
              </label>
              <input
                id={`tagline-${church.id}`}
                name="tagline"
                defaultValue={church.tagline}
                className={field}
              />
            </div>

            {moving ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                Moving to <strong>{slugify(slug)}.{rootDomain}</strong>. That address needs
                its own DNS record and a place on the certificate before it will load —
                there is no wildcard yet. Recordings already uploaded keep working; each
                one stores its own file path.
              </p>
            ) : null}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <Message state={saveState} />
            </div>
          </form>

          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Owners</h4>
            {church.owners.length > 0 ? (
              <ul className="space-y-1.5">
                {church.owners.map((email) => (
                  <li key={email} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{email}</span>
                    <form action={dropOwner}>
                      <input type="hidden" name="id" value={church.id} />
                      <input type="hidden" name="email" value={email} />
                      <button
                        type="submit"
                        className="text-stone-500 underline underline-offset-2 hover:text-red-600"
                      >
                        remove
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-500">
                Nobody can manage this church yet.
              </p>
            )}
            <Message state={dropState} />

            <form action={addOwner} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={church.id} />
              <input
                name="email"
                type="email"
                placeholder="person@church.org"
                className={`${field} max-w-xs`}
              />
              <button
                type="submit"
                disabled={addingOwner}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-60 dark:border-stone-700 dark:hover:bg-stone-800"
              >
                Add owner
              </button>
            </form>
            <p className="text-xs text-stone-500">
              They need an account already — people set their own passwords.
            </p>
            <Message state={ownerState} />
          </div>

          <div className="space-y-3">
            {archived ? (
              <form action={restore} className="flex items-center gap-3">
                <input type="hidden" name="id" value={church.id} />
                <button
                  type="submit"
                  disabled={restoring}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  {restoring ? "Restoring…" : "Put back on the air"}
                </button>
                <Message state={restoreState} />
              </form>
            ) : (
              <form action={archive} className="space-y-2">
                <input type="hidden" name="id" value={church.id} />
                <h4 className="text-sm font-semibold">Take off the air</h4>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {address} stops serving and drops out of listings. Nothing is
                  deleted — {church.sermonCount} sermons and {church.songCount} songs
                  stay exactly as they are, and you can restore it any time. The
                  address stays reserved.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="confirm"
                    value={confirm}
                    onChange={(event) => setConfirm(event.target.value)}
                    placeholder={`Type ${church.slug} to confirm`}
                    className={`${field} max-w-xs`}
                  />
                  <button
                    type="submit"
                    disabled={archiving || confirm !== church.slug}
                    className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-40"
                  >
                    {archiving ? "Archiving…" : "Archive"}
                  </button>
                </div>
                <Message state={archiveState} />
              </form>
            )}
          </div>
        </div>
      ) : null}
    </li>
  );
}
