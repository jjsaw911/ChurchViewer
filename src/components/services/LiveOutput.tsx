"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DisplayLights } from "@/components/services/LinkLights";
import { useStayAwake } from "@/lib/services/awake";
import {
  publishLive,
  reportPlayback,
  useLiveState,
  usePresence,
} from "@/lib/services/live";
import { throughLimiter } from "@/lib/services/limiter";
import { slideAt } from "@/lib/songs/slides";
import { asGain, type LiveState } from "@/lib/live/protocol";
import type { PresentItem } from "@/lib/services/present";

/**
 * Playing the recording, here, on the machine wired to the sound system.
 *
 * The operator's phone says start; this is what starts. And because the slides
 * are timed against this audio, the display works out which one is up and
 * publishes it — while a song plays, the machine holding the recording knows
 * where the service is, and everything else follows it.
 */
function usePlayback(serviceId: string, state: LiveState, item: PresentItem | null): void {
  const audio = useRef<HTMLAudioElement | null>(null);
  const slide = useRef(state.slideIndex);
  const latest = useRef(state);

  useEffect(() => {
    slide.current = state.slideIndex;
    latest.current = state;
  }, [state]);

  const url = item?.followable ? item.audioUrl : null;
  const slides = item?.slides;
  const offset = item?.timingOffsetMs ?? 0;
  // A film is playing in its own element on the screen below. Start means that
  // one, and this must keep its hands off it.
  const elsewhere = item?.slides.length === 0 && item?.attachment?.kind === "video";

  // A display that opens mid-song must not start the track again from the top.
  // It has no idea how far in the room already is, so it says so — the flag
  // goes back to off and the operator presses Start when they mean it.
  const started = useRef(false);
  /** When this machine last said where it had got to. */
  const spoke = useRef(0);

  useEffect(() => {
    if (!state.playing) {
      started.current = false;
      return;
    }
    if (started.current) return;
    if (elsewhere) return;

    if (!url || !slides) {
      // Told to play something this machine has no recording of. Say so by
      // putting the flag back, so the operator's button doesn't sit there
      // claiming a song is running.
      publishLive(serviceId, { playing: false });
      return;
    }

    started.current = true;
    const element = new Audio();
    // Before the source, or the browser fetches it without CORS and the
    // limiter's graph comes out silent.
    element.crossOrigin = "anonymous";
    element.src = url;
    element.volume = asGain(latest.current.volume);
    audio.current = element;

    const closeGraph = throughLimiter(element);

    // Marking it `anonymous` is what lets the limiter see it, and it is also a
    // way to fail: a fetch the bucket won't answer cross-origin loads nothing
    // at all. So if the load fails, it is tried again plainly — no CORS, no
    // limiter, and sound.
    element.addEventListener("error", () => {
      closeGraph();
      const plain = new Audio(url);
      plain.volume = asGain(latest.current.volume);
      audio.current = plain;
      void plain.play().catch(() => {
        started.current = false;
        publishLive(serviceId, { playing: false });
      });
    });

    const follow = () => {
      // Whichever element is actually playing — the first one, or the plain
      // one that replaced it.
      const element = audio.current;
      if (!element) return;

      // Only while it is genuinely running. A blocked or failed start leaves
      // the position at zero, and following that would drag the screen back to
      // the first slide every quarter second — including over the operator.
      if (element.paused || element.currentTime <= 0) return;

      // Said out loud, about once a second: the remote has no other way to
      // know the difference between a song playing and a machine that never
      // heard the instruction.
      const now = Date.now();
      if (now - spoke.current > 900) {
        spoke.current = now;
        reportPlayback(serviceId, {
          position: element.currentTime,
          duration: Number.isFinite(element.duration) ? element.duration : 0,
        });
      }

      const index = slideAt(slides, element.currentTime * 1000, offset);
      if (index < 0 || index === slide.current) return;
      slide.current = index;

      // Only the slide. Anything else here would undo whatever the operator
      // did between one tick and the next.
      publishLive(serviceId, { slideIndex: index });
    };

    const timer = setInterval(follow, 250);

    // Autoplay is refused until a window has been interacted with. The Mac app
    // allows it outright; a browser window needs one click first — and if it is
    // refused, the flag goes back so the operator can see it didn't take.
    void element.play().catch(() => {
      started.current = false;
      publishLive(serviceId, { playing: false });
    });

    return () => {
      clearInterval(timer);
      audio.current?.pause();
      element.pause();
      closeGraph();
      audio.current = null;
    };
  }, [elsewhere, serviceId, state.playing, url, slides, offset]);

  // Turned from the remote, mid-song, by somebody who can hear the room.
  useEffect(() => {
    if (audio.current) audio.current.volume = asGain(state.volume);
  }, [state.volume]);
}

