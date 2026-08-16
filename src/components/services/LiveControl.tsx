"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OperatorLights } from "@/components/services/LinkLights";
import { useStayAwake } from "@/lib/services/awake";
import { useNativeStatus } from "@/lib/services/native";
import ScreenPreview from "@/components/services/ScreenPreview";
import ScreenPreviewDialog, {
  type PreviewItem,
} from "@/components/services/ScreenPreviewDialog";
import {
  askScreensToReload,
  publishLive,
  useHeardPlayback,
  useLiveState,
  usePresence,
} from "@/lib/services/live";
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

/** `93.4` -> `"1:33"`. Read at a glance, so no hours and no leading zero. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The operator's screen: the day as a column of boxes, one of them alive.
 *
 * A service is one thing after another, so that is the shape of this. Whatever
 * is on the screen is the box you can read at arm's length — the actual screen
 * inside it, at the actual shape of the screen — and everything else steps back
 * to a dimmed line until its turn. There is no separate preview panel, because
 * the box *is* the preview, and two of them would only disagree.
 *
 * Tapping a box chooses it; the box then asks before it goes anywhere. That
 * second press is deliberate: putting something up cannot be undone once the
 * room has seen it, and this is held one-handed, in the dark, by somebody who
 * is also listening for their cue.
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
  const state = useLiveState(serviceId, "control");
  const presence = usePresence(serviceId, "control");
  const secondScreens = useSecondScreens();
  const heard = useHeardPlayback(serviceId, "control");
  useStayAwake();

  // A clock, so a report that stops arriving goes stale on its own rather than
  // sitting there looking like a song that is still running.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!state.playing) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.playing]);

  /**
   * Whether sound is actually coming out of the machine at the projector.
   *
   * Not `state.playing` — that is the instruction, true from the moment Start
   * is pressed whether or not anything heard it. This is the projector's own
   * report, and only while it is still arriving: two seconds of silence from a
   * machine that reports every second means the room has gone quiet.
   */
  const reallyPlaying = Boolean(state.playing && heard && now - heard.at < 2500);

  /**
   * The box somebody has tapped but not yet committed to.
   *
   * Jumping is the one action here that can't be walked back: the room has
   * already seen it, and a song has already started. A remote lives in a
   * pocket, gets handed across a row of seats, and is held one-handed in the
   * dark — so the first tap only chooses, and the box then asks. Nothing else
   * needs this. Next and Back move within what is already on the screen, and
   * that is what they are pressed a hundred times a morning to do.
   */
  const [pending, setPending] = useState<string | null>(null);
  /**
   * Walking the service without any of it reaching the room.
   *
   * The same thing the planner offers, here as well — because the page
   * somebody has open ten minutes before a service is this one, and "let me
   * just check the whole thing through" is a reasonable thing to want from it.
   */
  const [rehearsing, setRehearsing] = useState(false);

  const previewPlan: PreviewItem[] = items
    .map((item) => ({
      itemId: item.id,
      title: item.title,
      slides: item.slides,
      background: item.background,
      picture: item.attachment?.kind === "image" ? item.attachment.url : null,
      video: item.attachment?.kind === "video",
    }))
    .filter((entry) => entry.slides.length > 0 || entry.picture || entry.video);

  // A choice nobody confirmed is a choice nobody made. Without this it sits
  // there until the next tap, and the tap after that is the one that lands on
  // a "yes" for something chosen ten minutes ago.
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), 10_000);
    return () => clearTimeout(timer);
  }, [pending]);

  const liveItem = items.find((item) => item.id === state.itemId) ?? null;
  const armedItem = items.find((item) => item.id === state.armedItemId) ?? null;

  /** Whether there's anything to put up: words, a picture, or a film. */
  const showable = (item: PresentItem) =>
    item.slides.length > 0 ||
    item.attachment?.kind === "image" ||
    Boolean(item.attachment?.kind === "video" && item.attachment.url);

  /** A film with the screen to itself — Play runs it, the same as a song. */
  const film = (item: PresentItem) =>
    item.slides.length === 0 && item.attachment?.kind === "video" && item.attachment.url
      ? item.attachment.url
      : null;

  /** Whether there's a recording the machine at the projector can run. */
  const plays = (item: PresentItem) => item.followable || Boolean(film(item));

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
   * Tap a box: it goes on the screen, and if it carries a recording that
   * starts too.
   *
   * One press for the whole thing, because that is what the press means — the
   * box is the item, and putting a song up without starting it is a thing
   * nobody wanted to do. The Stop and the slide controls are right there in the
   * box afterwards for the times it needs correcting.
   */
  const activate = useCallback(
    (item: PresentItem) =>
      publish({
        itemId: item.id,
        slideIndex: 0,
        blank: false,
        playing: plays(item),
        armedItemId: after(item.id),
      }),
    // `plays` and `after` are recomputed from `items` each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [after, items, publish],
  );

  /** A second window, on the machine that has somewhere to put one. */
  const openWindow = (surface: "screen" | "stage") =>
    window.open(
      `/present/services/${slug}/${surface}`,
      `churchviewer-${surface}-${serviceId}`,
      "width=1280,height=720",
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

  // What the app's own buttons along the bottom show, when there is one.
  useNativeStatus({
    blank: state.blank,
    playing: reallyPlaying,
    canPlay: Boolean(liveItem && plays(liveItem)),
  });

  /** The last slide of the item — where Next stops being "next slide". */
  const atEnd = liveItem ? state.slideIndex >= liveItem.slides.length - 1 : false;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // A rehearsal has its own keys, and they must not also move the room's
      // screen — that would be the exact opposite of a preview.
      if (rehearsing) return;

      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        step(-1);
      } else if (event.key.toLowerCase() === "b") {
        publish({ blank: !state.blank });
      } else if (event.key.toLowerCase() === "p") {
        // Start or stop the recording of whatever is up. This is also what the
        // Play button on the remote presses — the native bar along the bottom
        // reaches the page through keys, so anything it can do lives here.
        if (liveItem && (liveItem.followable || film(liveItem))) {
          publish({ playing: !state.playing });
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, liveItem, publish, rehearsing, state.blank, state.playing, step]);

  /**
   * Keep the live box where a thumb can reach it.
   *
   * The column grows with the service, so by the sermon the box that matters is
   * somewhere above the fold — and the person holding this is not looking at
   * it. When the screen changes to a different item, its box comes to the
   * middle on its own.
   */
  const liveBox = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    liveBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state.itemId]);

  // Clamped, because the display publishes the slide the recording has reached
  // and this window may still be a plan behind it.
  const onScreen = state.blank
    ? null
    : (liveItem?.slides[Math.min(state.slideIndex, liveItem.slides.length - 1)] ?? null);


  return (
    <div className="space-y-4">
      {rehearsing ? (
        <ScreenPreviewDialog
          serviceId={serviceId}
          serviceSlug={slug}
          aspect={screenAspect}
          plan={previewPlan}
          itemId={state.itemId ?? previewPlan[0]?.itemId ?? ""}
          onClose={() => setRehearsing(false)}
        />
      ) : null}

      {/* The one fact that makes every other control here pointless, said
          before any of them rather than discovered by pressing one. A small
          coloured dot was not enough: it is a dot, and this is somebody's
          Sunday morning. */}
      {presence.display === 0 ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          No screen is connected. Nothing you press here will reach a projector until the
          display is open on the church computer.{" "}
          <a href="/download" className="underline underline-offset-2">
            Get the display app
          </a>
          .
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Before anything else on the page: whether there is anything on the
            other end of all this. */}
        <OperatorLights presence={presence} />

        {/* Turned from here because the person who can hear that it is too
            loud is standing in the room, not at the computer. Under it, on the
            machine itself, a limiter nobody has to think about: the one song
            mastered far hotter than the rest cannot arrive far louder. */}
        <label className="flex w-full max-w-64 items-center gap-2 text-xs text-stone-500 sm:w-auto">
          <button
            type="button"
            onClick={() => publish({ volume: state.volume === 0 ? 85 : 0 })}
            className="shrink-0 rounded-md px-1.5 py-1 text-base leading-none hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label={state.volume === 0 ? "Sound off — turn it back on" : "Silence the sound"}
          >
            {state.volume === 0 ? "🔇" : "🔊"}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={state.volume}
            onChange={(event) => publish({ volume: Number(event.target.value) })}
            className="w-full min-w-20 accent-amber-700"
          />
          <span className="w-8 shrink-0 text-right tabular-nums">{state.volume}</span>
        </label>

        {/* Second windows belong on the machine wired to the projector. On the
            phone in somebody's hand, these would put the congregation's screen
            on the phone and nowhere else. */}
        <div className="flex gap-2 text-xs">
          {previewPlan.length > 0 ? (
            <button
              type="button"
              onClick={() => setRehearsing(true)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium hover:border-amber-400 dark:border-stone-700"
            >
              Run through it
            </button>
          ) : null}
        </div>

        {secondScreens ? (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => openWindow("screen")}
              className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Output window
            </button>
            <button
              type="button"
              onClick={() => openWindow("stage")}
              className="rounded-lg border border-stone-300 px-3 py-1.5 font-medium hover:bg-stone-700/10 dark:border-stone-700 dark:hover:bg-stone-800"
            >
              Stage display
            </button>
          </div>
        ) : null}
      </div>

      {/* The day, top to bottom. Whatever is on the screen is the one box you
          can read from arm's length; everything else steps back out of the way
          until its turn. */}
      <ol className="space-y-2">
        {items.map((item) => {
          const isLive = item.id === state.itemId;
          const isArmed = item.id === state.armedItemId;
          const canShow = showable(item);

          if (isLive) {
            return (
              <li key={item.id} ref={liveBox}>
                <div className="rounded-2xl border-2 border-amber-500 bg-amber-50/70 p-3 shadow-lg dark:bg-amber-950/30">
                  <div className="flex items-baseline gap-2 pb-2">
                    <span className="font-mono text-xs text-amber-700 dark:text-amber-500">
                      {item.startsAt}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
                    <span className="shrink-0 text-xs text-stone-500">
                      {state.blank
                        ? "blank"
                        : item.slides.length
                          ? `${Math.min(state.slideIndex + 1, item.slides.length)} of ${item.slides.length}`
                          : "on screen"}
                    </span>
                  </div>

                  {/* Exactly what the room is seeing, at the shape of the
                      actual screen. Big enough to read a lyric off, capped
                      before it fills a tablet and pushes the buttons under the
                      fold — the point of it is to be looked at *with* them. */}
                  <div className="mx-auto w-full max-w-xl">
                   <ScreenPreview
                    size="full"
                    aspect={screenAspect}
                    slide={onScreen}
                    slideCount={item.slides.length}
                    background={state.blank ? null : item.background}
                    picture={
                      !state.blank && !onScreen && item.attachment?.kind === "image"
                        ? item.attachment.url
                        : null
                    }
                    video={item.attachment?.kind === "video"}
                   />
                  </div>

                  {/* Proof, or the absence of it. A number going up is the
                      only way to know from here that the room can hear
                      anything — the button below says what was asked for, this
                      says what happened. */}
                  {state.playing ? (
                    <div className="mx-auto w-full max-w-xl pt-3">
                      {reallyPlaying && heard ? (
                        <div className="flex items-center gap-2 text-xs tabular-nums text-stone-600 dark:text-stone-400">
                          <span className="w-9 shrink-0 text-right">{clock(heard.position)}</span>
                          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-300 dark:bg-stone-700">
                            <span
                              className="block h-full rounded-full bg-emerald-600 transition-[width] duration-500 ease-linear"
                              style={{
                                width: heard.duration
                                  ? `${Math.min(100, (heard.position / heard.duration) * 100)}%`
                                  : "0%",
                              }}
                            />
                          </span>
                          <span className="w-9 shrink-0">
                            {heard.duration ? clock(heard.duration) : ""}
                          </span>
                        </div>
                      ) : (
                        // Asked for, and nothing has answered. Said plainly,
                        // because the alternative is an operator standing there
                        // believing a song is running.
                        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                          <span className="min-w-0 flex-1">
                            {presence.display === 0
                              ? "No screen is connected, so nothing is playing. Open the display on the church computer."
                              : "The screen hasn't started it. Press Start again, or reload the screen."}
                          </span>
                          {presence.display > 0 ? (
                            <button
                              type="button"
                              onClick={() => askScreensToReload(serviceId)}
                              className="shrink-0 rounded-md bg-amber-900 px-2.5 py-1 font-semibold text-white hover:bg-amber-950 dark:bg-amber-200 dark:text-amber-950"
                            >
                              Reload the screen
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <div className="mx-auto flex w-full max-w-xl flex-wrap gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      className="rounded-xl border border-stone-300 px-4 py-3 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                    >
                      &larr; Back
                    </button>

                    <button
                      type="button"
                      onClick={() => step(1)}
                      // Only genuinely dead at the very end of the day, with
                      // nothing armed behind it.
                      disabled={atEnd && !armedItem}
                      className="min-w-32 flex-1 rounded-xl bg-amber-700 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-40"
                    >
                      {atEnd && armedItem ? `Next: ${armedItem.title}` : "Next"} &rarr;
                    </button>

                    {/* The sound comes out of the machine at the projector.
                        This is the instruction to it, not a player. */}
                    {plays(item) ? (
                      <button
                        type="button"
                        onClick={() => publish({ playing: !state.playing })}
                        className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                          state.playing
                            ? "bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-900"
                            : "bg-emerald-700 text-white hover:bg-emerald-800"
                        }`}
                      >
                        {state.playing ? (reallyPlaying ? "Stop" : "Cancel") : film(item) ? "Play" : "Start"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => publish({ blank: !state.blank })}
                      className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                        state.blank
                          ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                          : "border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                      }`}
                    >
                      {state.blank ? "Blanked" : "Blank"}
                    </button>
                  </div>

                  {item.offsiteRecordingOnly ? (
                    <p className="pt-2 text-xs text-stone-500">
                      Timed to a recording that isn&rsquo;t on the church machine &mdash; move
                      these slides by hand.
                    </p>
                  ) : null}
                </div>
              </li>
            );
          }

          const isPending = pending === item.id;

          return (
            <li key={item.id}>
             <div
              className={`rounded-xl border transition ${item.depth > 0 ? "ml-6" : ""} ${
                isPending
                  ? "border-amber-500 opacity-100 shadow"
                  : isArmed
                    ? "border-emerald-500 opacity-100"
                    : "border-stone-200 opacity-55 hover:opacity-100 dark:border-stone-800"
              } ${canShow ? "" : "opacity-40"}`}
             >
              <button
                type="button"
                // The first tap only chooses. See `pending`.
                onClick={() => canShow && setPending(isPending ? null : item.id)}
                disabled={!canShow}
                className="flex w-full items-center gap-3 p-2 text-left"
              >
                <span className="w-12 shrink-0 font-mono text-[0.7rem] text-amber-700 dark:text-amber-500">
                  {item.startsAt}
                </span>

                <ScreenPreview
                  aspect={screenAspect}
                  slide={item.slides[0] ?? null}
                  slideCount={item.slides.length}
                  background={item.background}
                  picture={
                    item.slides.length === 0 && item.attachment?.kind === "image"
                      ? item.attachment.url
                      : null
                  }
                  video={item.attachment?.kind === "video"}
                  className="w-16"
                />

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {[
                      item.musicalKey ? `key of ${item.musicalKey}` : "",
                      plays(item) ? "plays on tap" : "",
                      item.offsiteRecordingOnly ? "recording is a link only" : "",
                      // Why the box is greyed out, said on the box. Finding
                      // this out on the day is finding it out too late.
                      canShow ? "" : "nothing to show yet",
                      `${item.minutes} min`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>

                {isArmed && !isPending ? (
                  <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-500">
                    next
                  </span>
                ) : null}
              </button>

              {/* Asked, rather than assumed. The wording says what will happen
                  to the room, including the music. */}
              {isPending ? (
                <div className="flex gap-2 p-2 pt-0">
                  <button
                    type="button"
                    onClick={() => {
                      setPending(null);
                      activate(item);
                    }}
                    className="flex-1 rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
                  >
                    {plays(item) ? "Put it up and start" : "Put it up"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="rounded-lg border border-stone-300 px-4 py-2.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
             </div>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-stone-500">
        {serviceTitle} · tap a box, then confirm · arrows or space move the slides · B blanks
      </p>
    </div>
  );
}
