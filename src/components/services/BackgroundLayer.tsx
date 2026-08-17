"use client";

import type { Background } from "@/lib/media/background";

/**
 * Whatever is behind the words, drawn the same way everywhere.
 *
 * A photograph, a loop, or a colour — and over all three, a scrim. That layer
 * is not decoration: a picture is rarely dark enough on its own, and a line
 * nobody at the back can read is worse than no picture at all. It is skipped
 * for a plain colour, because somebody choosing a colour has already chosen how
 * dark they want it.
 *
 * Used by the projector and by every preview of it, from the same file, so that
 * what the planner shows on Thursday is what the room sees on Sunday.
 */
export default function BackgroundLayer({
  background,
  /** Previews are small and there may be forty of them on one page. */
  still = false,
}: {
  background: Background | null;
  still?: boolean;
}) {
  if (!background) return null;

  if (background.kind === "colour") {
    return (
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: background.css }}
      />
    );
  }

  return (
    <>
      {background.kind === "video" ? (
        <video
          src={background.url}
          // Silent, always: the sound out of this machine is the service's.
          muted
          loop
          // A page of previews playing forty loops at once would melt a
          // laptop, so away from the projector it is a first frame and no
          // more — enough to see which background it is.
          autoPlay={!still}
          preload={still ? "metadata" : "auto"}
          playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={background.url}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-black/45" />
    </>
  );
}
