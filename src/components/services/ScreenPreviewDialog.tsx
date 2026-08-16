"use client";

import { useCallback, useEffect, useState } from "react";
import ScreenPreview from "@/components/services/ScreenPreview";
import type { Background } from "@/lib/media/background";
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
export type PreviewItem = {
  itemId: string;
  title: string;
  slides: SlidePayload[];
  background: Background | null;
  picture: string | null;
  video: boolean;
};

export default function ScreenPreviewDialog({
  serviceId,
  serviceSlug,
  aspect,
  /** The whole service in order, so a rehearsal doesn't stop at one activity. */
  plan,
  /** Where to start — the box that was clicked. */
  itemId,
  onClose,
}: {
  serviceId: string;
  serviceSlug: string;
  aspect: string;
  plan: PreviewItem[];
  itemId: string;
  onClose: () => void;
}) {
  /**
   * Where in the service this rehearsal has got to.
   *
   * Two numbers rather than one, because a service is a list of lists — and
   * running through it means walking off the end of an activity into the next
   * one, which is exactly the moment a single index cannot describe.
   */
  const [at, setAt] = useState(() => ({
    item: Math.max(0, plan.findIndex((entry) => entry.itemId === itemId)),
    slide: 0,
  }));

  const current = plan[at.item] ?? plan[0];
  const slides = current?.slides ?? [];
  const slide = slides[at.slide] ?? null;
  const title = current?.title ?? "";

  /**
   * A step, and off the end of an activity into the next.
   *
   * The point of a rehearsal is to see the whole morning without deciding in
   * advance where one thing stops — so Next at the last slide of the notices
   * opens the first song, and Back at the first slide of the sermon returns to
   * the last slide of the song before it.
   */
  const step = useCallback(
    (delta: number) => {
      setAt((now) => {
        const here = plan[now.item];
        if (!here) return now;

        const next = now.slide + delta;
        // An activity with no words at all — a picture or a film — is one
        // screen, and stepping past it moves on rather than sticking.
        const count = Math.max(1, here.slides.length);

        if (next >= 0 && next < count) return { ...now, slide: next };

        if (delta > 0) {
          const onward = now.item + 1;
          if (onward >= plan.length) return now;
          return { item: onward, slide: 0 };
        }

        const back = now.item - 1;
        if (back < 0) return now;
        return { item: back, slide: Math.max(0, (plan[back]?.slides.length ?? 1) - 1) };
      });
    },
    [plan],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      // Space and the arrows, and Backspace for going back — which is what a
      // hand reaches for when the other one is holding a coffee, and what a
      // presentation remote sends.
      const forward = event.key === "ArrowRight" || event.key === " " || event.key === "PageDown";
      const backward =
        event.key === "ArrowLeft" || event.key === "Backspace" || event.key === "PageUp";

      if (!forward && !backward) return;

      // Space scrolls a page and Backspace used to go back a page; neither is
      // wanted while somebody is walking through a service.
      event.preventDefault();
      step(forward ? 1 : -1);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, step]);

  const atStart = at.item === 0 && at.slide === 0;
  const atEnd =
    at.item >= plan.length - 1 && at.slide >= Math.max(1, slides.length) - 1;

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
          background={current?.background ?? null}
          picture={current?.picture ?? null}
          video={current?.video ?? false}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={atStart}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            &larr; Back
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={atEnd}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-40 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Next &rarr;
          </button>

          <span className="text-sm text-stone-500">
            {slides.length ? `slide ${at.slide + 1} of ${slides.length}` : "no words on this"}
            {plan.length > 1 ? ` · ${at.item + 1} of ${plan.length} in the service` : ""}
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
              disabled={slides.length === 0 && !current?.picture}
              onClick={() =>
                publishLive(serviceId, {
                  // Whatever this rehearsal has walked to, not the box that
                  // opened it — the point of the button is "that, now".
                  itemId: current?.itemId ?? itemId,
                  slideIndex: at.slide,
                  blank: false,
                  playing: false,
                  armedItemId: null,
                })
              }
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
