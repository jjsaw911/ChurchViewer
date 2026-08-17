"use client";

import { useActionState, useState } from "react";
import {
  createResetLinkAction,
  revokeSessionsAction,
  type PlatformState,
} from "@/lib/admin/platform-actions";

export type PersonView = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  hasPassword: boolean;
  churches: { slug: string; role: string }[];
};

const since = (iso: string | null) => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
};

function Person({ person }: { person: PersonView }) {
  const [linkState, makeLink, making] = useActionState<PlatformState, FormData>(
    createResetLinkAction,
    {},
  );
  const [revokeState, revoke] = useActionState<PlatformState, FormData>(
    revokeSessionsAction,
    {},
  );

  return (
    <li className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{person.email}</p>
          <p className="text-xs text-stone-500">
            {person.name} · seen {since(person.lastSeenAt)}
            {person.hasPassword ? "" : " · Google sign-in only"}
            {person.churches.length > 0
              ? ` · ${person.churches.map((c) => `${c.slug} (${c.role})`).join(", ")}`
              : " · no church"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {person.hasPassword ? (
            <form action={makeLink}>
              <input type="hidden" name="userId" value={person.id} />
              <button
                type="submit"
                disabled={making}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-60 dark:border-stone-700 dark:hover:bg-stone-800"
              >
                {making ? "…" : "Reset link"}
              </button>
            </form>
          ) : null}
          <form action={revoke}>
            <input type="hidden" name="userId" value={person.id} />
            <button
              type="submit"
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Sign out everywhere
            </button>
          </form>
        </div>
      </div>

      {linkState.error ? (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{linkState.error}</p>
      ) : null}

      {/* The link is the whole point of the action, so it's shown to be copied
          rather than summarised. It's good for one hour and one use. */}
      {linkState.ok ? (
        <div className="mt-3 space-y-1.5 rounded-lg bg-stone-100 p-3 dark:bg-stone-800/60">
          <p className="text-xs font-medium">
            Send this to {person.email}. Good for one hour, once.
          </p>
          <input
            readOnly
            value={linkState.ok}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded border border-stone-300 bg-white px-2 py-1.5 font-mono text-xs dark:border-stone-700 dark:bg-stone-900"
          />
        </div>
      ) : null}

      {revokeState.ok ? (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-500">{revokeState.ok}</p>
      ) : null}
    </li>
  );
}

export default function PeopleList({ people }: { people: PersonView[] }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? people.filter(
        (person) =>
          person.email.toLowerCase().includes(needle) ||
          person.name.toLowerCase().includes(needle) ||
          person.churches.some((church) => church.slug.includes(needle)),
      )
    : people;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          People <span className="text-stone-500">({people.length})</span>
        </h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search email, name, or church"
          className="w-64 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
        />
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-stone-500">
          {people.length === 0 ? "No accounts yet." : "Nobody matches that."}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((person) => (
            <Person key={person.id} person={person} />
          ))}
        </ul>
      )}
    </section>
  );
}
