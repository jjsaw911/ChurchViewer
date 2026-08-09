"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Media } from "@/lib/types";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** Don't offer to resume right at the start, or once you've basically finished. */
const RESUME_MIN_SECONDS = 30;
const RESUME_TAIL_SECONDS = 60;

const progressKey = (slug: string) => `churchviewer:progress:${slug}`;

function formatTimestamp(seconds: number): string {
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function readSavedPosition(slug: string): number {
  const raw = window.localStorage.getItem(progressKey(slug));
  const parsed = raw === null ? NaN : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

type Props = {
  /** Keys the saved playback position — one entry per sermon. */
  slug: string;
  title: string;
  media: Media;
};

export default function MediaPlayer({ slug, title, media }: Props) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const lastSavedSecond = useRef(-1);
  /** Which sermon we've already restored, so we only ever resume once per file. */
  const resumedSlug = useRef<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  // Pick up where this listener left off, once we know how long the file is.
  const applyResume = useCallback(() => {
    const el = mediaRef.current;
    if (!el || resumedSlug.current === slug || !Number.isFinite(el.duration)) return;
    resumedSlug.current = slug;
    const saved = readSavedPosition(slug);
    if (saved > RESUME_MIN_SECONDS && saved < el.duration - RESUME_TAIL_SECONDS) {
      el.currentTime = saved;
      setResumedFrom(saved);
    }
  }, [slug]);

  const handleTimeUpdate = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    // A stray timeupdate at 0 (say, on load) must not clobber a saved position.
    if (el.currentTime < 1) return;
    // timeupdate fires ~4x a second; one write per whole second is plenty.
    const second = Math.floor(el.currentTime);
    if (second === lastSavedSecond.current) return;
    lastSavedSecond.current = second;
    window.localStorage.setItem(progressKey(slug), String(second));
  }, [slug]);

  const clearProgress = useCallback(() => {
    window.localStorage.removeItem(progressKey(slug));
    lastSavedSecond.current = -1;
    setResumedFrom(null);
  }, [slug]);

  const startOver = useCallback(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = 0;
    clearProgress();
  }, [clearProgress]);

  useEffect(() => {
    const el = mediaRef.current;
    if (el) el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    const el = mediaRef.current;
    // Metadata can land before hydration attaches onLoadedMetadata — if the
    // browser already knows the duration, resume now instead of waiting for an
    // event that has already fired.
    if (el && el.readyState >= el.HAVE_METADATA) applyResume();
  }, [applyResume]);

  const attach = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el;
  }, []);

  const fallback = <>Your browser can&rsquo;t play this recording.</>;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-black shadow-sm dark:border-stone-800">
        {media.kind === "video" ? (
          <video
            ref={attach}
            aria-label={title}
            poster={media.poster}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={applyResume}
            onTimeUpdate={handleTimeUpdate}
            onEnded={clearProgress}
            className="aspect-video w-full"
          >
            <source src={media.src} />
            {media.captions ? (
              <track
                kind="captions"
                src={media.captions}
                srcLang="en"
                label="English"
                default
              />
            ) : null}
            {fallback}
          </video>
        ) : (
          <div className="flex flex-col gap-4 bg-stone-900 p-6">
            <p className="text-sm font-medium tracking-wide text-stone-400 uppercase">
              Audio recording
            </p>
            <audio
              ref={attach}
              aria-label={title}
              controls
              preload="metadata"
              onLoadedMetadata={applyResume}
              onTimeUpdate={handleTimeUpdate}
              onEnded={clearProgress}
              className="w-full"
            >
              <source src={media.src} />
              {fallback}
            </audio>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <label className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
          <span>Speed</span>
          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            className="rounded-md border border-stone-300 bg-transparent px-2 py-1 dark:border-stone-700"
          >
            {SPEEDS.map((option) => (
              <option key={option} value={option}>
                {option}&times;
              </option>
            ))}
          </select>
        </label>

        {resumedFrom !== null ? (
          <p className="text-stone-600 dark:text-stone-400">
            Resumed from {formatTimestamp(resumedFrom)} &middot;{" "}
            <button
              type="button"
              onClick={startOver}
              className="font-medium text-amber-700 underline underline-offset-2 hover:text-amber-600 dark:text-amber-500"
            >
              Start over
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}
