"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { deleteServiceAction } from "@/lib/services/actions";

export type PlanRow = {
  slug: string;
  title: string;
  heldOn: string;
  startsAt: string;
  itemCount: number;
  runtimeMinutes: number;
};

/** `2026-08-09` -> `Sunday, August 9, 2026`, without shifting the date. */
function longDate(heldOn: string): string {
  return new Date(`${heldOn}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Plans already made, with a box to find one.
 *
 * Most weeks the plan someone wants is last Sunday's, so the newest are at the
 * top. But the reason to open an old one is usually "what did we do at the
 * carol service" — a search across the name and the date answers that, where
 * scrolling two years of Sundays does not.
 */
export default function PlanList({
  plans,
  emptyMessage,
  /** Offered on the archive, where a plan is finished with. */
  tenant,
  deletable = false,
}: {
  plans: PlanRow[];
  emptyMessage: string;
  tenant?: string;
  deletable?: boolean;
}) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return plans;
    return plans.filter((plan) =>
      `${plan.title} ${plan.heldOn} ${longDate(plan.heldOn)}`.toLowerCase().includes(term),
    );
  }, [plans, search]);

  if (plans.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {plans.length > 5 ? (
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Find a plan — “carols”, “christmas”, “2026-03”"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
        />
      ) : null}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700">
          Nothing matching “{search}”.
        </p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-stone-200 overflow-y-auto rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {shown.map((plan) => (
            <li key={plan.slug} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/services/${plan.slug}`}
                  className="font-medium hover:text-amber-700 dark:hover:text-amber-500"
                >
                  {plan.title}
                </Link>
                <p className="text-sm text-stone-500">{longDate(plan.heldOn)}</p>
              </div>

              <div className="flex items-center gap-4 text-sm text-stone-500">
                <span>
                  {plan.itemCount} {plan.itemCount === 1 ? "item" : "items"}
                  {plan.runtimeMinutes ? ` · ${plan.runtimeMinutes} min` : ""}
                </span>
                <Link
                  href={`/present/services/${plan.slug}`}
                  className="rounded-lg border border-stone-300 px-3 py-1 font-medium hover:border-amber-400 dark:border-stone-700"
                >
                  Run it
                </Link>

                {deletable && tenant ? (
                  <form
                    action={deleteServiceAction}
                    onSubmit={(event) => {
                      // The date, in the question. "Are you sure?" is a
                      // question nobody reads; the name of the Sunday about to
                      // disappear is one they do.
                      if (
                        !window.confirm(
                          `Delete the plan for ${longDate(plan.heldOn)}?\n\n` +
                            "Its running order and any slides typed onto it go with it. " +
                            "Songs, recordings and pictures stay in the library.",
                        )
                      ) {
                        event.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="tenant" value={tenant} />
                    <input type="hidden" name="slug" value={plan.slug} />
                    <button
                      type="submit"
                      className="rounded-lg px-2 py-1 font-medium text-stone-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={`Delete the plan for ${longDate(plan.heldOn)}`}
                    >
                      Delete
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
