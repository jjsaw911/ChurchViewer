"use client";

import { useActionState, useState } from "react";
import ChurchRow, { type ChurchView } from "@/components/admin/ChurchRow";
import { createChurchAction, type PlatformState } from "@/lib/admin/platform-actions";
import { slugify } from "@/lib/tenant";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

type Props = {
  churches: ChurchView[];
  stats: { live: number; archived: number; sermons: number; users: number };
  rootDomain: string;
  adminEmail: string;
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-stone-200 px-4 py-3 dark:border-stone-800">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-stone-500">{label}</div>
    </div>
  );
}

export default function PlatformConsole({ churches, stats, rootDomain, adminEmail }: Props) {
  const [state, create, creating] = useActionState<PlatformState, FormData>(
    createChurchAction,
    {},
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const address = slugify(slugTouched ? slug : name);
  const live = churches.filter((church) => church.archivedAt === null);
  const archived = churches.filter((church) => church.archivedAt !== null);

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Platform admin</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Every church on {rootDomain}. Signed in as {adminEmail}.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="live churches" value={stats.live} />
        <Stat label="archived" value={stats.archived} />
        <Stat label="sermons" value={stats.sermons} />
        <Stat label="accounts" value={stats.users} />
      </div>

      <section className="space-y-4 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <h2 className="text-lg font-semibold">Add a church</h2>
        <form action={create} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-name">
                Church name
              </label>
              <input
                id="new-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="City Church"
                className={field}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-slug">
                Address
              </label>
              <div className="flex items-center gap-1">
                <input
                  id="new-slug"
                  name="slug"
                  value={slugTouched ? slug : address}
                  onChange={(event) => {
                    setSlugTouched(true);
                    setSlug(event.target.value);
                  }}
                  placeholder="citychurch"
                  className={field}
                />
                <span className="whitespace-nowrap text-sm text-stone-500">.{rootDomain}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-tagline">
                Tagline <span className="text-stone-500">(optional)</span>
              </label>
              <input id="new-tagline" name="tagline" className={field} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="new-owner">
                Owner email <span className="text-stone-500">(optional)</span>
              </label>
              <input
                id="new-owner"
                name="ownerEmail"
                type="email"
                placeholder="pastor@citychurch.org"
                className={field}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
            >
              {creating ? "Creating…" : "Create church"}
            </button>
            {state.error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
            ) : null}
            {state.ok ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-500">{state.ok}</p>
            ) : null}
          </div>
        </form>

        <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-stone-800/60 dark:text-stone-400">
          Creating a church here does not create its DNS. There is no wildcard record
          yet, so a new address needs an A record pointing at the server, its name added
          to the nginx config, and the certificate reissued to cover it. Until then the
          subdomain simply won&apos;t resolve.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Churches <span className="text-stone-500">({live.length})</span>
        </h2>
        {live.length === 0 ? (
          <p className="text-sm text-stone-500">Nothing live yet.</p>
        ) : (
          <ul className="space-y-3">
            {live.map((church) => (
              <ChurchRow key={church.id} church={church} rootDomain={rootDomain} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 ? (
        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="text-sm font-medium text-stone-600 underline underline-offset-2 dark:text-stone-400"
          >
            {showArchived ? "Hide" : "Show"} archived ({archived.length})
          </button>
          {showArchived ? (
            <ul className="space-y-3">
              {archived.map((church) => (
                <ChurchRow key={church.id} church={church} rootDomain={rootDomain} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
