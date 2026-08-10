"use client";

import { useEffect, useMemo } from "react";
import { useLiveState } from "@/lib/services/live";
import type { PresentItem } from "@/lib/services/present";

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
}: {
  serviceId: string;
  serviceTitle: string;
  items: PresentItem[];
}) {
  const state = useLiveState(serviceId);
  useFullscreenKey();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-12 text-white">
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
        <div className="space-y-3 text-center">
          <p className="text-2xl text-white/30">{serviceTitle}</p>
          <p className="text-xs tracking-[0.2em] text-white/15 uppercase">
            Press F for full screen
          </p>
        </div>
      )}
    </div>
  );
}
