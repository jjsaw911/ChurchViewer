"use client";

import type { SlidePayload } from "@/lib/songs/types";

/**
 * A small picture of what the room will see.
 *
 * Drawn at the shape of the actual screen, not a convenient one: a line that
 * fits on a 16:9 projector may run off a 4:3 one, and the point of a preview is
 * to find that out on Thursday rather than on Sunday.
 *
 * It's the output screen in miniature and follows the same rules — the picture
 * behind, the words over it, and a photograph darkened so the words stay
 * readable.
 */
export default function ScreenPreview({
  aspect,
  slide,
  slideCount,
  backgroundUrl,
  picture,
  video,
  size = "thumb",
  className = "",
}: {
  /** "16:9", "4:3" — as stored on the service. */
  aspect: string;
  /** The slide to draw; in a row, the first, since that's what it opens with. */
  slide: SlidePayload | null;
  slideCount: number;
  backgroundUrl: string | null;
  /** An image standing in for the whole item, when there are no words. */
  picture: string | null;
  /** True when what's attached is something that plays rather than shows. */
  video: boolean;
  /** A row thumbnail, or the big one that stands in for the screen itself. */
  size?: "thumb" | "full";
  className?: string;
}) {
  const full = size === "full";
  const [width, height] = aspect.split(":");
  const ratio = `${Number(width) || 16} / ${Number(height) || 9}`;

  return (
    <div
      style={{ aspectRatio: ratio }}
      title={
        slideCount
          ? `${slideCount} slide${slideCount === 1 ? "" : "s"} · shown at ${aspect}`
          : `Nothing to show yet · ${aspect}`
      }
      className={`relative shrink-0 overflow-hidden bg-black ${
        full
          ? "w-full rounded-lg"
          : "w-28 rounded border border-stone-300 dark:border-stone-700"
      } ${className}`}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picture} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : (
        <>
          {backgroundUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={backgroundUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/45" />
            </>
          ) : null}

          {slide ? (
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center text-center ${
                full ? "gap-3 px-10" : "gap-px px-1"
              }`}
            >
              {slide.label && full ? (
                <p className="text-xs font-semibold tracking-[0.3em] text-white/40 uppercase">
                  {slide.label}
                </p>
              ) : null}

              {/* A row shows the first three lines; the big one shows all of
                  them, because fitting is the question it's there to answer. */}
              {(full ? slide.lines : slide.lines.slice(0, 3)).map((line, index) => (
                <p
                  key={index}
                  className={
                    full
                      ? "w-full text-2xl leading-tight font-semibold text-balance text-white lg:text-4xl"
                      : "w-full truncate text-[0.5rem] leading-tight font-semibold text-white"
                  }
                >
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={full ? "text-lg text-white/30" : "text-[0.6rem] text-white/40"}>
                {video ? "▶" : "blank"}
              </span>
            </div>
          )}
        </>
      )}

      {slideCount > 1 ? (
        <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-[0.55rem] text-white/80">
          {slideCount}
        </span>
      ) : null}
    </div>
  );
}
