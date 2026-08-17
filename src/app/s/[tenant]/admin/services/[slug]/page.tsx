import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { songs } from "@/db/schema";
import ServiceForm from "@/components/services/ServiceForm";
import ServicePlanner from "@/components/services/ServicePlanner";
import SongDrop from "@/components/songs/SongDrop";
import SplitPane from "@/components/ui/SplitPane";
import { deleteServiceAction } from "@/lib/services/actions";
import { requireChurchAccess } from "@/lib/admin/guard";
import {
  getService,
  loadPlanItems,
  slideSources,
  toPlanItems,
  withAttachments,
} from "@/lib/services/plan";
import { formatTimeOfDay, layoutPlan, parseTimeOfDay } from "@/lib/services/timeline";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Service plan" };

export default async function ServicePlanPage({
  params,
  searchParams,
}: PageProps<"/s/[tenant]/admin/services/[slug]">) {
  const { tenant, slug } = await params;
  const { church } = await requireChurchAccess(tenant);

  const service = await getService(church.id, slug);
  if (!service) notFound();

  const items = await withAttachments(
    toPlanItems(await loadPlanItems(service.id)),
    service.backgroundSrc,
  );

  const [songOptions, sources] = await Promise.all([
    db
      .select({ id: songs.id, title: songs.title })
      .from(songs)
      .where(eq(songs.churchId, church.id))
      .orderBy(asc(songs.title)),
    slideSources(church.id, service.id),
  ]);

  const plan = layoutPlan(items, service.startsAt);

  // Arrived by asking for a plan on a day that already had one.
  const { already } = await searchParams;

  return (
    <div className="space-y-10">
      {/* Somebody asked for a plan on a day that already had one, and this is
          it. Said plainly, because the alternative — quietly making a second
          empty plan for the same Sunday — ends with the projector finding one
          of them and nobody able to say which. */}
      {already ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          There was already a plan for that day, so here it is. If you really are holding a
          second service that day, use{" "}
          <strong>Another service that day</strong> on the Plans page.
        </p>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Link href="/admin/services" className="text-sm text-stone-500 hover:underline">
            &larr; Plans
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
            &middot; {formatTimeOfDay(parseTimeOfDay(service.startsAt) ?? 0)} &ndash;{" "}
            {formatTimeOfDay(plan.endMinutes)}
            {items.length
              ? ` · ${Math.round(plan.endMinutes - plan.startMinutes)} min`
              : ""}
          </p>
        </div>
        <Link
          href={`/present/services/${service.slug}`}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Run it
        </Link>
      </header>

      <SplitPane
        storageKey="churchviewer:planner-panel"
        panel={
          <section className="space-y-3 lg:pl-2">
            <div>
              <h2 className="font-semibold">Recordings</h2>
              <p className="text-sm text-stone-500">
                Drop this week&apos;s video or audio here. Each one becomes a song with slides,
                ready to drop into the order beside it.
              </p>
            </div>
            <SongDrop tenant={tenant} uploadsEnabled={env.storage.isConfigured} />
          </section>
        }
      >
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Running order</h2>
            <p className="text-sm text-stone-500">Click a time to add what happens then.</p>
          </div>
          <ServicePlanner
            tenant={tenant}
            serviceId={service.id}
            serviceSlug={service.slug}
            serviceStartsAt={service.startsAt}
            items={items}
            songOptions={songOptions}
            slideSources={sources}
            uploadsEnabled={env.storage.isConfigured}
            screenAspect={service.screenAspect}
          />
        </section>
      </SplitPane>

      <details className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <summary className="cursor-pointer text-sm font-semibold">Service details</summary>
        <div className="space-y-6 pt-5">
          <ServiceForm
            tenant={tenant}
            uploadsEnabled={env.storage.isConfigured}
            service={{
              slug: service.slug,
              title: service.title,
              heldOn: service.heldOn,
              startsAt: service.startsAt,
              backgroundSrc: service.backgroundSrc,
              screenAspect: service.screenAspect,
              notes: service.notes,
            }}
          />
          <form
            action={deleteServiceAction}
            className="border-t border-stone-200 pt-5 dark:border-stone-800"
          >
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
