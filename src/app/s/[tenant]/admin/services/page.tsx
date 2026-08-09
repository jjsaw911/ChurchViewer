import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { serviceItems, services } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { createServiceForDateAction } from "@/lib/services/actions";
import { formatTimeOfDay, parseTimeOfDay } from "@/lib/services/timeline";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage({ params }: PageProps<"/s/[tenant]/admin/services">) {
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

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = rows.filter((row) => row.heldOn >= today);
  const past = rows.filter((row) => row.heldOn < today);

  // Today if it's already Sunday, otherwise the one coming. UTC throughout, to
  // match how `heldOn` is stored and compared.
  const now = new Date(`${today}T00:00:00Z`);
  now.setUTCDate(now.getUTCDate() + ((7 - now.getUTCDay()) % 7));
  const nextSunday = now.toISOString().slice(0, 10);

  const list = (entries: typeof rows) => (
    <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
      {entries.map((service) => (
        <li key={service.slug} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <Link
              href={`/admin/services/${service.slug}`}
              className="font-medium hover:text-amber-700 dark:hover:text-amber-500"
            >
              {service.title}
            </Link>
            <p className="text-sm text-stone-500">
              {new Date(`${service.heldOn}T00:00:00Z`).toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}{" "}
              · {formatTimeOfDay(parseTimeOfDay(service.startsAt) ?? 0)}
            </p>
          </div>
          <p className="text-sm text-stone-500">
            {service.itemCount} {service.itemCount === 1 ? "item" : "items"}
            {service.runtime ? ` · ${Math.round(service.runtime / 60)} min` : ""}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Link href="/admin" className="text-sm text-stone-500 hover:underline">
            &larr; Manage
          </Link>
          <h1 className="text-3xl font-semibold">Services</h1>
          <p className="text-sm text-stone-500">Plan a service start to finish, against the clock.</p>
        </div>
        {/* Date first: planning starts with "which Sunday", not with a title.
            The next Sunday is pre-filled because that's the answer most of the
            time; everything else gets a default you can edit in the planner. */}
        <form
          action={createServiceForDateAction}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-800"
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
            Create service
          </button>
        </form>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-12 text-center text-stone-500 dark:border-stone-700">
          No services planned yet.
        </p>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-semibold">Coming up</h2>
              {list(upcoming)}
            </section>
          ) : null}
          {past.length > 0 ? (
            <section className="space-y-3">
              <h2 className="font-semibold text-stone-500">Past</h2>
              {list(past)}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
