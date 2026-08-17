"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SongPlayer, { type PlayerControls } from "@/components/songs/SongPlayer";
import { slideAt } from "@/lib/songs/slides";
import type { SlidePayload } from "@/lib/songs/types";

type Props = {
  title: string;
  videoId: string | null;
  audioUrl: string | null;
  slides: SlidePayload[];
  offsetMs: number;
};

/**
 * The screen the congregation sees. Slides follow the recording on their own;
 * the operator keeps arrow keys and a manual hold for when they shouldn't.
 */
export default function Presenter({ title, videoId, audioUrl, slides, offsetMs }: Props) {
  const [positionMs, setPositionMs] = useState(0);
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [showControls, setShowControls] = useState(true);
  const controls = useRef<PlayerControls | null>(null);

  const autoIndex = useMemo(
    () => slideAt(slides, positionMs, offsetMs),
    [slides, positionMs, offsetMs],
  );
  const index = manualIndex ?? autoIndex;
  const slide = index >= 0 ? slides[index] : null;

  const onControls = useCallback((next: PlayerControls) => {
    controls.current = next;
  }, []);

  /** Stepping by hand jumps the recording too, so audio and screen stay together. */
  const step = useCallback(
    (delta: number) => {
      const next = Math.min(slides.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta));
      setManualIndex(next);
      controls.current?.seekToMs(slides[next]?.atMs ?? 0);
      // Following the recording again is the normal state; snap back to it.
      window.setTimeout(() => setManualIndex(null), 400);
    },
    [index, slides],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        step(-1);
      } else if (event.key.toLowerCase() === "c") {
        setShowControls((shown) => !shown);
      } else if (event.key.toLowerCase() === "f") {
        void document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <div className="flex min-h-screen flex-col bg-black text-white">
      <div className="flex flex-1 items-center justify-center px-8 py-16">
        {slide ? (
          <div className="space-y-6 text-center">
            {slide.label ? (
              <p className="text-sm font-semibold tracking-[0.3em] text-white/40 uppercase">
                {slide.label}
              </p>
            ) : null}
            {slide.lines.map((line, i) => (
              <p
                key={i}
                className="text-4xl leading-tight font-semibold text-balance sm:text-5xl lg:text-6xl"
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-2xl text-white/40">{title}</p>
        )}
      </div>

      {showControls ? (
        <div className="border-t border-white/10 bg-black/80 p-4">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4">
            <SongPlayer
              videoId={videoId}
              audioUrl={audioUrl}
              onTime={setPositionMs}
              onControls={onControls}
              className={videoId ? "w-56 shrink-0" : "min-w-64 flex-1"}
            />
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => step(-1)}
                className="rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10"
              >
                &larr; Back
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="rounded-lg border border-white/20 px-3 py-2 hover:bg-white/10"
              >
                Next &rarr;
              </button>
              <span className="ml-2 text-white/50">
                {index >= 0 ? index + 1 : 0} / {slides.length}
              </span>
            </div>
            <p className="ml-auto text-xs text-white/40">
              Arrows or space to step &middot; F for full screen &middot; C hides this bar
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
