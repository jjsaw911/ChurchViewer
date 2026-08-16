"use client";

import { useEffect } from "react";

/**
 * Telling the app around this page what is actually true.
 *
 * The remote's buttons are native, along the bottom, because they have to stay
 * put while the list above them scrolls. The cost of that is they know nothing:
 * Blank was a button that changed no colour whatever it did, so the only way to
 * find out whether a press had landed was to look at the screen across the
 * room — and if it hadn't landed, it looked exactly like a button that does
 * nothing.
 *
 * So the page says. One message whenever the answer changes, and the bar can
 * show Stop while a song runs and light up while the screen is blanked.
 *
 * Nothing here is required: in an ordinary browser the handler doesn't exist
 * and this does nothing at all.
 */
export type NativeStatus = {
  blank: boolean;
  playing: boolean;
  /** Whether the thing on screen has a recording, so Play means anything. */
  canPlay: boolean;
};

type Bridged = {
  /** The iPhone and iPad app. */
  webkit?: { messageHandlers?: { live?: { postMessage: (message: NativeStatus) => void } } };
  /** The Android one. Its bridge takes plain values rather than an object. */
  ChurchViewerAndroid?: { status: (blank: boolean, playing: boolean, canPlay: boolean) => void };
};

export function useNativeStatus(status: NativeStatus): void {
  const { blank, playing, canPlay } = status;

  useEffect(() => {
    const host = window as unknown as Bridged;

    try {
      host.webkit?.messageHandlers?.live?.postMessage({ blank, playing, canPlay });
      host.ChurchViewerAndroid?.status(blank, playing, canPlay);
    } catch {
      // An older build of either app, without the bridge. The buttons still
      // work; they just can't show what they did.
    }
  }, [blank, playing, canPlay]);
}
