import { EventEmitter } from "node:events";
import { NOBODY, type DeviceRole, type Presence } from "@/lib/live/protocol";

/**
 * Who is connected to each service, counted from the streams held open.
 *
 * One entry per open stream rather than per machine, because that is what can
 * actually be observed: a browser window somebody closed is a stream that
 * ended, and a Mac that lost its wifi is a stream that stopped. Both mean the
 * same thing to the person looking at the light — that end isn't there.
 *
 * In-process, like the state bus beside it, and wrong in the same way the day
 * this runs as two Node processes: each would count only its own half. The fix
 * then is the same fix — move the fan-out to Postgres `LISTEN/NOTIFY`.
 */
const globalForPresence = globalThis as unknown as {
  livePresenceBus?: EventEmitter;
  livePresence?: Map<string, Map<number, DeviceRole>>;
  livePresenceNext?: number;
};

const bus = (globalForPresence.livePresenceBus ??= new EventEmitter());
// A busy Sunday is a projector, a stage screen, and a couple of operators.
bus.setMaxListeners(50);

const attendance: Map<string, Map<number, DeviceRole>> = (globalForPresence.livePresence ??=
  new Map());

const channel = (serviceId: string) => `presence:${serviceId}`;

export function presenceOf(serviceId: string): Presence {
  const counts: Presence = { ...NOBODY };
  for (const role of attendance.get(serviceId)?.values() ?? []) counts[role] += 1;
  return counts;
}

/** Register an open stream. Returns the way to say it has gone. */
export function joinService(serviceId: string, role: DeviceRole): () => void {
  const id = (globalForPresence.livePresenceNext = (globalForPresence.livePresenceNext ?? 0) + 1);

  const service = attendance.get(serviceId) ?? new Map<number, DeviceRole>();
  service.set(id, role);
  attendance.set(serviceId, service);
  bus.emit(channel(serviceId), presenceOf(serviceId));

  let gone = false;
  return () => {
    // Aborts can arrive more than once, and counting a departure twice would
    // put the light out while the device is still sitting there connected.
    if (gone) return;
    gone = true;

    service.delete(id);
    if (service.size === 0) attendance.delete(serviceId);
    bus.emit(channel(serviceId), presenceOf(serviceId));
  };
}

/** Listen for devices arriving and leaving. Returns the unsubscribe. */
export function watchPresence(
  serviceId: string,
  onChange: (presence: Presence) => void,
): () => void {
  bus.on(channel(serviceId), onChange);
  return () => bus.off(channel(serviceId), onChange);
}
