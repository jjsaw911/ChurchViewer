import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LiveOutput from "@/components/services/LiveOutput";
import { requireChurchAccess } from "@/lib/admin/guard";
import { getService, loadPlanItems, toPlanItems } from "@/lib/services/plan";
import { presentItems } from "@/lib/services/present";
import { playbackUrl } from "@/lib/storage";

export const metadata: Metadata = { title: "On screen" };

/**
 * The window that goes on the projector. It follows the run sheet in the other
 * window and shows nothing else — no navigation, no plan, no times.
 */
export default async function ServiceScreenPage({
  params,
}: PageProps<"/s/[tenant]/present/services/[slug]/screen">) {
  const { tenant, slug } = await params;
  // Presenting is a staff activity — the screen shows the church's own material.
  const { church } = await requireChurchAccess(tenant);

  const service = await getService(church.id, slug);
  if (!service) notFound();

  const rows = toPlanItems(await loadPlanItems(service.id));
  // With media: the sound comes out of this machine now, not the operator's.
  const items = await presentItems(rows, service.startsAt, true, service.backgroundSrc);

  return (
    <LiveOutput
      serviceId={service.id}
      serviceTitle={service.title}
      churchName={church.name}
      heldOn={service.heldOn}
      items={items}
      fallbackBackground={await playbackUrl(service.backgroundSrc)}
    />
  );
}
