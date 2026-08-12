"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { publishLive, useLiveState } from "@/lib/services/live";
import { slideAt } from "@/lib/songs/slides";
import type { LiveState } from "@/lib/live/protocol";
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
    const element = new Audio(url);
    audio.current = element;

    const follow = () => {
      // Only while it is genuinely running. A blocked or failed start leaves
      // the position at zero, and following that would drag the screen back to
      // the first slide every quarter second — including over the operator.
      if (element.paused || element.currentTime <= 0) return;

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
      element.pause();
      audio.current = null;
    };
  }, [elsewhere, serviceId, state.playing, url, slides, offset]);
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
  onEnded,
}: {
  url: string;
  playing: boolean;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;

    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  }, [playing, url]);

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
 * Fetch the slides again while nothing is up, so their links stay alive.
 *
 * Every recording and picture on this page is a bucket URL signed when the page
 * loaded, and signatures expire. A projector window opened the night before is
 * the ordinary case, not the unusual one — so it quietly refetches while the
 * screen is empty, and never, ever while something is on it.
 */
function useFreshLinks(idle: boolean): void {
  const router = useRouter();

  useEffect(() => {
    if (!idle) return;

    const timer = setInterval(() => router.refresh(), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [idle, router]);
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
  /** The service's background, for the stretches when nothing is live. */
  fallbackBackground = null,
}: {
  serviceId: string;
  serviceTitle: string;
  items: PresentItem[];
  fallbackBackground?: string | null;
}) {
  const state = useLiveState(serviceId);
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
      ) : (
        // Only while nothing is up: the moment there are words on the screen,
        // the screen has nothing on it but the words.
        // Idle means black. A title card is still something the room can
        // read, and the point of "nothing on screen" is nothing on screen.
        <p className="text-[0.6rem] tracking-[0.2em] text-white/10 uppercase">
          {serviceTitle} · F for full screen
        </p>
      )}
    </div>
  );
}
