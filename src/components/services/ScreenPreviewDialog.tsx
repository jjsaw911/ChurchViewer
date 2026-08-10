"use client";

import { useCallback, useEffect, useState } from "react";
import ScreenPreview from "@/components/services/ScreenPreview";
import { publishLive } from "@/lib/services/live";
import type { SlidePayload } from "@/lib/songs/types";

/**
 * What the room will see, at the size somebody can actually read.
 *
 * The thumbnails in the running order answer "is there anything on this"; this
 * answers "does it fit, and is it spelled right", which needs the slide at
 * something like its real size and shape.
 *
 * It can also drive the real screen. The output window is told what to show
 * through the same live channel the run sheet uses, so a Thursday check on the
 * projector in the building is the same gesture as Sunday morning — and what
 * you're looking at here is literally what's up there.
 */
export default function ScreenPreviewDialog({
  serviceId,
  serviceSlug,
  aspect,
  title,
  itemId,
  slides,
  backgroundUrl,
  picture,
  video,
  onClose,
}: {
  serviceId: string;
  serviceSlug: string;
  aspect: string;
  title: string;
  /** Which activity this is, so the output window is told the right one. */
  itemId: string;
  slides: SlidePayload[];
  backgroundUrl: string | null;
  picture: string | null;
  video: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const slide = slides[index] ?? null;

  const step = useCallback(
    (delta: number) => {
      setIndex((current) =>
        Math.max(0, Math.min(slides.length - 1, current + delta)),
      );
    },
    [slides.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight" || event.key === " ") step(1);
      else if (event.key === "ArrowLeft") step(-1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`What the screen shows during ${title}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-4xl space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-xl dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-xs text-stone-500">
              Drawn at {aspect} — the shape of the screen this service goes on
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-stone-500 hover:underline"
          >
            Close
          </button>
        </div>

        <ScreenPreview
          size="full"
          aspect={aspect}
          slide={slide}
          slideCount={slides.length}
          backgroundUrl={backgroundUrl}
          picture={picture}
          video={video}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={index === 0}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            &larr; Back
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={index >= slides.length - 1}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Next &rarr;
          </button>

          <span className="text-sm text-stone-500">
            {slides.length ? `${index + 1} of ${slides.length}` : "nothing to show"}
          </span>

          <span className="ml-auto flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() =>
                window.open(
                  `/present/services/${serviceSlug}/screen`,
                  `churchviewer-output-${serviceId}`,
                  "width=1280,height=720",
                )
              }
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Open the output window
            </button>

            {/* The same message the run sheet sends on Sunday. Checking the
                projector on Thursday shouldn't need a different mechanism. */}
            <button
              type="button"
              disabled={slides.length === 0 && !picture}
              onClick={() => publishLive(serviceId, { itemId, slideIndex: index, blank: false })}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Put this on the screen
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
