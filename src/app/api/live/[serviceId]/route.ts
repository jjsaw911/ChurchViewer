import { NextResponse, type NextRequest } from "next/server";
import { authorizeService, readLiveState, writeLiveState } from "@/lib/live/server";
import { PROTOCOL_VERSION, type LiveState } from "@/lib/live/protocol";

/**
 * What's on the screen, for anything that isn't the browser window that set it.
 *
 * The web app moves this between its own windows through `localStorage`, which
 * costs nothing and works offline; this is the same state where a second
 * machine can reach it — the Mac driving the projector today, the iPad driving
 * the Mac later.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;

  const allowed = await authorizeService(serviceId);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.status });
  }

  return NextResponse.json({ version: PROTOCOL_VERSION, state: await readLiveState(serviceId) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;

  const allowed = await authorizeService(serviceId);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.status });
  }

  const body = (await request.json().catch(() => null)) as Partial<LiveState> | null;
  if (!body || typeof body.slideIndex !== "number") {
    return NextResponse.json({ error: "Send itemId, slideIndex and blank." }, { status: 400 });
  }

  const state: LiveState = {
    itemId: typeof body.itemId === "string" ? body.itemId : null,
    slideIndex: Math.max(0, Math.round(body.slideIndex)),
    blank: body.blank === true,
    playing: body.playing === true,
    armedItemId: typeof body.armedItemId === "string" ? body.armedItemId : null,
  };

  await writeLiveState(serviceId, state);
  return NextResponse.json({ ok: true, state });
}
