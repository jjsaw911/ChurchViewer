import { NextResponse, type NextRequest } from "next/server";
import { askReload, authorizeService } from "@/lib/live/server";

/**
 * Start the screens again from scratch.
 *
 * The repair that fixes nearly everything — a page that lost its audio device
 * when somebody's headphones wandered off to a phone, a window still running
 * last week's version — and the one nobody can perform, because the machine it
 * has to happen on is across the room behind a projector.
 *
 * Only screens act on it. A remote reloading itself mid-service would take the
 * controls out of the hand of the person holding it.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;

  const allowed = await authorizeService(serviceId);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.status });
  }

  askReload(serviceId);
  return NextResponse.json({ ok: true });
}
