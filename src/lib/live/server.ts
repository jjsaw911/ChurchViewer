import { EventEmitter } from "node:events";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { liveStates, services } from "@/db/schema";
import { resolveAccess } from "@/lib/admin/guard";
import { getSessionUser } from "@/lib/auth/session";
import { IDLE_STATE, type LiveState, type Playback } from "@/lib/live/protocol";

/**
 * The live state, held where more than one machine can see it.
 *
 * Two halves: a row, so a display switched on late comes up on the right slide,
 * and an emitter, so one already watching hears about a change in the time it
 * takes to write it down rather than the time it takes to poll.
 *
 * The emitter is in-process, which is exactly right for one app process on one
 * VM and quietly wrong the day there are two. If this ever runs behind more
 * than one Node process, the fan-out has to move to Postgres `LISTEN/NOTIFY`;
 * the shape of everything else stays as it is.
 */
const globalForLive = globalThis as unknown as { liveBus?: EventEmitter };

// Next re-evaluates modules on every change in development; without this each
// reload would strand the listeners attached to the previous emitter.
const bus = (globalForLive.liveBus ??= new EventEmitter());
// A busy Sunday is one display, a stage screen, and a couple of operators.
bus.setMaxListeners(50);

const channel = (serviceId: string) => `live:${serviceId}`;

export async function readLiveState(serviceId: string): Promise<LiveState> {
  const [row] = await db
    .select()
    .from(liveStates)
    .where(eq(liveStates.serviceId, serviceId))
    .limit(1);

  if (!row) return IDLE_STATE;
  return {
    itemId: row.itemId,
    slideIndex: row.slideIndex,
    blank: row.blank,
    playing: row.playing,
    armedItemId: row.armedItemId,
    volume: row.volume,
  };
}

export async function writeLiveState(serviceId: string, state: LiveState): Promise<void> {
  await db
    .insert(liveStates)
    .values({
      serviceId,
      itemId: state.itemId,
      slideIndex: state.slideIndex,
      blank: state.blank,
      playing: state.playing,
      armedItemId: state.armedItemId,
      volume: state.volume,
    })
    .onConflictDoUpdate({
      target: liveStates.serviceId,
      set: {
        itemId: state.itemId,
        slideIndex: state.slideIndex,
        blank: state.blank,
        playing: state.playing,
        armedItemId: state.armedItemId,
        volume: state.volume,
        updatedAt: new Date(),
      },
    });

  bus.emit(channel(serviceId), state);
}

/**
 * Where the recording has actually got to, passed straight through.
 *
 * Never written down. It is only true for the second it describes, and a
 * position read back from a database after a restart would be a lie about a
 * song that stopped an hour ago.
 */
const playbackChannel = (serviceId: string) => `playback:${serviceId}`;

export function reportPlayback(serviceId: string, playback: Playback): void {
  bus.emit(playbackChannel(serviceId), playback);
}

export function watchPlayback(
  serviceId: string,
  onReport: (playback: Playback) => void,
): () => void {
  bus.on(playbackChannel(serviceId), onReport);
  return () => bus.off(playbackChannel(serviceId), onReport);
}

/** Listen for changes to one service. Returns the unsubscribe. */
export function watchLiveState(
  serviceId: string,
  onChange: (state: LiveState) => void,
): () => void {
  bus.on(channel(serviceId), onChange);
  return () => bus.off(channel(serviceId), onChange);
}

/**
 * Whether this request may see or drive this service.
 *
 * Presenting is staff work — the same rule as the pages, checked again here
 * because an API route is a public endpoint however it was reached.
 */
export async function authorizeService(
  serviceId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(serviceId)) {
    return { ok: false, status: 400, error: "That isn't a service id." };
  }

  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Sign in first." };

  const [service] = await db
    .select({ churchId: services.churchId })
    .from(services)
    .where(and(eq(services.id, serviceId)))
    .limit(1);
  if (!service) return { ok: false, status: 404, error: "Unknown service." };

  const access = await resolveAccess(user, service.churchId);
  if (!access) return { ok: false, status: 403, error: "Not your church." };

  return { ok: true };
}
