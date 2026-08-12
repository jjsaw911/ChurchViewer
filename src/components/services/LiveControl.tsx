"use client";

import { useCallback, useEffect } from "react";
import ScreenPreview from "@/components/services/ScreenPreview";
import { publishLive, useLiveState } from "@/lib/services/live";
import type { LiveState } from "@/lib/live/protocol";
import type { PresentItem } from "@/lib/services/present";

/**
 * The operator's screen: the day as a row of boxes, and what the room sees.
 *
 * The shape of a service is one thing after another, so that's the shape of
 * this. Tap a box and it goes on the screen. Next walks its slides. When they
 * run out the following box arms itself — chosen, visible here, not yet in
 * front of anybody — because the gap between two items is exactly when somebody
 * needs to see what's coming without the room seeing it too.
 *
 * Nothing here plays audio. A song's recording plays on the machine at the
 * projector, where the sound system is; Start is an instruction sent to it.
 */
export default function LiveControl({
  serviceId,
  serviceTitle,
  slug,
  items,
  screenAspect,
}: {
  serviceId: string;
  serviceTitle: string;
  slug: string;
  items: PresentItem[];
  screenAspect: string;
}) {
  const state = useLiveState(serviceId);

  const liveItem = items.find((item) => item.id === state.itemId) ?? null;
  const armedItem = items.find((item) => item.id === state.armedItemId) ?? null;

  /** Whether there's anything to put up: words, or a picture standing in. */
  const showable = (item: PresentItem) =>
    item.slides.length > 0 || item.attachment?.kind === "image";

  /** The next thing worth arming after this one. */
  const after = useCallback(
    (itemId: string | null): string | null => {
      const index = items.findIndex((item) => item.id === itemId);
      const rest = index === -1 ? items : items.slice(index + 1);
      return rest.find(showable)?.id ?? null;
    },
    [items],
  );

  const publish = useCallback(
    (next: Partial<LiveState>) =>
      publishLive(serviceId, {
        itemId: state.itemId,
        slideIndex: state.slideIndex,
        blank: state.blank,
        playing: state.playing,
        armedItemId: state.armedItemId,
        ...next,
      }),
    [serviceId, state],
  );

  /** Put an item up, and line up whatever comes after it. */
  const show = useCallback(
    (itemId: string, slideIndex = 0) =>
      publish({
        itemId,
        slideIndex,
        blank: false,
        // Starting an item never starts its recording; that's a separate press.
        playing: false,
        armedItemId: after(itemId),
      }),
    [after, publish],
  );

  /**
   * Step a slide. At the end of an item this does *not* jump onward — it stops,
   * with the next one armed, so nothing reaches the screen because somebody
   * pressed Next once too often.
   */
  const step = useCallback(
    (delta: number) => {
      if (!liveItem) {
        const first = items.find(showable);
        if (first) show(first.id);
        return;
      }

      const next = state.slideIndex + delta;
      if (next >= 0 && next < Math.max(1, liveItem.slides.length)) {
        publish({ slideIndex: next, blank: false });
      }
    },
    [items, liveItem, publish, show, state.slideIndex],
  );

  const atEnd = liveItem ? state.slideIndex >= liveItem.slides.length - 1 : false;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        step(-1);
      } else if (event.key.toLowerCase() === "b") {
        publish({ blank: !state.blank });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [publish, state.blank, step]);

  const onScreen = state.blank ? null : (liveItem?.slides[state.slideIndex] ?? null);

  return (
    <div className="space-y-5">
      {/* What the room is seeing, right now, at the shape of the screen. */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-56 shrink-0">
          <ScreenPreview
            size="full"
            aspect={screenAspect}
            slide={onScreen}
            slideCount={liveItem?.slides.length ?? 0}
            backgroundUrl={state.blank ? null : (liveItem?.backgroundUrl ?? null)}
            picture={
              !state.blank && !onScreen && liveItem?.attachment?.kind === "image"
                ? liveItem.attachment.url
                : null
            }
            video={liveItem?.attachment?.kind === "video"}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-stone-500">
            {state.blank
              ? "Screen is blank"
              : liveItem
                ? `On screen · ${liveItem.title}${
                    liveItem.slides.length
                      ? ` · ${state.slideIndex + 1} of ${liveItem.slides.length}`
                      : ""
                  }`
                : "Nothing on the screen"}
          </p>

          {armedItem ? (
            <p className="text-sm">
              <span className="text-stone-500">Next up: </span>
              <span className="font-medium">{armedItem.title}</span>
              {atEnd ? (
                <button
                  type="button"
                  onClick={() => show(armedItem.id)}
                  className="ml-3 rounded-lg bg-amber-700 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                >
                  Put it up
                </button>
              ) : null}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => step(-1)}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              &larr; Back
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={atEnd}
              className="rounded-lg bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-40"
            >
              Next &rarr;
            </button>

            {/* Sound comes out of the machine at the projector. This is the
                instruction to start it, not a player. */}
            {liveItem?.followable ? (
              <button
                type="button"
                onClick={() => publish({ playing: !state.playing })}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  state.playing
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                    : "bg-emerald-700 text-white hover:bg-emerald-800"
                }`}
              >
                {state.playing ? "Stop the music" : "Start the music"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => publish({ blank: !state.blank })}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                state.blank
                  ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
              }`}
            >
              {state.blank ? "Screen is blank" : "Blank"}
            </button>

            <button
              type="button"
              onClick={() =>
                window.open(
                  `/present/services/${slug}/screen`,
                  `churchviewer-output-${serviceId}`,
                  "width=1280,height=720",
                )
              }
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Output window
            </button>
          </div>
        </div>
      </div>

      {/* The day, in order. */}
      <ol className="space-y-2">
        {items.map((item) => {
          const isLive = item.id === state.itemId;
          const isArmed = item.id === state.armedItemId;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => showable(item) && show(item.id)}
                disabled={!showable(item)}
                className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left ${
                  item.depth > 0 ? "ml-6" : ""
                } ${
                  isLive
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                    : isArmed
                      ? "border-emerald-500"
                      : "border-stone-200 dark:border-stone-800"
                } ${showable(item) ? "hover:border-amber-400" : "opacity-60"}`}
              >
                <span className="w-14 shrink-0 font-mono text-xs text-amber-700 dark:text-amber-500">
                  {item.startsAt}
                </span>

                <ScreenPreview
                  aspect={screenAspect}
                  slide={item.slides[0] ?? null}
                  slideCount={item.slides.length}
                  backgroundUrl={item.backgroundUrl}
                  picture={
                    item.slides.length === 0 && item.attachment?.kind === "image"
                      ? item.attachment.url
                      : null
                  }
                  video={item.attachment?.kind === "video"}
                  className="w-20"
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {[
                      item.kind,
                      item.musicalKey ? `key of ${item.musicalKey}` : "",
                      item.followable ? "has a recording" : "",
                      `${item.minutes} min`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                <span className="shrink-0 text-xs font-medium">
                  {isLive ? (
                    <span className="text-amber-700 dark:text-amber-500">on screen</span>
                  ) : isArmed ? (
                    <span className="text-emerald-700 dark:text-emerald-500">next</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-stone-500">
        {serviceTitle} · arrows or space to move · B blanks the screen
      </p>
    </div>
  );
}
