"use client";

import { useEffect } from "react";

/**
 * Ask the machine not to blank this screen.
 *
 * A computer running a service looks exactly like a computer nobody is using:
 * the slide has been up for four minutes because the sermon point is four
 * minutes long, and the person driving is holding an iPad across the room, so
 * no key has been pressed and no mouse has moved. Left to itself it dims, and
 * then it sleeps, in front of everybody.
 *
 * The lock is dropped by the browser whenever the tab is hidden, which is
 * correct and also means it has to be asked for again on the way back — a
 * window that spent the announcements behind something else must not come back
 * without it.
 *
 * Refusals are silent on purpose. Not every browser has this, the Mac app holds
 * the machine awake properly from the outside anyway, and there is nothing
 * useful to say to somebody standing at a projector about a permission.
 */
export function useStayAwake(): void {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    let held: WakeLockSentinel | null = null;
    let dropped = false;

    const ask = async () => {
      if (dropped || document.visibilityState !== "visible") return;
      try {
        held = await navigator.wakeLock.request("screen");
      } catch {
        // Refused, or not allowed on this page. Nothing to do about it here.
      }
    };

    void ask();
    const onVisible = () => void ask();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      dropped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void held?.release();
    };
  }, []);
}
