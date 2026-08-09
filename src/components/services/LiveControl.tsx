"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SongPlayer, { type PlayerControls } from "@/components/songs/SongPlayer";
import { publishLive, useLiveState } from "@/lib/services/live";
import { slideAt } from "@/lib/songs/slides";
import type { PresentItem } from "@/lib/services/present";

/**
 * The operator's window: the running order on the left, the slides of whatever
 * is happening on the right, and other windows showing the room and the stage
 * only what's chosen here.
 *
 * Everything is one click or one arrow key, because the person using this is
 * also watching a band finish a song.
 */
export default function LiveControl({
  serviceId,
  serviceTitle,
  slug,
  items,
}: {
  serviceId: string;
  serviceTitle: string;
  slug: string;
  items: PresentItem[];
}) {
  const state = useLiveState(serviceId);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [following, setFollowing] = useState(true);
  const controls = useRef<PlayerControls | null>(null);

  const publish = useCallback(
    (next: Parameters<typeof publishLive>[1]) => publishLive(serviceId, next),
    [serviceId],
  );

  const liveItem = items.find((item) => item.id === state.itemId) ?? null;

  /** Whether there's anything to put up: words, or a picture standing in for them. */
  const showable = (item: PresentItem) =>
    item.slides.length > 0 || item.attachment?.kind === "image";

  /**
   * Put a slide up, and take the recording with it — while the slides are
   * following it. Held deliberately on one slide, the recording plays on.
   */
  const show = useCallback(
    (itemId: string, slideIndex = 0) => {
      publish({ itemId, slideIndex, blank: false });

      const item = items.find((candidate) => candidate.id === itemId);
      if (following && item?.followable && itemId === state.itemId) {
        controls.current?.seekToMs(item.slides[slideIndex]?.atMs ?? 0);
      }
    },
    [following, items, publish, state.itemId],
  );

  /**
   * Step a slide, rolling on to the next activity that has any at either end.
   * A service runs forwards; the operator shouldn't have to re-aim at the list
   * between the last verse of one song and the first of the next.
   */
  const step = useCallback(
    (delta: number) => {
      const index = items.findIndex((item) => item.id === state.itemId);
      if (index === -1) {
        const first = items.findIndex(showable);
        if (first !== -1) publish({ itemId: items[first].id, slideIndex: 0, blank: false });
        return;
      }

      const item = items[index];
      const next = state.slideIndex + delta;

      if (next >= 0 && next < item.slides.length) {
        show(item.id, next);
        return;
      }

      const search = delta > 0 ? items.slice(index + 1) : items.slice(0, index).reverse();
      const neighbour = search.find(showable);
      if (!neighbour) return;

      publish({
        itemId: neighbour.id,
        slideIndex: delta > 0 ? 0 : Math.max(0, neighbour.slides.length - 1),
        blank: false,
      });
    },
    [items, publish, show, state.itemId, state.slideIndex],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Never steal a key from someone typing a note into the plan.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        step(-1);
      } else if (event.key.toLowerCase() === "b") {
        publish({ ...state, blank: !state.blank });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, publish, state]);

  const onControls = useCallback((next: PlayerControls) => {
    controls.current = next;
  }, []);

  /**
   * The recording driving the screen. Only ever publishes when the slide
   * actually changes — this fires ten times a second, and the two windows agree
   * through a written-down state, not a firehose.
   */
  const onTime = useCallback(
    (positionMs: number) => {
      if (!following || !liveItem?.followable) return;

      const index = slideAt(liveItem.slides, positionMs, liveItem.timingOffsetMs);
      if (index < 0 || index === state.slideIndex) return;

      publish({ itemId: liveItem.id, slideIndex: index, blank: state.blank });
    },
    [following, liveItem, publish, state.blank, state.slideIndex],
  );

  const openWindow = (path: string, name: string) => {
    window.open(path, `churchviewer-${name}-${serviceId}`, "width=1280,height=720");
    setOpened((current) => ({ ...current, [name]: true }));
  };

  const onScreen = state.blank ? null : (liveItem?.slides[state.slideIndex] ?? null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
        <button
          type="button"
          onClick={() => openWindow(`/present/services/${slug}/screen`, "output")}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          {opened.output ? "Output screen" : "Open the output screen"}
        </button>
        <button
          type="button"
          onClick={() => openWindow(`/present/services/${slug}/stage`, "stage")}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {opened.stage ? "Stage display" : "Open the stage display"}
        </button>
        <span className="mx-1 h-6 w-px bg-stone-200 dark:bg-stone-700" />
        <button
          type="button"
          onClick={() => step(-1)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          Next &rarr;
        </button>
        <button
          type="button"
          onClick={() => publish({ ...state, blank: !state.blank })}
          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
            state.blank
              ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
              : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          }`}
        >
          {state.blank ? "Screen is blank" : "Blank the screen"}
        </button>
        <p className="ml-auto text-xs text-stone-500">
          Arrows or space to move &middot; B blanks &middot; drag the output window to the other
          monitor and press F there
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start">
        <ol className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {items.map((item) => {
            const isLive = item.id === state.itemId;
            return (
              <li
                key={item.id}
                className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 p-4 ${
                  item.depth > 0 ? "pl-10" : ""
                } ${isLive ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
              >
                <span className="w-20 font-mono text-sm text-amber-700 dark:text-amber-500">
                  {item.startsAt}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-stone-500">
                    {[item.kind, item.owner, `${item.minutes} min`].filter(Boolean).join(" · ")}
                    {item.followable ? " · follows the recording" : ""}
                  </p>
                  {item.notes ? (
                    <p className="text-sm text-stone-600 dark:text-stone-400">{item.notes}</p>
                  ) : null}
                  {item.mediaUrl ? (
                    <a
                      href={item.mediaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-500"
                    >
                      Video
                    </a>
                  ) : null}
                </div>
                {showable(item) ? (
                  <button
                    type="button"
                    onClick={() => show(item.id)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                      isLive
                        ? "bg-amber-700 text-white"
                        : "border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                    }`}
                  >
                    {isLive
                      ? "On screen"
                      : item.slides.length > 0
                        ? `Show ${item.slides.length}`
                        : "Show picture"}
                  </button>
                ) : (
                  <span className="text-xs text-stone-400">nothing to show</span>
                )}
              </li>
            );
          })}
        </ol>

        <div className="space-y-4 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-black p-6 text-center dark:border-stone-800">
            {onScreen ? (
              <div className="space-y-1">
                {onScreen.lines.map((line, index) => (
                  <p key={index} className="font-semibold text-balance text-white">
                    {line}
                  </p>
                ))}
              </div>
            ) : !state.blank && liveItem?.attachment?.kind === "image" ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={liveItem.attachment.url ?? ""}
                alt=""
                className="mx-auto max-h-48 object-contain"
              />
            ) : (
              <p className="text-sm text-white/40">{state.blank ? "Blank" : serviceTitle}</p>
            )}
          </div>

          {liveItem?.followable ? (
            <div className="space-y-2">
              <SongPlayer
                key={liveItem.id}
                videoId={liveItem.videoId}
                audioUrl={liveItem.audioUrl}
                onTime={onTime}
                onControls={onControls}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={following}
                  onChange={(event) => setFollowing(event.target.checked)}
                  className="h-4 w-4 accent-amber-700"
                />
                <span>Slides follow the recording</span>
              </label>
              <p className="text-xs text-stone-500">
                Turn it off to hold a slide while the song plays on. Clicking a slide moves the
                recording to match.
              </p>
            </div>
          ) : null}

          {liveItem ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">
                {liveItem.title}{" "}
                <span className="font-normal text-stone-500">
                  {state.slideIndex + 1} / {liveItem.slides.length}
                </span>
              </p>
              <ol className="max-h-[28rem] space-y-1 overflow-y-auto">
                {liveItem.slides.map((slide, index) => (
                  <li key={slide.id}>
                    <button
                      type="button"
                      onClick={() => show(liveItem.id, index)}
                      className={`w-full rounded-lg border p-2 text-left text-sm ${
                        index === state.slideIndex && !state.blank
                          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                          : "border-stone-200 hover:border-amber-300 dark:border-stone-800"
                      }`}
                    >
                      {slide.label ? (
                        <span className="mr-2 text-xs tracking-wide text-stone-500 uppercase">
                          {slide.label}
                        </span>
                      ) : null}
                      {slide.lines.join(" / ")}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Pick something with slides to put it on the screen.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
