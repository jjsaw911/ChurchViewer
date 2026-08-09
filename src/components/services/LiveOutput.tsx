"use client";

import { useMemo } from "react";
import { useLiveState } from "@/lib/services/live";
import type { PresentItem } from "@/lib/services/present";

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
        <p className="text-2xl text-white/30">{serviceTitle}</p>
      )}
    </div>
  );
}
