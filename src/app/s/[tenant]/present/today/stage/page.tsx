import type { Metadata } from "next";
import StageDisplay from "@/components/services/StageDisplay";
import { requireChurchAccess } from "@/lib/admin/guard";
import { currentService, loadPlanItems, toPlanItems } from "@/lib/services/plan";
import { presentItems } from "@/lib/services/present";
import { todayForServices } from "@/lib/services/timeline";

export const metadata: Metadata = { title: "Stage" };

/**
 * The confidence monitor, on the same standing address as the projector. Set
 * up once; it finds the right service every week by itself.
 */
export default async function TodayStagePage({
  params,
}: PageProps<"/s/[tenant]/present/today/stage">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const service = await currentService(church.id, todayForServices());

  if (!service) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <p className="text-sm tracking-[0.2em] text-white/30 uppercase">Nothing planned</p>
      </div>
    );
  }

  const rows = toPlanItems(await loadPlanItems(service.id));
  // No recording is played here, so there's no reason to sign audio URLs.
  const items = await presentItems(rows, service.startsAt, false);

  return <StageDisplay serviceId={service.id} serviceTitle={service.title} items={items} />;
}
