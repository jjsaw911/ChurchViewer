import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StageDisplay from "@/components/services/StageDisplay";
import { requireChurchAccess } from "@/lib/admin/guard";
import { getService, loadPlanItems, toPlanItems } from "@/lib/services/plan";
import { presentItems } from "@/lib/services/present";

export const metadata: Metadata = { title: "Stage" };

/**
 * The confidence monitor: what's up, what's next, the notes, and the clock.
 * Follows whatever the run sheet window is showing.
 */
export default async function StagePage({
  params,
}: PageProps<"/s/[tenant]/present/services/[slug]/stage">) {
  const { tenant, slug } = await params;
  const { church } = await requireChurchAccess(tenant);

  const service = await getService(church.id, slug);
  if (!service) notFound();

  const rows = toPlanItems(await loadPlanItems(service.id));
  // No recording is played here, so there's no reason to sign audio URLs.
  const items = await presentItems(rows, service.startsAt, false);

  return (
    <StageDisplay serviceId={service.id} serviceTitle={service.title} items={items} />
  );
}
