import type { NextRequest } from "next/server";
import { joinService, presenceOf, watchPresence } from "@/lib/live/presence";
import { authorizeService, readLiveState, watchLiveState } from "@/lib/live/server";
import { envelope, type DeviceRole, type DisplayMessage } from "@/lib/live/protocol";

/**
 * The live channel: server-sent events, one stream per watcher.
 *
 * SSE rather than a WebSocket because the traffic only goes one way — a display
 * is told what to show and never argues — and because a plain HTTP response
 * survives the proxy in front of this app without any configuration, reconnects
 * on its own, and needs no client library at all.
 *
 * A projector cannot afford this to be sleepy, so the process is deliberately
 * kept awake.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Idle proxies close a quiet connection; a comment every 25s keeps it open. */
const KEEPALIVE_MS = 25_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;

  // What this connection is: the projector, the stage monitor, or somebody
  // driving. Anything unrecognised counts as a driver, which is the harmless
  // answer — an extra remote in the count, never a projector that isn't there.
  const asked = request.nextUrl.searchParams.get("role");
  const role: DeviceRole =
    asked === "display" || asked === "stage" || asked === "control" ? asked : "control";

  const allowed = await authorizeService(serviceId);
  if (!allowed.ok) {
    return new Response(allowed.error, { status: allowed.status });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: DisplayMessage) => {
        try {
          const payload = envelope(serviceId, message, Date.now());
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // The watcher went away between the check and the write; the abort
          // handler below is what actually cleans up.
        }
      };

      // Whoever just connected gets the current state before anything else, so
      // a display switched on mid-service comes up on the right slide.
      send({ type: "state", state: await readLiveState(serviceId), serviceId });

      const unwatch = watchLiveState(serviceId, (state) =>
        send({ type: "state", state, serviceId }),
      );

      // Joining is itself news: the operator's dot for the projector turns
      // green the moment the projector's window opens, and everyone including
      // this connection is told who is now here.
      const leave = joinService(serviceId, role);
      const unwatchPresence = watchPresence(serviceId, (presence) =>
        send({ type: "presence", presence, serviceId }),
      );
      send({ type: "presence", presence: presenceOf(serviceId), serviceId });

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Same as above.
        }
      }, KEEPALIVE_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        unwatch();
        unwatchPresence();
        leave();
        try {
          controller.close();
        } catch {
          // Already closed by the disconnect itself.
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // nginx buffers proxied responses by default, which would hold every
      // slide change until the buffer filled — which is to say, until after
      // it mattered.
      "x-accel-buffering": "no",
    },
  });
}
