import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { serviceItems, services } from "@/db/schema";
import PlanList, { type PlanRow } from "@/components/services/PlanList";
import { requireChurchAccess } from "@/lib/admin/guard";
import { createServiceForDateAction } from "@/lib/services/actions";

export const metadata: Metadata = { title: "Plans" };

export default async function PlansPage({ params }: PageProps<"/s/[tenant]/admin/services">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const rows = await db
    .select({
      slug: services.slug,
      title: services.title,
      heldOn: services.heldOn,
      startsAt: services.startsAt,
      itemCount: sql<number>`count(${serviceItems.id})::int`,
      runtime: sql<number>`coalesce(sum(${serviceItems.durationSeconds}), 0)::int`,
    })
    .from(services)
    .leftJoin(serviceItems, eq(serviceItems.serviceId, services.id))
    .where(eq(services.churchId, church.id))
    .groupBy(services.id)
    .orderBy(desc(services.heldOn));

  const plans: PlanRow[] = rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    heldOn: row.heldOn,
    startsAt: row.startsAt,
    itemCount: row.itemCount,
    runtimeMinutes: Math.round(row.runtime / 60),
  }));

  const today = new Date().toISOString().slice(0, 10);
  // Today counts as coming up: on a Sunday morning the plan for that morning is
  // the one somebody is reaching for.
  const upcoming = plans.filter((plan) => plan.heldOn >= today);
  const previous = plans.filter((plan) => plan.heldOn < today);

  // Today if it's already Sunday, otherwise the one coming. UTC throughout, to
  // match how `heldOn` is stored and compared.
  const now = new Date(`${today}T00:00:00Z`);
  now.setUTCDate(now.getUTCDate() + ((7 - now.getUTCDay()) % 7));
  const nextSunday = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Plans</h1>
        <p className="text-sm text-stone-500">
          Plan a service against the clock, then run it on Sunday.
        </p>
      </header>

      {/* Date first: planning starts with "which Sunday", not with a title. The
          next Sunday is pre-filled because that's the answer most of the time;
          everything else gets a default you can change in the planner. */}
      <section className="space-y-3">
        <h2 className="font-semibold">Add a plan</h2>
        <form
          action={createServiceForDateAction}
          className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800"
        >
          <input type="hidden" name="tenant" value={tenant} />
          <label className="space-y-1 text-xs">
            <span className="block font-medium">Date of service</span>
            <input
              name="heldOn"
              type="date"
              defaultValue={nextSunday}
              required
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block font-medium">Starts</span>
            <input
              name="startsAt"
              defaultValue="10:00"
              className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Start planning
          </button>

          {/* A day that already has a plan opens that plan instead of quietly
              making a second one. Churches that hold two services on a Sunday
              are real, though, so this is how they say so. */}
          <label className="flex items-center gap-2 text-xs text-stone-500">
            <input type="checkbox" name="another" value="yes" className="accent-amber-700" />
            Another service that day
          </label>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Coming up</h2>
        <PlanList plans={upcoming} emptyMessage="Nothing planned ahead yet." />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Archive</h2>
        <p className="text-sm text-stone-500">
          Services that have been and gone. Last week&apos;s order is usually most of this
          week&apos;s, so these are worth keeping &mdash; open one to copy its slides
          across, or just to see what you did. Delete the ones you won&apos;t look at
          again.
        </p>
        <PlanList
          plans={previous}
          tenant={tenant}
          deletable
          emptyMessage="No services have been and gone yet."
        />
      </section>
    </div>
  );
}
