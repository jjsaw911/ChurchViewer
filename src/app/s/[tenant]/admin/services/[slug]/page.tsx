import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { serviceItems, services, songs } from "@/db/schema";
import ServiceForm from "@/components/services/ServiceForm";
import {
  addServiceItemAction,
  deleteServiceAction,
  deleteServiceItemAction,
  moveServiceItemAction,
  updateServiceItemAction,
} from "@/lib/services/actions";
import { requireChurchAccess } from "@/lib/admin/guard";
import { buildTimeline, formatTimeOfDay, parseTimeOfDay, totalRuntimeSeconds } from "@/lib/services/timeline";

export const metadata: Metadata = { title: "Service plan" };

const KINDS = [
  "song",
  "scripture",
  "prayer",
  "sermon",
  "offering",
  "announcements",
  "communion",
  "other",
] as const;

const field =
  "rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export default async function ServicePlanPage({
  params,
}: PageProps<"/s/[tenant]/admin/services/[slug]">) {
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
    })
    .from(serviceItems)
    .leftJoin(songs, eq(songs.id, serviceItems.songId))
    .where(eq(serviceItems.serviceId, service.id))
    .orderBy(asc(serviceItems.position));

  const songOptions = await db
    .select({ id: songs.id, title: songs.title })
    .from(songs)
    .where(eq(songs.churchId, church.id))
    .orderBy(asc(songs.title));

  const timeline = buildTimeline(items, service.startsAt);
  const runtime = totalRuntimeSeconds(items);
  const endsAt = formatTimeOfDay((parseTimeOfDay(service.startsAt) ?? 0) + runtime / 60);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Link href="/admin/services" className="text-sm text-stone-500 hover:underline">
            &larr; Services
          </Link>
          <h1 className="text-3xl font-semibold">{service.title}</h1>
          <p className="text-sm text-stone-500">
            {new Date(`${service.heldOn}T00:00:00Z`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}{" "}
            &middot; {formatTimeOfDay(parseTimeOfDay(service.startsAt) ?? 0)} &ndash; {endsAt}
            {items.length ? ` · ${Math.round(runtime / 60)} min` : ""}
          </p>
        </div>
        <Link
          href={`/present/services/${service.slug}`}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Run sheet
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Running order</h2>

        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500 dark:border-stone-700">
            Nothing planned yet. Add the first item below.
          </p>
        ) : (
          <ol className="space-y-2">
            {timeline.map(({ item, startsAt }, index) => (
              <li
                key={item.id}
                className="rounded-xl border border-stone-200 p-4 dark:border-stone-800"
              >
                <form action={updateServiceItemAction} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="tenant" value={tenant} />
                  <input type="hidden" name="serviceId" value={service.id} />
                  <input type="hidden" name="itemId" value={item.id} />

                  <span className="w-20 font-mono text-sm text-amber-700 dark:text-amber-500">
                    {startsAt}
                  </span>
                  <span className="w-28 text-xs tracking-wide text-stone-500 uppercase">
                    {item.kind}
                  </span>
                  <input
                    name="title"
                    defaultValue={item.title}
                    aria-label={`Title for item ${index + 1}`}
                    className={`${field} min-w-48 flex-1`}
                  />
                  <input
                    name="owner"
                    defaultValue={item.owner}
                    placeholder="Who"
                    aria-label={`Owner for item ${index + 1}`}
                    className={`${field} w-36`}
                  />
                  <label className="flex items-center gap-1 text-sm">
                    <input
                      name="durationMinutes"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={Math.round(item.durationSeconds / 60)}
                      aria-label={`Minutes for item ${index + 1}`}
                      className={`${field} w-20`}
                    />
                    <span className="text-stone-500">min</span>
                  </label>
                  <input type="hidden" name="notes" value={item.notes} />
                  <button
                    type="submit"
                    className="rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:border-amber-400 dark:border-stone-700"
                  >
                    Save
                  </button>
                </form>

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  {item.songSlug ? (
                    <Link
                      href={`/present/songs/${item.songSlug}`}
                      className="font-medium text-amber-700 hover:underline dark:text-amber-500"
                    >
                      Present slides
                    </Link>
                  ) : null}
                  {[
                    { direction: "up", label: "Move up", disabled: index === 0 },
                    { direction: "down", label: "Move down", disabled: index === items.length - 1 },
                  ].map((move) => (
                    <form key={move.direction} action={moveServiceItemAction}>
                      <input type="hidden" name="tenant" value={tenant} />
                      <input type="hidden" name="serviceId" value={service.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input type="hidden" name="direction" value={move.direction} />
                      <button
                        type="submit"
                        disabled={move.disabled}
                        className="text-stone-500 hover:underline disabled:opacity-40"
                      >
                        {move.label}
                      </button>
                    </form>
                  ))}
                  <form action={deleteServiceItemAction}>
                    <input type="hidden" name="tenant" value={tenant} />
                    <input type="hidden" name="serviceId" value={service.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button type="submit" className="text-red-700 hover:underline dark:text-red-400">
                      Remove
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <h2 className="font-semibold">Add an item</h2>
        <form action={addServiceItemAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tenant" value={tenant} />
          <input type="hidden" name="serviceId" value={service.id} />

          <label className="space-y-1 text-sm">
            <span className="block font-medium">Kind</span>
            <select name="kind" className={field} defaultValue="song">
              {KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="block font-medium">Title</span>
            <input name="title" placeholder="Opening song" className={`${field} w-56`} />
          </label>

          <label className="space-y-1 text-sm">
            <span className="block font-medium">Song (if any)</span>
            <select name="songId" className={field} defaultValue="">
              <option value="">—</option>
              {songOptions.map((song) => (
                <option key={song.id} value={song.id}>
                  {song.title}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="block font-medium">Who</span>
            <input name="owner" placeholder="Worship team" className={`${field} w-40`} />
          </label>

          <label className="space-y-1 text-sm">
            <span className="block font-medium">Minutes</span>
            <input
              name="durationMinutes"
              type="number"
              min={0}
              defaultValue={5}
              className={`${field} w-24`}
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Add
          </button>
        </form>
      </section>

      <details className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <summary className="cursor-pointer text-sm font-semibold">Service details</summary>
        <div className="space-y-6 pt-5">
          <ServiceForm
            tenant={tenant}
            service={{
              slug: service.slug,
              title: service.title,
              heldOn: service.heldOn,
              startsAt: service.startsAt,
              notes: service.notes,
            }}
          />
          <form action={deleteServiceAction} className="border-t border-stone-200 pt-5 dark:border-stone-800">
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="slug" value={service.slug} />
            <button
              type="submit"
              className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
            >
              Delete this service
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