/**
 * A film on the projector: the picture, the sound, and nothing else.
 *
 * It runs and stops on the same instruction a song does, so the operator has
 * one Start whatever the box turns out to hold. Left paused rather than rewound
 * when they stop it, because stopping is nearly always so that it can carry on.
 */
function FilmScreen({
  url,
  playing,
  volume,
  onEnded,
}: {
  url: string;
  playing: boolean;
  volume: number;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;

    element.volume = asGain(volume);
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  }, [playing, url, volume]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <video
        ref={video}
        key={url}
        src={url}
        playsInline
        onEnded={onEnded}
        className="max-h-full max-w-full"
      />
    </div>
  );
}

/**
 * Load the whole page again, now and then, while nothing is on the screen.
 *
 * Two reasons, and a full reload is what covers both. Every recording and
 * picture here is a bucket URL signed when the page loaded, and signatures
 * expire — a projector window opened the night before is the ordinary case.
 * And this window stays open for weeks at a time, so without this it goes on
 * running whatever version of the app it happened to start with, and a fix
 * shipped on Thursday never reaches the room.
 *
 * Only while the screen is empty. Never, ever while something is on it.
 */
function useFreshLinks(idle: boolean): void {
  useEffect(() => {
    if (!idle) return;

    const timer = setInterval(() => window.location.reload(), 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, [idle]);
}

/**
 * Whether this window is allowed to make a noise yet.
 *
 * A browser refuses to play sound until somebody has interacted with the page,
 * and it cannot tell that Start was pressed by a person — the press happened on
 * an iPad across the room and arrived down a wire. So the recording is refused,
 * the flag goes back, and Start reads as a button that does nothing.
 *
 * The audio context knows: suspended means the refusal is coming. Asked
 * silently, so nothing is heard while finding out, and one click anywhere on
 * this window settles it for as long as it stays open. (The Mac app has no such
 * rule — it is told outright that this window may play.)
 */
function useSoundAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    const Context = window.AudioContext;
    if (!Context) return;

    const context = new Context();
    const check = () => setAllowed(context.state === "running");
    check();

    const unlock = () => void context.resume().then(check, check);
    window.addEventListener("click", unlock);
    window.addEventListener("keydown", unlock);

    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      void context.close();
    };
  }, []);

  return allowed;
}

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
 * The override, at the machine itself.
 *
 * Whoever is standing next to the projector needs to be able to stop the music
 * without finding the person holding the remote — the microphone fed back, or
 * the wrong song is playing, or somebody has started speaking over it. The two
 * things worth reaching for are pause and blank, and they are the same keys the
 * remote uses, which is also how the menu-bar item in the Mac app reaches them.
 */
function useOverrideKeys(serviceId: string, state: LiveState): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "p") publishLive(serviceId, { playing: !state.playing });
      else if (key === "b") publishLive(serviceId, { blank: !state.blank });
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [serviceId, state.blank, state.playing]);
}

