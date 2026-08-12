import { useCallback, useSyncExternalStore } from "react";
import {
  IDLE_STATE,
  NOBODY,
  isUnderstood,
  type DeviceRole,
  type DisplayMessage,
  type Envelope,
  type LiveState,
  type Playback,
  type Presence,
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
  /** Who else is on this service, as last heard from the server. */
  presence: Presence;
  /** The last thing the projector said about where the recording is. */
  heard?: Heard;
  listeners: Set<() => void>;
  source?: EventSource;
  /**
   * Changes the server never heard. Kept so that a window which lost the
   * network mid-service can say them again the moment it comes back, instead of
   * being told the old truth and dragging the projector backwards to it.
   */
  pending?: Partial<LiveState>;
};

/** A report, and when it arrived — because a stale one means silence. */
export type Heard = Playback & { at: number };

const services = new Map<string, Entry>();

function entryFor(serviceId: string): Entry {
  const existing = services.get(serviceId);
  if (existing) return existing;

  const created: Entry = { state: IDLE_STATE, presence: NOBODY, listeners: new Set() };
  services.set(serviceId, created);
  return created;
}

const same = (a: LiveState, b: LiveState) =>
  a.itemId === b.itemId &&
  a.slideIndex === b.slideIndex &&
  a.blank === b.blank &&
  a.playing === b.playing &&
  a.armedItemId === b.armedItemId &&
  a.volume === b.volume;

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
      volume: typeof parsed.volume === "number" ? parsed.volume : IDLE_STATE.volume,
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
 * The projector's report of where the recording actually is.
 *
 * Stamped on arrival rather than trusted to say when it was sent: the useful
 * question is "did we hear anything in the last second", and only the receiving
 * clock can answer that.
 */
function acceptPlayback(serviceId: string, playback: Playback): void {
  const entry = entryFor(serviceId);
  entry.heard = { ...playback, at: Date.now() };
  for (const listener of entry.listeners) listener();
}

/**
 * Take a new roll-call.
 *
 * Same identity rule as the state: an unchanged count has to keep the object it
 * already had, or a dot re-renders every time somebody's keepalive lands.
 */
function acceptPresence(serviceId: string, presence: Presence): void {
  const entry = entryFor(serviceId);
  const now = entry.presence;
  if (
    now.display === presence.display &&
    now.stage === presence.stage &&
    now.control === presence.control
  ) {
    return;
  }

  entry.presence = presence;
  for (const listener of entry.listeners) listener();
}

/**
 * Join the service, and stay joined for as long as anything is watching.
 *
 * The first subscriber opens the shared connections and seeds from storage; the
 * last one to leave closes them, which is also what tells everybody else that
 * this device has gone.
 */
function useChannel(
  serviceId: string,
  role: DeviceRole,
): (onChange: () => void) => () => void {
  return useCallback(
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
        const source = new EventSource(`/api/live/${serviceId}/stream?role=${role}`);
        source.onopen = () => flush(serviceId);
        source.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data) as Envelope<DisplayMessage>;
            if (!isUnderstood(parsed)) return;
            if (parsed.message.type === "state") accept(serviceId, parsed.message.state);
            else if (parsed.message.type === "presence") {
              acceptPresence(serviceId, parsed.message.presence);
            } else if (parsed.message.type === "playback") {
              acceptPlayback(serviceId, parsed.message.playback);
            }
          } catch {
            // A malformed frame is not worth taking the screen down for.
          }
        };
        // Our own connection has dropped, so we no longer know who is out
        // there. Saying nobody is honest; leaving the dots green would be a
        // light that means "it was fine when we last looked".
        source.onerror = () => acceptPresence(serviceId, NOBODY);
        entry.source = source;
      }

      return () => {
        window.removeEventListener("storage", onStorage);
        entry.listeners.delete(onChange);

        if (entry.listeners.size === 0) {
          entry.source?.close();
          entry.source = undefined;
          entry.presence = NOBODY;
        }
      };
    },
    [role, serviceId],
  );
}

/** What should be on screen, in any window. */
export function useLiveState(serviceId: string, role: DeviceRole = "control"): LiveState {
  return useSyncExternalStore(
    useChannel(serviceId, role),
    () => entryFor(serviceId).state,
    () => IDLE_STATE,
  );
}

/**
 * Tell everyone where the recording has got to. Sent by the display, roughly
 * once a second while something is playing.
 */
export function reportPlayback(serviceId: string, playback: Playback): void {
  void fetch(`/api/live/${serviceId}/playback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(playback),
    keepalive: true,
  }).catch(() => {
    // Missing one of these means a progress bar stutters. Nothing more.
  });
}

/**
 * The last thing the projector said, or null if it has said nothing.
 *
 * Deliberately not "is it playing" — that judgement needs the current time and
 * belongs where it is displayed, because a report from four seconds ago means
 * the room has gone quiet and the caller is the one who knows how long it is
 * willing to wait.
 */
export function useHeardPlayback(serviceId: string, role: DeviceRole = "control"): Heard | null {
  return useSyncExternalStore(
    useChannel(serviceId, role),
    () => entryFor(serviceId).heard ?? null,
    () => null,
  );
}

/**
 * Who else is connected to this service.
 *
 * Counted by the server from the streams it is holding open, which is the only
 * honest measure — a window somebody closed is a stream that ended.
 */
export function usePresence(serviceId: string, role: DeviceRole = "control"): Presence {
  return useSyncExternalStore(
    useChannel(serviceId, role),
    () => entryFor(serviceId).presence,
    () => NOBODY,
  );
}
