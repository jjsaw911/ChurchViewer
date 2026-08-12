import type { Metadata } from "next";
import LiveOutput from "@/components/services/LiveOutput";
import { requireChurchAccess } from "@/lib/admin/guard";
import { currentService, loadPlanItems, toPlanItems } from "@/lib/services/plan";
import { presentItems } from "@/lib/services/present";
import { playbackUrl } from "@/lib/storage";
import { todayForServices } from "@/lib/services/timeline";

export const metadata: Metadata = { title: "On screen" };

/**
 * The projector's address, for good.
 *
 * The machine at the back of the room is set up once and then switched on every
 * week by whoever unlocks the building. Pointing it at one service means
 * somebody has to go and change it every Sunday, and the Sunday they forget is
 * the Sunday the screen shows last week's songs — so this asks for no date at
 * all and finds the service the church is on.
 */
export default async function TodayScreenPage({
  params,
}: PageProps<"/s/[tenant]/present/today/screen">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const service = await currentService(church.id, todayForServices());

  // Black, and nothing else. A "no service planned" page is still a page, and
  // this window is pointed at a congregation.
  if (!service) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <p className="text-[0.6rem] tracking-[0.2em] text-white/10 uppercase">
          {church.name} · nothing planned
        </p>
      </div>
    );
  }

  const rows = toPlanItems(await loadPlanItems(service.id));
  // With media: the sound comes out of this machine, not the operator's.
  const items = await presentItems(rows, service.startsAt, true, service.backgroundSrc);

  return (
    <LiveOutput
      serviceId={service.id}
      serviceTitle={service.title}
      items={items}
      fallbackBackground={await playbackUrl(service.backgroundSrc)}
    />
  );
}
