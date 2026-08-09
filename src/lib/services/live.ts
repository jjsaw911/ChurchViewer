import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * What's on the screen right now, and how the two windows agree about it.
 *
 * Running a service takes two displays: the operator's, and the one the room
 * can see. They're two windows of one browser, so the state moves through
 * `localStorage` and the `storage` event it fires in every *other* window of
 * the same origin. Nothing goes near the server — a projector that goes blank
 * because the wifi dropped is not a projector — and because the state is
 * written down rather than sent, a window that opens late, or reloads mid
 * service, comes straight back up on the right slide.
 */

export type LiveState = {
  /** The activity being shown, or null when nothing is. */
  itemId: string | null;
  slideIndex: number;
  /** A deliberate blank — the operator's "not this, not yet". */
  blank: boolean;
};

export const IDLE: LiveState = { itemId: null, slideIndex: 0, blank: false };

const storageKey = (serviceId: string) => `churchviewer:live:${serviceId}`;

/**
 * Windows in this browser tab tree that want to know about our own writes.
 * The `storage` event deliberately doesn't fire in the window that wrote, so
 * the control window would never see its own change without this.
 */
const listeners = new Map<string, Set<() => void>>();

function notify(serviceId: string): void {
  for (const listener of listeners.get(serviceId) ?? []) listener();
}

function read(serviceId: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(serviceId));
  } catch {
    // Storage blocked: presenting still works, it just doesn't carry between
    // windows or survive a reload.
    return null;
  }
}

export function publishLive(serviceId: string, state: LiveState): void {
  try {
    window.localStorage.setItem(storageKey(serviceId), JSON.stringify(state));
  } catch {
    // Same again — this is the transport, but a failure here is not worth
    // taking the operator's screen down for.
  }
  notify(serviceId);
}

function parse(raw: string | null): LiveState {
  if (!raw) return IDLE;
  try {
    const parsed = JSON.parse(raw) as Partial<LiveState>;
    if (typeof parsed.slideIndex !== "number") return IDLE;
    return {
      itemId: typeof parsed.itemId === "string" ? parsed.itemId : null,
      slideIndex: parsed.slideIndex,
      blank: parsed.blank === true,
    };
  } catch {
    return IDLE;
  }
}

/**
 * What should be on screen, in either window.
 *
 * Subscribed rather than held in state, so both windows read one value: what
 * the control window last published.
 */
export function useLiveState(serviceId: string): LiveState {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const forService = listeners.get(serviceId) ?? new Set<() => void>();
      forService.add(onChange);
      listeners.set(serviceId, forService);

      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey(serviceId)) onChange();
      };
      window.addEventListener("storage", onStorage);

      return () => {
        forService.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [serviceId],
  );

  // The raw string is the snapshot: it's stable by value, where a fresh parsed
  // object every render would tell React the store changed on every check.
  const raw = useSyncExternalStore(
    subscribe,
    () => read(serviceId),
    () => null,
  );

  return useMemo(() => parse(raw), [raw]);
}
