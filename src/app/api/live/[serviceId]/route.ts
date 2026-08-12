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
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Send what changed." }, { status: 400 });
  }

  /**
   * Only what was sent is changed. The rest is left as it is.
   *
   * This matters more than it looks. While a song plays, the display posts the
   * slide it has reached several times a minute; if that carried a whole state,
   * every one of those would overwrite whatever the operator did in between —
   * pressing Blank mid-song would be undone a quarter of a second later. Now
   * the display says "slide 7" and means only that.
   */
  const current = await readLiveState(serviceId);

  const state: LiveState = {
    itemId: "itemId" in body ? (typeof body.itemId === "string" ? body.itemId : null) : current.itemId,
    slideIndex:
      typeof body.slideIndex === "number"
        ? Math.max(0, Math.round(body.slideIndex))
        : current.slideIndex,
    blank: typeof body.blank === "boolean" ? body.blank : current.blank,
    playing: typeof body.playing === "boolean" ? body.playing : current.playing,
    armedItemId:
      "armedItemId" in body
        ? typeof body.armedItemId === "string"
          ? body.armedItemId
          : null
        : current.armedItemId,
    volume:
      typeof body.volume === "number"
        ? Math.min(100, Math.max(0, Math.round(body.volume)))
        : current.volume,
  };

  await writeLiveState(serviceId, state);
  return NextResponse.json({ ok: true, state });
}
