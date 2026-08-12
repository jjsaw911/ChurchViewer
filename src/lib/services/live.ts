import { useCallback, useSyncExternalStore } from "react";
import {
  IDLE_STATE,
  isUnderstood,
  type DisplayMessage,
  type Envelope,
  type LiveState,
} from "@/lib/live/protocol";

export type { LiveState };
export const IDLE = IDLE_STATE;

/**
 * What's on the screen, and how every window agrees about it.
 *
 * Two transports, on purpose:
 *
 * `localStorage` carries it between windows of one browser. It's instant, it
 * costs nothing, and it works with the network unplugged — which is the case
 * that matters most, because it's the laptop driving the projector talking to
 * itself.
 *
 * The server carries it everywhere else: the Mac at the church, a second
 * operator's laptop, the iPad in time. Slower by a network hop, and the one
 * that makes more than one machine possible at all.
 *
 * Both feed one in-memory value per service. A window that hears the same
 * change twice does nothing the second time, because nothing changed.
 */

type Entry = {
  state: LiveState;
  listeners: Set<() => void>;
  source?: EventSource;
  /**
   * Changes the server never heard. Kept so that a window which lost the
   * network mid-service can say them again the moment it comes back, instead of
   * being told the old truth and dragging the projector backwards to it.
   */
  pending?: Partial<LiveState>;
};

const services = new Map<string, Entry>();

function entryFor(serviceId: string): Entry {
  const existing = services.get(serviceId);
  if (existing) return existing;

  const created: Entry = { state: IDLE_STATE, listeners: new Set() };
  services.set(serviceId, created);
  return created;
}

const same = (a: LiveState, b: LiveState) =>
  a.itemId === b.itemId &&
  a.slideIndex === b.slideIndex &&
  a.blank === b.blank &&
  a.playing === b.playing &&
  a.armedItemId === b.armedItemId;

/**
 * Take a new value from wherever it came from.
 *
 * The identity of the object is the snapshot React compares, so an unchanged
 * state must keep the object it already had or every window re-renders on every
 * keepalive.
 */
function accept(serviceId: string, state: LiveState): void {
  const entry = entryFor(serviceId);
  if (same(entry.state, state)) return;

  entry.state = state;
  for (const listener of entry.listeners) listener();
}

const storageKey = (serviceId: string) => `churchviewer:live:${serviceId}`;

function parse(raw: string | null): LiveState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LiveState>;
    if (typeof parsed.slideIndex !== "number") return null;
    return {
      itemId: typeof parsed.itemId === "string" ? parsed.itemId : null,
      slideIndex: parsed.slideIndex,
      blank: parsed.blank === true,
      playing: parsed.playing === true,
      armedItemId: typeof parsed.armedItemId === "string" ? parsed.armedItemId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Change what is on the screen.
 *
 * Takes only the fields that are changing. The server leaves the rest alone,
 * so the display saying "slide 7" while a song plays cannot undo the Blank the
 * operator pressed a moment earlier.
 */
export function publishLive(serviceId: string, patch: Partial<LiveState>): void {
  const state: LiveState = { ...entryFor(serviceId).state, ...patch };
  accept(serviceId, state);

  try {
    window.localStorage.setItem(storageKey(serviceId), JSON.stringify(state));
  } catch {
    // Storage blocked. The screen still changes; it just isn't remembered.
  }

  send(serviceId, patch);
}

/**
 * Tell the server, and remember if it didn't hear.
 *
 * Offline, or the server is having a moment: the window in front of the
 * operator and the projector beside it are already right, and what was missed
 * is held until the stream comes back.
 */
function send(serviceId: string, patch: Partial<LiveState>): void {
  void fetch(`/api/live/${serviceId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
    keepalive: true,
  })
    .then((response) => {
      if (!response.ok) hold(serviceId, patch);
    })
    .catch(() => hold(serviceId, patch));
}

function hold(serviceId: string, patch: Partial<LiveState>): void {
  const entry = entryFor(serviceId);
  entry.pending = { ...entry.pending, ...patch };
}

/**
 * Say the missed changes again, on reconnecting.
 *
 * Without this, a reconnect is the server telling a window what was true before
 * it dropped — and the projector, obediently, going back to it mid-song.
 */
function flush(serviceId: string): void {
  const entry = entryFor(serviceId);
  const patch = entry.pending;
  if (!patch) return;

  entry.pending = undefined;
  send(serviceId, patch);
}

/**
 * What should be on screen, in any window.
 *
 * The first subscriber for a service opens the shared connections and seeds
 * from storage; the last one to leave closes them.
 */
export function useLiveState(serviceId: string): LiveState {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const entry = entryFor(serviceId);
      const first = entry.listeners.size === 0;
      entry.listeners.add(onChange);

      const onStorage = (event: StorageEvent) => {
        if (event.key !== storageKey(serviceId)) return;
        const state = parse(event.newValue);
        if (state) accept(serviceId, state);
      };
      window.addEventListener("storage", onStorage);

      if (first) {
        // What this browser last knew, before the network is asked anything.
        const stored = parse(window.localStorage.getItem(storageKey(serviceId)));
        if (stored) accept(serviceId, stored);

        // EventSource reconnects by itself, which is the whole reason for it:
        // a projector that dropped its wifi for ten seconds must come back
        // without anybody noticing.
        const source = new EventSource(`/api/live/${serviceId}/stream`);
        source.onopen = () => flush(serviceId);
        source.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as Envelope<DisplayMessage>;
            if (!isUnderstood(parsed)) return;
            if (parsed.message.type === "state") accept(serviceId, parsed.message.state);
          } catch {
            // A malformed frame is not worth taking the screen down for.
          }
        };
        entry.source = source;
      }

      return () => {
        window.removeEventListener("storage", onStorage);
        entry.listeners.delete(onChange);

        if (entry.listeners.size === 0) {
          entry.source?.close();
          entry.source = undefined;
        }
      };
    },
    [serviceId],
  );

  return useSyncExternalStore(
    subscribe,
    () => entryFor(serviceId).state,
    () => IDLE_STATE,
  );
}
