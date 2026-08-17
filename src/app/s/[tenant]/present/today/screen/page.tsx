import type { Metadata } from "next";
import LiveOutput from "@/components/services/LiveOutput";
import { requireChurchAccess } from "@/lib/admin/guard";
import { currentService, loadPlanItems, toPlanItems } from "@/lib/services/plan";
import { presentItems } from "@/lib/services/present";
import { resolveBackground } from "@/lib/media/background";
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

  // No plan yet, and still a room with people arriving in it. The same banner,
  // with today's date — never an error, never a page.
  if (!service) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black px-12 text-center text-white">
        <h1 className="text-6xl font-semibold tracking-tight text-balance sm:text-7xl lg:text-8xl">
          {church.name}
        </h1>
        <p className="text-2xl font-medium text-white/70 sm:text-3xl">
          {new Date(`${todayForServices()}T00:00:00Z`).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}
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
      churchName={church.name}
      heldOn={service.heldOn}
      items={items}
      fallbackBackground={await resolveBackground(service.backgroundSrc)}
    />
  );
}
