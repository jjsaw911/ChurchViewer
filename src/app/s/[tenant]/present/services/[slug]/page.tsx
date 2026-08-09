import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LiveControl from "@/components/services/LiveControl";
import { requireChurchAccess } from "@/lib/admin/guard";
import { getService, loadPlanItems, toPlanItems } from "@/lib/services/plan";
import { presentItems } from "@/lib/services/present";
import { formatTimeOfDay, layoutPlan, parseTimeOfDay } from "@/lib/services/timeline";

export const metadata: Metadata = { title: "Run sheet" };

/** What the person running the service works from on the day. */
export default async function RunSheetPage({
  params,
}: PageProps<"/s/[tenant]/present/services/[slug]">) {
  const { tenant, slug } = await params;
  const { church } = await requireChurchAccess(tenant);

  const service = await getService(church.id, slug);
  if (!service) notFound();

  const rows = toPlanItems(await loadPlanItems(service.id));
  const plan = layoutPlan(rows, service.startsAt);
  // Flat, in the order it runs — a worship set immediately followed by its songs.
  const items = await presentItems(rows, service.startsAt);

  return (
    <div className="space-y-8">
      <header className="space-y-2 border-b border-stone-200 pb-6 dark:border-stone-800">
        <Link
          href={`/admin/services/${service.slug}`}
          className="text-sm text-stone-500 hover:underline"
        >
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
          &middot; {formatTimeOfDay(parseTimeOfDay(service.startsAt) ?? 0)} &ndash;{" "}
          {formatTimeOfDay(plan.endMinutes)} ({Math.round(plan.endMinutes - plan.startMinutes)}{" "}
          min)
        </p>
        {service.notes ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">{service.notes}</p>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="text-stone-500">Nothing planned yet.</p>
      ) : (
        <LiveControl
          serviceId={service.id}
          serviceTitle={service.title}
          slug={service.slug}
          items={items}
        />
      )}
    </div>
  );
}
