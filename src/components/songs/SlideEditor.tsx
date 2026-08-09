"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SongPlayer, { type PlayerControls } from "@/components/songs/SongPlayer";
import { saveSlidesAction } from "@/lib/songs/actions";
import { slideAt } from "@/lib/songs/slides";
import type { SlidePayload } from "@/lib/songs/types";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/** `95300` -> `1:35.3` — precise enough to line a slide up by ear. */
function formatMs(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}

/** Accepts `1:35.3`, `95.3`, or `95` — whatever the operator types. */
function parseMs(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const [minutes, seconds] = trimmed.split(":");
    const m = Number(minutes);
    const s = Number(seconds);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return Math.round((m * 60 + s) * 1000);
  }

  const seconds = Number(trimmed);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : null;
}

type Props = {
  tenant: string;
  slug: string;
  title: string;
  videoId: string | null;
  audioUrl: string | null;
  initialSlides: SlidePayload[];
  initialOffsetMs: number;
  canTranscribe: boolean;
  hasAudio: boolean;
};

export default function SlideEditor({
  tenant,
  slug,
  title,
  videoId,
  audioUrl,
  initialSlides,
  initialOffsetMs,
  canTranscribe,
  hasAudio,
}: Props) {
  const router = useRouter();
  const [slides, setSlides] = useState<SlidePayload[]>(initialSlides);
  const [offsetMs, setOffsetMs] = useState(initialOffsetMs);
  const [positionMs, setPositionMs] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controls = useRef<PlayerControls | null>(null);

  // Which slide is on screen depends on time order, but the *edit list* stays in
  // the order the operator sees. Re-sorting as they retype a time would slide
  // rows out from under the cursor mid-edit.
  const inTimeOrder = useMemo(
    () => [...slides].sort((a, b) => a.atMs - b.atMs),
    [slides],
  );
  const activeId = useMemo(() => {
    const index = slideAt(inTimeOrder, positionMs, offsetMs);
    return index >= 0 ? inTimeOrder[index].id : null;
  }, [inTimeOrder, positionMs, offsetMs]);
  const activeSlide = inTimeOrder.find((slide) => slide.id === activeId) ?? null;

  const onControls = useCallback((next: PlayerControls) => {
    controls.current = next;
  }, []);

  const update = (index: number, patch: Partial<SlidePayload>) =>
    setSlides((current) =>
      current.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)),
    );

  const addSlideHere = () => {
    const at = controls.current?.positionMs() ?? positionMs;
    setSlides((current) => [
      ...current,
      {
        id: `slide-new-${current.length + 1}-${at}`,
        lines: ["New slide"],
        atMs: at,
        endMs: at + 4000,
      },
    ]);
  };

  /** The fastest way to fix timing: play it, and tap as each line comes round. */
  const stampNow = (index: number) => {
    const at = controls.current?.positionMs() ?? positionMs;
    update(index, { atMs: at });
  };

  const save = async () => {
    setBusy(true);
    setStatus(null);
    const result = await saveSlidesAction({ tenant, slug, slides, timingOffsetMs: offsetMs });
    setBusy(false);
    setStatus(result.ok ? "Saved." : result.error);
    if (result.ok) router.refresh();
  };

  const transcribe = async () => {
    setBusy(true);
    setStatus("Transcribing — this takes about a minute for a full song…");
    try {
      const response = await fetch("/api/songs/transcribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant, slug, tidy: true }),
      });
      const data = (await response.json()) as { slides?: SlidePayload[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Transcription failed.");
      setSlides(data.slides ?? []);
      setStatus(`Built ${data.slides?.length ?? 0} slides. Check the wording before Sunday.`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Transcription failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
      <div className="space-y-4 lg:sticky lg:top-6">
        <SongPlayer
          videoId={videoId}
          audioUrl={audioUrl}
          onTime={setPositionMs}
          onControls={onControls}
        />

        <div className="rounded-xl border border-stone-200 bg-stone-900 p-6 text-center dark:border-stone-800">
          {activeSlide ? (
            <div className="space-y-1">
              {activeSlide.lines.map((line, i) => (
                <p key={i} className="text-xl font-semibold text-balance text-white">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              {slides.length ? "Before the first slide" : "No slides yet"}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-mono text-stone-500">{formatMs(positionMs)}</span>
          <label className="flex items-center gap-2">
            <span className="text-stone-600 dark:text-stone-400">Nudge</span>
            <input
              type="number"
              step={100}
              value={offsetMs}
              onChange={(event) => setOffsetMs(Number(event.target.value) || 0)}
              className={`${field} w-28`}
            />
            <span className="text-stone-500">ms</span>
          </label>
        </div>
        <p className="text-xs text-stone-500">
          A positive nudge shows every slide later; negative shows them earlier. Slides are put
          back in time order when you save.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
          >
            {busy ? "Working…" : "Save slides"}
          </button>
          <button
            type="button"
            onClick={addSlideHere}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Add slide at {formatMs(positionMs)}
          </button>
          <a
            href={`/present/songs/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Open presenter
          </a>
        </div>

        <div className="space-y-2 border-t border-stone-200 pt-4 dark:border-stone-800">
          <button
            type="button"
            onClick={transcribe}
            disabled={busy || !canTranscribe || !hasAudio}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 disabled:opacity-50 dark:border-stone-700"
          >
            Transcribe with AI
          </button>
          {!hasAudio ? (
            <p className="text-xs text-stone-500">
              Add an audio file first — transcription reads the recording, not the video link.
            </p>
          ) : null}
          {hasAudio && !canTranscribe ? (
            <p className="text-xs text-stone-500">
              Set OPENAI_API_KEY on the server to enable transcription.
            </p>
          ) : null}
          <p className="text-xs text-stone-500">
            Rebuilding replaces every slide below. Only transcribe recordings your church has the
            right to use.
          </p>
        </div>

        {status ? <p className="text-sm text-stone-600 dark:text-stone-400">{status}</p> : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            Slides for {title}{" "}
            <span className="font-normal text-stone-500">({slides.length})</span>
          </h2>
        </div>

        {slides.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500 dark:border-stone-700">
            No slides yet. Transcribe the recording, or add them by hand as the song plays.
          </p>
        ) : (
          <ol className="space-y-3">
            {slides.map((slide, index) => (
              <li
                key={slide.id}
                className={`rounded-xl border p-4 transition ${
                  slide.id === activeId
                    ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                    : "border-stone-200 dark:border-stone-800"
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-stone-500">#{index + 1}</span>
                  <input
                    aria-label={`Start time for slide ${index + 1}`}
                    defaultValue={formatMs(slide.atMs)}
                    onBlur={(event) => {
                      const ms = parseMs(event.target.value);
                      if (ms === null) event.target.value = formatMs(slide.atMs);
                      else update(index, { atMs: ms });
                    }}
                    className={`${field} w-24 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => stampNow(index)}
                    className="rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:border-amber-400 dark:border-stone-700"
                  >
                    Set to now
                  </button>
                  <button
                    type="button"
                    onClick={() => controls.current?.seekToMs(slide.atMs)}
                    className="rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:border-amber-400 dark:border-stone-700"
                  >
                    Jump here
                  </button>
                  <input
                    aria-label={`Label for slide ${index + 1}`}
                    defaultValue={slide.label ?? ""}
                    placeholder="Chorus"
                    onBlur={(event) => update(index, { label: event.target.value.trim() || undefined })}
                    className={`${field} w-28`}
                  />
                  <button
                    type="button"
                    onClick={() => setSlides((c) => c.filter((_, i) => i !== index))}
                    className="ml-auto text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                  >
                    Remove
                  </button>
                </div>

                <textarea
                  aria-label={`Lines for slide ${index + 1}`}
                  value={slide.lines.join("\n")}
                  onChange={(event) => update(index, { lines: event.target.value.split("\n") })}
                  rows={Math.max(2, slide.lines.length)}
                  className={`${field} font-medium`}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
