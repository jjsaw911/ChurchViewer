import { useSyncExternalStore } from "react";

/**
 * The wall clock, for the displays that have to answer "are we running late?".
 *
 * Subscribed rather than kept in state so the first render on the server and
 * the first in the browser agree — a clock rendered during SSR is a hydration
 * mismatch waiting to happen, which is why the server snapshot is null and the
 * views draw a placeholder until it ticks.
 */
function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, 1000);
  return () => clearInterval(timer);
}

/** Whole seconds since the epoch, or null before the browser has taken over. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / 1000),
    () => null,
  );
}

/** `9:07 AM` from what `useNow` gives back. */
export function formatClock(seconds: number): string {
  return new Date(seconds * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
