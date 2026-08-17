import { NextResponse, type NextRequest } from "next/server";
import { authorizeService, reportPlayback } from "@/lib/live/server";

/**
 * The projector saying where the recording has actually got to.
 *
 * Passed straight to whoever is watching and never written down: it is true for
 * the second it describes and no longer, and a position read back out of a
 * database after a restart would be a confident lie about a song that stopped
 * an hour ago.
 *
 * The point of it is the remote. "Playing" there is an instruction — true from
 * the moment somebody presses Start, whether or not a machine heard it — so
 * without this the button says a song is running while the room sits in
 * silence. A number going up is the only honest proof, and this carries it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;

  const allowed = await authorizeService(serviceId);
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.error }, { status: allowed.status });
  }

  const body = (await request.json().catch(() => null)) as {
    position?: unknown;
    duration?: unknown;
  } | null;
  if (typeof body?.position !== "number") {
    return NextResponse.json({ error: "Send a position." }, { status: 400 });
  }

  reportPlayback(serviceId, {
    position: Math.max(0, body.position),
    duration: typeof body.duration === "number" && body.duration > 0 ? body.duration : 0,
  });

  return NextResponse.json({ ok: true });
}