/**
 * `2026-08-16` -> `Sunday, August 16`.
 *
 * Read from the back of a room, so the weekday is spelled out and the year is
 * left off — nobody standing in a church on Sunday morning is unsure which year
 * it is. Parsed as UTC, which is how the date is stored; letting it drift into
 * local time turns Sunday into Saturday for half the world.
 */
function longDate(heldOn: string): string {
  return new Date(`${heldOn}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
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
  /** Whose room this is — the banner before anything starts. */
  churchName,
  /** The day the service is planned for, as `YYYY-MM-DD`. */
  heldOn,
  items,
  /** The service's background, for the stretches when nothing is live. */
  fallbackBackground = null,
}: {
  serviceId: string;
  serviceTitle: string;
  churchName: string;
  heldOn: string;
  items: PresentItem[];
  fallbackBackground?: string | null;
}) {
  const state = useLiveState(serviceId, "display");
  const presence = usePresence(serviceId, "display");
  const soundAllowed = useSoundAllowed();
  useStayAwake();
  useOverrideKeys(serviceId, state);
  useFullscreenKey();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const playing = state.itemId ? byId.get(state.itemId) : undefined;

  usePlayback(serviceId, state, playing ?? null);
  useFreshLinks(!state.itemId && !state.playing);

  const item = state.itemId ? byId.get(state.itemId) : undefined;
  // Clamped: an index past the end used to fall through to the idle screen,
  // which reads as "the app broke" from the back of a room.
  const slide = state.blank
    ? null
    : item?.slides[Math.min(state.slideIndex, item.slides.length - 1)];
  // A picture with nothing written over it is the whole slide.
  const picture =
    !state.blank && !slide && item?.attachment?.kind === "image" ? item.attachment.url : null;
  // So is a film. It gets the screen and the sound, and the operator's Start is
  // what runs it — the same press that starts a song.
  const film =
    !state.blank && !slide && item?.attachment?.kind === "video" ? item.attachment.url : null;

  if (film) {
    return (
      <FilmScreen
        url={film}
        playing={state.playing}
        volume={state.volume}
        onEnded={() => publishLive(serviceId, { playing: false })}
      />
    );
  }

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

  // Blanking means black. A background showing through would be a screen that
  // still has something on it, which is the opposite of what was asked for.
  const background = state.blank ? null : (item?.backgroundUrl ?? fallbackBackground);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-12 text-white">
      {background ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={background}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          {/* Words first: a photograph is rarely dark enough on its own, and a
              line nobody at the back can read is worse than no picture. */}
          <div className="pointer-events-none absolute inset-0 bg-black/45" />
        </>
      ) : null}

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
      ) : state.blank ? (
        // Blanked on purpose. Nothing at all, not even the church's name — the
        // operator pressed it because something should not be on that screen,
        // and a banner is still something on the screen.
        <span className="sr-only">Screen blanked</span>
      ) : (
        // Between things: the room, and the day. This is on the wall the whole
        // time people are arriving — longer than any slide all morning — and a
        // black rectangle reads as a projector nobody switched on.
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-6xl font-semibold tracking-tight text-balance sm:text-7xl lg:text-8xl">
            {churchName}
          </h1>
          <p className="text-2xl font-medium text-white/70 sm:text-3xl">{longDate(heldOn)}</p>
        </div>
      )}

      {/* Low, small, and only while nothing is up: whether a remote has found
          this screen. Gone the instant there are words to read. */}
      {!slide && !state.blank ? (
        <div className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 text-white/25">
          {/* Said while there is still time to do something about it, and only
              ever on an empty screen. */}
          {soundAllowed ? null : (
            <p className="text-sm font-medium text-amber-400/80">
              Click this window once, so it can play the recordings.
            </p>
          )}
          <DisplayLights presence={presence} />
          <p className="text-[0.6rem] tracking-[0.2em] text-white/15 uppercase">
            {serviceTitle} · F for full screen
          </p>
        </div>
      ) : null}
    </div>
  );
}
