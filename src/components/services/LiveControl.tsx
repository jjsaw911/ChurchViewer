"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import ScreenPreview from "@/components/services/ScreenPreview";
import { publishLive, useLiveState } from "@/lib/services/live";
import type { LiveState } from "@/lib/live/protocol";
import type { PresentItem } from "@/lib/services/present";

/**
 * Whether a second window opened from here would land somewhere useful.
 *
 * A mouse means a computer, and a computer at the projector is where the output
 * and stage windows belong. A finger means the remote, where opening the
 * congregation's screen would only cover the controls with it.
 */
function useSecondScreens(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(pointer: fine)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(pointer: fine)").matches,
    // The server has no idea what it's being read on; assume the remote and let
    // the buttons appear a moment later on a desktop.
    () => false,
  );
}

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
  const secondScreens = useSecondScreens();

  const liveItem = items.find((item) => item.id === state.itemId) ?? null;
  const armedItem = items.find((item) => item.id === state.armedItemId) ?? null;

  /** Whether there's anything to put up: words, a picture, or a film. */
  const showable = (item: PresentItem) =>
    item.slides.length > 0 ||
    item.attachment?.kind === "image" ||
    Boolean(item.attachment?.kind === "video" && item.attachment.url);

  /** A film with the screen to itself — Start runs it, the same as a song. */
  const film =
    liveItem &&
    liveItem.slides.length === 0 &&
    liveItem.attachment?.kind === "video" &&
    liveItem.attachment.url
      ? liveItem
      : null;

  /** The next thing worth arming after this one. */
  const after = useCallback(
    (itemId: string | null): string | null => {
      const index = items.findIndex((item) => item.id === itemId);
      const rest = index === -1 ? items : items.slice(index + 1);
      return rest.find(showable)?.id ?? null;
    },
    [items],
  );

  /** The last thing worth showing before this one, for an overshot Next. */
  const before = useCallback(
    (itemId: string | null): PresentItem | null => {
      const index = items.findIndex((item) => item.id === itemId);
      if (index <= 0) return null;
      return [...items.slice(0, index)].reverse().find(showable) ?? null;
    },
    [items],
  );

  /**
   * Only what this press changes. While a song runs, the display is publishing
   * the slide it has reached; sending a whole state from here would carry a
   * slide number that was true a moment ago and shove the screen back to it.
   */
  const publish = useCallback(
    (next: Partial<LiveState>) => publishLive(serviceId, next),
    [serviceId],
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
   * Step a slide, and off the end of an item into the next one.
   *
   * Next has to do something every single time it is pressed. An announcement
   * with one slide, or a picture with none, is at its end the moment it goes up
   * — if the press stopped there, the button would be dead for that whole item
   * and the person at the back would press it harder.
   */
  const step = useCallback(
    (delta: number) => {
      if (!liveItem) {
        const first = items.find(showable);
        if (first) show(first.id);
        return;
      }

      const next = state.slideIndex + delta;
      if (next >= 0 && next < liveItem.slides.length) {
        publish({ slideIndex: next, blank: false });
        return;
      }

      // Forward off the end: the armed item takes the screen. Putting it up
      // doesn't start its recording — that stays a separate, deliberate press.
      if (delta > 0) {
        if (state.armedItemId) show(state.armedItemId);
        return;
      }

      // Backward off the front: the item before, at its last slide. Someone who
      // pressed Next once too many needs the way back to be the same key.
      const previous = before(liveItem.id);
      if (previous) show(previous.id, Math.max(0, previous.slides.length - 1));
    },
    [before, items, liveItem, publish, show, state.armedItemId, state.slideIndex],
  );

  /** The last slide of the item — where Next stops being "next slide". */
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

  // Clamped, because the display publishes the slide the recording has reached
  // and this window may still be a plan behind it.
  const onScreen = state.blank
    ? null
    : (liveItem?.slides[Math.min(state.slideIndex, liveItem.slides.length - 1)] ?? null);

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
              // Only genuinely dead at the very end of the day, with nothing
              // armed behind it.
              disabled={atEnd && !armedItem}
              className="rounded-lg bg-amber-700 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-40"
            >
              {atEnd && armedItem ? `Next: ${armedItem.title}` : "Next"} &rarr;
            </button>

            {/* Sound comes out of the machine at the projector. This is the
                instruction to start it, not a player. */}
            {liveItem?.followable || film ? (
              <button
                type="button"
                onClick={() => publish({ playing: !state.playing })}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  state.playing
                    ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                    : "bg-emerald-700 text-white hover:bg-emerald-800"
                }`}
              >
                {state.playing ? "Stop" : film ? "Play the video" : "Start the music"}
              </button>
            ) : liveItem?.offsiteRecordingOnly ? (
              <span className="self-center text-xs text-stone-500">
                Timed to a recording that isn&rsquo;t on the church machine &mdash; move these
                slides by hand.
              </span>
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

            {/* Second windows belong on the machine wired to the projector. On
                the phone in somebody's hand, "Output window" would put the
                congregation's screen on the phone and nowhere else. */}
            {secondScreens ? (
              <>
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

                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `/present/services/${slug}/stage`,
                      `churchviewer-stage-${serviceId}`,
                      "width=1280,height=720",
                    )
                  }
                  className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                >
                  Stage display
                </button>
              </>
            ) : null}
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
                      item.offsiteRecordingOnly ? "recording is a link only" : "",
                      // Why the box is greyed out, said on the box. Finding
                      // this out on the day is finding it out too late.
                      showable(item) ? "" : "nothing to show yet",
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
