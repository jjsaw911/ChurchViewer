import { redirect } from "next/navigation";
import { requireChurchAccess } from "@/lib/admin/guard";
import { currentService } from "@/lib/services/plan";
import { todayForServices } from "@/lib/services/timeline";

/**
 * The remote's standing address: whatever the church is on, right now.
 *
 * A redirect rather than a copy of the run sheet, so the address in the window
 * ends up naming the actual service — which matters the moment somebody has to
 * say out loud which one they're driving.
 */
export default async function TodayRunSheetPage({
  params,
}: PageProps<"/s/[tenant]/present/today">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const service = await currentService(church.id, todayForServices());
  // Nothing planned at all: the list, which is where a plan gets made.
  redirect(service ? `/present/services/${service.slug}` : "/admin/services");
}
