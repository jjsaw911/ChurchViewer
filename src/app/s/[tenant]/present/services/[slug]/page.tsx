import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { serviceItems, services, songs } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { buildTimeline, formatTimeOfDay, parseTimeOfDay, totalRuntimeSeconds } from "@/lib/services/timeline";

export const metadata: Metadata = { title: "Run sheet" };

/** The stripped-back view for the person running the service on the day. */
export default async function RunSheetPage({
  params,
}: PageProps<"/s/[tenant]/present/services/[slug]">) {
  const { tenant, slug } = await params;
  const { church } = await requireChurchAccess(tenant);

  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.churchId, church.id), eq(services.slug, slug)))
    .limit(1);
  if (!service) notFound();

  const items = await db
    .select({
      id: serviceItems.id,
      title: serviceItems.title,
      kind: serviceItems.kind,
      durationSeconds: serviceItems.durationSeconds,
      owner: serviceItems.owner,
      notes: serviceItems.notes,
      songSlug: songs.slug,
      songSlideCount: songs.slides,
    })
    .from(serviceItems)
    .leftJoin(songs, eq(songs.id, serviceItems.songId))
    .where(eq(serviceItems.serviceId, service.id))
    .orderBy(asc(serviceItems.position));

  const timeline = buildTimeline(items, service.startsAt);
  const runtime = totalRuntimeSeconds(items);
  const endsAt = formatTimeOfDay((parseTimeOfDay(service.startsAt) ?? 0) + runtime / 60);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-2 border-b border-stone-200 pb-6 dark:border-stone-800">
        <Link href={`/admin/services/${service.slug}`} className="text-sm text-stone-500 hover:underline">
          &larr; Edit plan
        </Link>
        <h1 className="text-3xl font-semibold">{service.title}</h1>
        <p className="text-stone-600 dark:text-stone-400">
          {new Date(`${service.heldOn}T00:00:00Z`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}{" "}
          &middot; {formatTimeOfDay(parseTimeOfDay(service.startsAt) ?? 0)} &ndash; {endsAt} (
          {Math.round(runtime / 60)} min)
        </p>
        {service.notes ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">{service.notes}</p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="text-stone-500">Nothing planned yet.</p>
      ) : (
        <ol className="divide-y divide-stone-200 dark:divide-stone-800">
          {timeline.map(({ item, startsAt }) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
              <span className="w-20 font-mono text-lg text-amber-700 dark:text-amber-500">
                {startsAt}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-medium">
                  {item.title}
                  {item.songSlug ? (
                    <Link
                      href={`/present/songs/${item.songSlug}`}
                      className="ml-3 text-sm font-normal text-amber-700 hover:underline dark:text-amber-500"
                    >
                      Slides
                      {Array.isArray(item.songSlideCount) && item.songSlideCount.length
                        ? ` (${item.songSlideCount.length})`
                        : ""}
                    </Link>
                  ) : null}
                </p>
                <p className="text-sm text-stone-500">
                  {[item.kind, item.owner].filter(Boolean).join(" · ")}
                </p>
                {item.notes ? (
                  <p className="text-sm text-stone-600 dark:text-stone-400">{item.notes}</p>
                ) : null}
              </div>
              <span className="text-sm text-stone-500">
                {Math.round(item.durationSeconds / 60)} min
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
