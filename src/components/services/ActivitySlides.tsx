"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importItemSlidesAction,
  importSlidesFromFileAction,
  saveItemSlidesAction,
} from "@/lib/services/actions";
import { IMPORTABLE } from "@/lib/services/import";
import { slidesFromText, type SlideSource } from "@/lib/services/slides";
import type { SlidePayload } from "@/lib/songs/types";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

type Props = {
  tenant: string;
  serviceId: string;
  itemId: string;
  initialSlides: SlidePayload[];
  /** The linked song's slides, shown when this activity has none of its own. */
  songSlides: SlidePayload[];
  songSlug: string | null;
  sources: SlideSource[];
};

/**
 * What goes on the screen during one activity.
 *
 * Slides here are advanced by hand, so they carry no timing worth editing —
 * unlike a song's, which are pinned to its recording. That makes this a much
 * plainer editor than `SlideEditor`: text, order, and where to get it from.
 */
export default function ActivitySlides({
  tenant,
  serviceId,
  itemId,
  initialSlides,
  songSlides,
  songSlug,
  sources,
}: Props) {
  const router = useRouter();
  const [slides, setSlides] = useState(initialSlides);
  const [paste, setPaste] = useState("");
  const [source, setSource] = useState("");
  const [fileKey, setFileKey] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Untouched, a song item shows the song's own slides — the ones timed to the
  // recording. Typing here is how you say "not this Sunday".
  const inherited = slides.length === 0 && songSlides.length > 0;

  const update = (index: number, patch: Partial<SlidePayload>) =>
    setSlides((current) =>
      current.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)),
    );

  const swap = (index: number, delta: number) =>
    setSlides((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const addSlide = () =>
    setSlides((current) => [
      ...current,
      { id: `slide-new-${current.length + 1}`, lines: [""], atMs: 0, endMs: 0 },
    ]);

  const save = () =>
    startTransition(async () => {
      const result = await saveItemSlidesAction({ tenant, serviceId, itemId, slides });
      if (result.ok) {
        setSlides(result.slides);
        setStatus(
          result.slides.length
            ? `Saved ${result.slides.length} slide${result.slides.length === 1 ? "" : "s"}.`
            : "Saved — no slides on this one.",
        );
        router.refresh();
      } else {
        setStatus(result.error);
      }
    });

  const importFrom = () =>
    startTransition(async () => {
      const result = await importItemSlidesAction({ tenant, serviceId, itemId, source });
      if (result.ok) {
        setSlides(result.slides);
        setStatus(`Copied ${result.slides.length} slides. Edit them here — the original is untouched.`);
        router.refresh();
      } else {
        setStatus(result.error);
      }
    });

  const takeCopy = () => {
    setSlides(songSlides);
    setStatus("Copied from the song. Save to keep the change for this service only.");
  };

  const grouped = ["Songs", "Other services"] as const;

  return (
    <div className="space-y-4">
      {inherited ? (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm dark:border-stone-800 dark:bg-stone-900/60">
          <p>
            Showing the song&apos;s own {songSlides.length} slides, timed to its recording.
          </p>
          <div className="flex flex-wrap gap-3 text-xs">
            {songSlug ? (
              <a
                href={`/admin/songs/${songSlug}`}
                className="font-medium text-amber-700 hover:underline dark:text-amber-500"
              >
                Edit the song&apos;s slides
              </a>
            ) : null}
            <button
              type="button"
              onClick={takeCopy}
              className="font-medium text-amber-700 hover:underline dark:text-amber-500"
            >
              Change them for this service only
            </button>
          </div>
        </div>
      ) : null}

      {slides.length > 0 ? (
        <ol className="space-y-2">
          {slides.map((slide, index) => (
            <li
              key={slide.id}
              className="rounded-lg border border-stone-200 p-3 dark:border-stone-800"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-stone-500">#{index + 1}</span>
                <input
                  aria-label={`Label for slide ${index + 1}`}
                  defaultValue={slide.label ?? ""}
                  placeholder="Label"
                  onBlur={(event) =>
                    update(index, { label: event.target.value.trim() || undefined })
                  }
                  className={`${field} w-28`}
                />
                <button
                  type="button"
                  onClick={() => swap(index, -1)}
                  disabled={index === 0}
                  className="text-stone-500 hover:underline disabled:opacity-40"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => swap(index, 1)}
                  disabled={index === slides.length - 1}
                  className="text-stone-500 hover:underline disabled:opacity-40"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => setSlides((c) => c.filter((_, i) => i !== index))}
                  className="ml-auto font-medium text-red-700 hover:underline dark:text-red-400"
                >
                  Remove
                </button>
              </div>
              <textarea
                aria-label={`Lines for slide ${index + 1}`}
                value={slide.lines.join("\n")}
                onChange={(event) => update(index, { lines: event.target.value.split("\n") })}
                rows={Math.max(2, slide.lines.length)}
                placeholder="One line per line on screen"
                className={`${field} font-medium`}
              />
            </li>
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700">
          {inherited
            ? "Nothing of its own — the song's slides are what will show."
            : "No slides yet. Type them, paste them, or copy them from somewhere."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {pending ? "Working…" : "Save slides"}
        </button>
        <button
          type="button"
          onClick={addSlide}
          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
        >
          Add a slide
        </button>
      </div>

      <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
        <summary className="cursor-pointer text-sm font-medium">Bring slides in</summary>

        <div className="space-y-4 pt-3">
          <div className="space-y-2">
            <label className="block text-xs font-medium" htmlFor={`paste-${itemId}`}>
              Paste the text
            </label>
            <textarea
              id={`paste-${itemId}`}
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              rows={4}
              placeholder={"Men's breakfast, Saturday 8am\nIn the hall\n\nBaptism class starts the 21st"}
              className={field}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!paste.trim()}
                onClick={() => {
                  setSlides((current) => [...current, ...slidesFromText(paste)]);
                  setPaste("");
                  setStatus("Added — check the wording, then save.");
                }}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-amber-400 disabled:opacity-50 dark:border-stone-700"
              >
                Turn into slides
              </button>
              <span className="text-xs text-stone-500">
                A blank line starts a new slide.
              </span>
            </div>
          </div>

          {/* The announcements almost always exist before anybody opens this,
              built somewhere else by somebody else. Retyping them is the work
              being done twice. */}
          <div className="space-y-2 border-t border-stone-200 pt-3 dark:border-stone-800">
            <label className="block text-xs font-medium" htmlFor={`file-${itemId}`}>
              Or upload a file
            </label>
            <input
              id={`file-${itemId}`}
              // Remounted after each attempt, so choosing the same file twice
              // in a row still counts as a change.
              key={fileKey}
              type="file"
              accept={IMPORTABLE.join(",")}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;

                const data = new FormData();
                data.set("file", file);

                startTransition(async () => {
                  const result = await importSlidesFromFileAction(
                    tenant,
                    serviceId,
                    itemId,
                    data,
                  );
                  setFileKey((count) => count + 1);

                  if (!result.ok) {
                    setStatus(result.error);
                    return;
                  }

                  setSlides(result.slides);
                  setStatus(
                    `Read ${result.slides.length} slide${
                      result.slides.length === 1 ? "" : "s"
                    } from ${file.name}. Check the wording.`,
                  );
                  router.refresh();
                });
              }}
              className="w-full text-xs file:mr-3 file:rounded-lg file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:border-amber-400 dark:file:border-stone-700 dark:file:bg-stone-900"
            />
            <p className="text-xs text-stone-500">
              PowerPoint, Word, or a plain text file. One slide per slide; in Word, a blank
              line starts a new one. The words come across — fonts, colours and clip art
              don&rsquo;t, because they&rsquo;re the parts that look wrong on a different
              projector. This replaces what&rsquo;s on this activity.
            </p>
          </div>

          {sources.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
              <label className="space-y-1 text-xs">
                <span className="block font-medium">Copy from</span>
                <select
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  className={`${field} w-64`}
                >
                  <option value="">—</option>
                  {grouped.map((group) => {
                    const inGroup = sources.filter((option) => option.group === group);
                    if (inGroup.length === 0) return null;
                    return (
                      <optgroup key={group} label={group}>
                        {inGroup.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <button
                type="button"
                onClick={importFrom}
                disabled={!source || pending}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-amber-400 disabled:opacity-50 dark:border-stone-700"
              >
                Copy them here
              </button>
              <p className="w-full text-xs text-stone-500">
                Replaces what&apos;s on this activity. The source keeps its own copy.
              </p>
            </div>
          ) : null}
        </div>
      </details>

      {status ? <p className="text-sm text-stone-600 dark:text-stone-400">{status}</p> : null}
    </div>
  );
}
