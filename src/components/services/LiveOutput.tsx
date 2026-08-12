"use client";

import { useEffect, useMemo, useRef } from "react";
import { publishLive, useLiveState } from "@/lib/services/live";
import { slideAt } from "@/lib/songs/slides";
import type { LiveState } from "@/lib/live/protocol";
import type { PresentItem } from "@/lib/services/present";

/**
 * Playing the recording, here, on the machine wired to the sound system.
 *
 * The operator's phone says start; this is what starts. And because the slides
 * are timed against this audio, the display works out which one is up and
 * publishes it — while a song plays, the machine holding the recording knows
 * where the service is, and everything else follows it.
 */
function usePlayback(serviceId: string, state: LiveState, item: PresentItem | null): void {
  const audio = useRef<HTMLAudioElement | null>(null);
  const slide = useRef(state.slideIndex);
  const latest = useRef(state);

  useEffect(() => {
    slide.current = state.slideIndex;
    latest.current = state;
  }, [state]);

  const url = item?.followable ? item.audioUrl : null;
  const slides = item?.slides;
  const offset = item?.timingOffsetMs ?? 0;

  useEffect(() => {
    if (!state.playing || !url || !slides) return;

    const element = new Audio(url);
    audio.current = element;

    const follow = () => {
      const index = slideAt(slides, element.currentTime * 1000, offset);
      if (index < 0 || index === slide.current) return;
      slide.current = index;
      publishLive(serviceId, { ...latest.current, slideIndex: index, playing: true });
    };

    const timer = setInterval(follow, 250);

    // Autoplay is refused until a window has been interacted with. The Mac app
    // allows it outright; a browser window needs one click first.
    void element.play().catch(() => undefined);

    return () => {
      clearInterval(timer);
      element.pause();
      audio.current = null;
    };
    // Not the whole state: re-running on every slide change would restart the
    // song from the top each time it turned a page.
  }, [serviceId, state.playing, url, slides, offset]);
}

/**
 * F fills the screen, F again gives it back.
 *
 * The window is dragged onto a projector and then wants to lose its title bar,
 * and the person doing that is standing at the back of a room — so it's one key
 * on the window itself rather than something to find in a menu.
 */
export function useFullscreenKey(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      event.preventDefault();

      if (document.fullscreenElement) void document.exitFullscreen?.();
      else void document.documentElement.requestFullscreen?.();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

/**
 * The screen the room sees. Nothing but the slide.
 *
 * It holds every slide in the service already, so what passes between the
 * windows is only ever "item X, slide 3" — small enough that changing slides
 * can't be the slow part, and enough that a reload puts the same words back up.
 */
export default function LiveOutput({
  serviceId,
  serviceTitle,
  items,
  /** The service's background, for the stretches when nothing is live. */
  fallbackBackground = null,
}: {
  serviceId: string;
  serviceTitle: string;
  items: PresentItem[];
  fallbackBackground?: string | null;
}) {
  const state = useLiveState(serviceId);
  useFullscreenKey();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const playing = state.itemId ? byId.get(state.itemId) : undefined;

  usePlayback(serviceId, state, playing ?? null);

  const item = state.itemId ? byId.get(state.itemId) : undefined;
  const slide = state.blank ? null : item?.slides[state.slideIndex];
  // A picture with nothing written over it is the whole slide.
  const picture =
    !state.blank && !slide && item?.attachment?.kind === "image" ? item.attachment.url : null;

  if (picture) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        {/* Signed bucket URLs rotate every few hours, so there's nothing for
            next/image to optimise or cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={picture} alt="" className="max-h-full max-w-full object-contain" />
      </div>
    );
  }

  // Blanking means black. A background showing through would be a screen that
  // still has something on it, which is the opposite of what was asked for.
  const background = state.blank ? null : (item?.backgroundUrl ?? fallbackBackground);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-12 text-white">
      {background ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={background}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          {/* Words first: a photograph is rarely dark enough on its own, and a
              line nobody at the back can read is worse than no picture. */}
          <div className="pointer-events-none absolute inset-0 bg-black/45" />
        </>
      ) : null}

      {slide ? (
        <div className="space-y-6 text-center">
          {slide.label ? (
            <p className="text-sm font-semibold tracking-[0.3em] text-white/40 uppercase">
              {slide.label}
            </p>
          ) : null}
          {slide.lines.map((line, index) => (
            <p
              key={index}
              className="text-4xl leading-tight font-semibold text-balance sm:text-5xl lg:text-6xl"
            >
              {line}
            </p>
          ))}
        </div>
      ) : (
        // Only while nothing is up: the moment there are words on the screen,
        // the screen has nothing on it but the words.
        // Idle means black. A title card is still something the room can
        // read, and the point of "nothing on screen" is nothing on screen.
        <p className="text-[0.6rem] tracking-[0.2em] text-white/10 uppercase">
          {serviceTitle} · F for full screen
        </p>
      )}
    </div>
  );
}
