"use client";

import { useActionState } from "react";
import {
  addPersonAction,
  removePersonAction,
  resetPersonPasswordAction,
  type PeopleState,
} from "@/lib/admin/people-actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export type Person = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "editor";
  /** True while the password they have is one somebody else chose. */
  mustChangePassword: boolean;
  addedAt: string;
};

/**
 * Who can get into this church, and how somebody new is set up.
 *
 * The password is typed here and read out to the person, because that is how a
 * church actually onboards somebody: across a table on a Sunday morning, not by
 * email to an address they're still setting up. It stops being the admin's
 * business the moment they sign in — the account can reach nothing but the
 * change-password page until they've picked their own.
 */
export default function ChurchPeople({
  tenant,
  people,
  canManage,
  currentUserId,
}: {
  tenant: string;
  people: Person[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [addState, add, adding] = useActionState<PeopleState, FormData>(addPersonAction, {});
  const [resetState, reset, resetting] = useActionState<PeopleState, FormData>(
    resetPersonPasswordAction,
    {},
  );

  return (
    <div className="space-y-8">
      {canManage ? (
        <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
          <div>
            <h2 className="font-semibold">Set someone up</h2>
            <p className="text-sm text-stone-500">
              Give them a password now and tell them what it is. They&apos;ll be made to change
              it the first time they sign in, and until they do, that&apos;s the only page they
              can reach.
            </p>
          </div>

          <form action={add} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="tenant" value={tenant} />

            <label className="space-y-1 text-xs">
              <span className="block font-medium">Their name</span>
              <input name="name" required placeholder="Sam Okafor" className={field} />
            </label>

            <label className="space-y-1 text-xs">
              <span className="block font-medium">Email</span>
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="sam@example.org"
                className={field}
              />
            </label>

            <label className="space-y-1 text-xs">
              <span className="block font-medium">Password to give them</span>
              <input
                name="password"
                type="text"
                required
                autoComplete="off"
                placeholder="at least 10 characters"
                className={`${field} font-mono`}
              />
              <span className="block text-stone-500">
                Shown rather than hidden — you have to read it out.
              </span>
            </label>

            <label className="space-y-1 text-xs">
              <span className="block font-medium">What they can do</span>
              <select name="role" defaultValue="editor" className={field}>
                <option value="editor">Editor — plans, songs, media, messages</option>
                <option value="owner">Owner — all of that, and who else gets in</option>
              </select>
            </label>

            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={adding}
                className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
              >
                {adding ? "Setting up…" : "Set them up"}
              </button>
            </div>
          </form>

          {addState.error ? (
            <p className="text-sm text-red-700 dark:text-red-400">{addState.error}</p>
          ) : null}
          {addState.ok ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">{addState.ok}</p>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">On this church</h2>

        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {people.map((person) => (
            <li key={person.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {person.name}
                    {person.id === currentUserId ? (
                      <span className="ml-2 text-xs text-stone-500">(you)</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-stone-500">
                    {person.email} &middot; {person.role}
                    {person.mustChangePassword ? " · hasn't chosen a password yet" : ""}
                  </p>
                </div>

                {canManage && person.id !== currentUserId ? (
                  <form action={removePersonAction}>
                    <input type="hidden" name="tenant" value={tenant} />
                    <input type="hidden" name="userId" value={person.id} />
                    <button
                      type="submit"
                      className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
                    >
                      Remove from this church
                    </button>
                  </form>
                ) : null}
              </div>

              {canManage ? (
                <form action={reset} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="tenant" value={tenant} />
                  <input type="hidden" name="userId" value={person.id} />
                  <label className="space-y-1 text-xs">
                    <span className="block font-medium">New password for them</span>
                    <input
                      name="password"
                      type="text"
                      autoComplete="off"
                      placeholder="if they're locked out"
                      className={`${field} w-64 font-mono`}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={resetting}
                    className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:border-amber-400 disabled:opacity-60 dark:border-stone-700"
                  >
                    Give them this
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>

        {resetState.error ? (
          <p className="text-sm text-red-700 dark:text-red-400">{resetState.error}</p>
        ) : null}
        {resetState.ok ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">{resetState.ok}</p>
        ) : null}

        {!canManage ? (
          <p className="text-sm text-stone-500">
            Only an owner can add or remove people.
          </p>
        ) : null}
      </section>
    </div>
  );
}
