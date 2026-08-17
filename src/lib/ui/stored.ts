import { useCallback, useSyncExternalStore } from "react";

/**
 * A number the browser remembers — a panel width, a column size.
 *
 * Subscribed rather than read into state on mount, so the first render on the
 * server and the first in the browser agree; a layout that reads storage during
 * hydration is a mismatch waiting to happen. Adjusting one window also moves
 * the other, because the `storage` event carries it.
 */
const listeners = new Map<string, Set<() => void>>();

function notify(key: string): void {
  for (const listener of listeners.get(key) ?? []) listener();
}

export function useStoredNumber(
  key: string,
  fallback: number,
): [number, (value: number) => void] {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const forKey = listeners.get(key) ?? new Set<() => void>();
      forKey.add(onChange);
      listeners.set(key, forKey);

      const onStorage = (event: StorageEvent) => {
        if (event.key === key) onChange();
      };
      window.addEventListener("storage", onStorage);

      return () => {
        forKey.delete(onChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null,
  );

  const set = useCallback(
    (value: number) => {
      try {
        window.localStorage.setItem(key, String(Math.round(value)));
      } catch {
        // Storage blocked: the layout still moves, it just won't be remembered.
      }
      notify(key);
    },
    [key],
  );

  const parsed = raw === null ? Number.NaN : Number(raw);
  return [Number.isFinite(parsed) ? parsed : fallback, set];
}
