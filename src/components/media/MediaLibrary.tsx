"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FileDrop from "@/components/media/FileDrop";
import { MediaThumb, formatBytes } from "@/components/media/MediaPicker";
import {
  deleteMediaAction,
  renameMediaAction,
  searchMediaAction,
  type MediaItem,
} from "@/lib/media/actions";
import type { MediaKind } from "@/lib/media/service";
import { uploadToLibrary } from "@/lib/media/upload";

const PAGE = 24;

/** Where a recording has got to, said the way somebody waiting would say it. */
const STATUS_WORDING: Record<string, string> = {
  draft: "no slides yet",
  queued: "waiting for the worker",
  extracting: "pulling the audio out…",
  transcribing: "transcribing…",
  failed: "needs attention",
};

const FILTERS: { label: string; kinds?: MediaKind[] }[] = [
  { label: "Everything" },
  { label: "Audio", kinds: ["audio"] },
  { label: "Video", kinds: ["video"] },
  { label: "Pictures", kinds: ["image"] },
  { label: "Captions", kinds: ["captions"] },
];

const field =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/** The player for whatever this is, so a file can be checked without leaving. */
function Preview({ item }: { item: MediaItem }) {
  if (!item.url) {
    return <p className="text-xs text-stone-500">No playable link — uploads aren&apos;t set up.</p>;
  }
  if (item.kind === "audio") {
    return <audio controls preload="none" src={item.url} className="w-full" />;
  }
  if (item.kind === "video") {
    return <video controls preload="metadata" src={item.url} className="max-h-64 w-full rounded-lg bg-black" />;
  }
  if (item.kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt={item.title} className="max-h-64 rounded-lg" />;
  }
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="text-sm font-medium text-amber-700 hover:underline dark:text-amber-500"
    >
      Open the file
    </a>
  );
}

/**
 * Everything the church has uploaded: searchable, scrollable, and the place a
 * file can be renamed into something a human would recognise a year later.
 */
export default function MediaLibrary({
  tenant,
  uploadsEnabled,
}: {
  tenant: string;
  uploadsEnabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(0);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState<{
    done: number;
    total: number;
    percent: number;
  } | null>(null);
  const request = useRef(0);

  // A string rather than the array, so switching back to a filter you were on
  // doesn't count as a new one and restart the search.
  const kindKey = FILTERS[filter].kinds?.join(",") ?? "";

  const load = useCallback(
    async (term: string, offset: number) => {
      const ticket = ++request.current;
      setBusy(true);
      try {
        const result = await searchMediaAction({
          tenant,
          search: term,
          kinds: kindKey ? (kindKey.split(",") as MediaKind[]) : undefined,
          offset,
          limit: PAGE,
        });
        if (ticket !== request.current) return;
        setItems((current) => (offset === 0 ? result.items : [...current, ...result.items]));
        setHasMore(result.hasMore);
      } finally {
        if (ticket === request.current) setBusy(false);
      }
    },
    [tenant, kindKey],
  );

  useEffect(() => {
    const timer = setTimeout(() => void load(search, 0), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [search, load]);

  /** Straight to the bucket, one at a time, then into the library. */
  async function uploadAll(files: File[]) {
    setStatus(null);
    setUploading({ done: 0, total: files.length, percent: 0 });

    for (const [index, file] of files.entries()) {
      try {
        const item = await uploadToLibrary(tenant, file, (percent) =>
          setUploading({ done: index, total: files.length, percent }),
        );
        setItems((current) => [item, ...current]);
      } catch (error) {
        setStatus(
          `${file.name}: ${error instanceof Error ? error.message : "upload failed"}`,
        );
      }
      setUploading({ done: index + 1, total: files.length, percent: 100 });
    }

    setUploading(null);
  }

  const rename = async (item: MediaItem, title: string) => {
    if (title === item.title) return;
    const result = await renameMediaAction({ tenant, id: item.id, title });
    if (result.ok) {
      setItems((current) =>
        current.map((row) => (row.id === item.id ? { ...row, title } : row)),
      );
    } else {
      setStatus(result.error ?? "Couldn't rename it.");
    }
  };

  const remove = async (item: MediaItem, evenIfUsed = false) => {
    const result = await deleteMediaAction({ tenant, id: item.id, evenIfUsed });

    if (result.ok) {
      setItems((current) => current.filter((row) => row.id !== item.id));
      setStatus(`Deleted ${item.title}.`);
      return;
    }

    // Used somewhere: say so, and let the same button through a second time.
    if (
      result.usedBy &&
      window.confirm(
        `${result.error} Deleting it will leave them with nothing to play. Delete anyway?`,
      )
    ) {
      await remove(item, true);
    }
  };

  return (
    <div className="space-y-5">
      {uploadsEnabled ? (
        <FileDrop
          onFiles={(files) => void uploadAll(files)}
          busy={uploading !== null}
          label={
            uploading
              ? `Uploading ${Math.min(uploading.done + 1, uploading.total)} of ${uploading.total} — ${uploading.percent}%`
              : "Drop files here, or click to choose them"
          }
          hint="Audio, video, pictures, captions. As many at once as you like."
        />
      ) : (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700">
          Uploads aren&apos;t configured on this server — set GCS_BUCKET to store files here.
        </p>
      )}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name"
        className={`${field} w-full`}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((option, index) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setFilter(index)}
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              index === filter
                ? "bg-amber-700 text-white"
                : "border border-stone-300 hover:border-amber-400 dark:border-stone-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {status ? <p className="text-sm text-stone-600 dark:text-stone-400">{status}</p> : null}

      {items.length === 0 && !busy ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-12 text-center text-sm text-stone-500 dark:border-stone-700">
          {search ? `Nothing matching “${search}”.` : "Nothing uploaded yet."}
        </p>
      ) : (
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-stone-200 dark:border-stone-800"
            >
              <div className="flex items-center gap-3 p-2">
                <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg">
                  <MediaThumb item={item} />
                </span>

                <input
                  aria-label={`Name of ${item.filename}`}
                  defaultValue={item.title}
                  onBlur={(event) => void rename(item, event.target.value.trim())}
                  className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-stone-300 focus:border-amber-500 focus:outline-none dark:hover:border-stone-700"
                />

                {/* A recording and the words that came out of it are the same
                    thing to whoever is looking for them. */}
                {item.song ? (
                  <a
                    href={`/admin/songs/${item.song.slug}`}
                    className="rounded-full border border-amber-400 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                  >
                    {item.song.slideCount > 0
                      ? `${item.song.slideCount} slides`
                      : STATUS_WORDING[item.song.status] ?? "no slides yet"}
                  </a>
                ) : null}

                <span className="hidden text-xs text-stone-500 sm:inline">
                  {[item.kind, formatBytes(item.bytes)].filter(Boolean).join(" · ")}
                </span>
                <button
                  type="button"
                  onClick={() => setOpenId(openId === item.id ? null : item.id)}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                >
                  {openId === item.id ? "Hide" : "Preview"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(item)}
                  className="px-2 py-1 text-xs font-medium text-red-700 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </div>

              {openId === item.id ? (
                <div className="space-y-3 border-t border-stone-100 p-3 dark:border-stone-800">
                  <Preview item={item} />

                  {item.song ? (
                    <div className="space-y-1 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                      <p className="text-xs font-medium">
                        Slides from this recording ·{" "}
                        <a
                          href={`/admin/songs/${item.song.slug}`}
                          className="text-amber-700 hover:underline dark:text-amber-500"
                        >
                          {item.song.title}
                        </a>
                      </p>

                      {item.song.openingLines.length > 0 ? (
                        <ol className="space-y-0.5 text-xs text-stone-600 dark:text-stone-400">
                          {item.song.openingLines.map((line, index) => (
                            <li key={index} className="truncate">
                              {index + 1}. {line}
                            </li>
                          ))}
                          {item.song.slideCount > item.song.openingLines.length ? (
                            <li className="text-stone-400">
                              …and {item.song.slideCount - item.song.openingLines.length} more
                            </li>
                          ) : null}
                        </ol>
                      ) : (
                        <p className="text-xs text-stone-500">
                          {STATUS_WORDING[item.song.status] ?? "No slides on it yet."}
                        </p>
                      )}
                    </div>
                  ) : null}

                  <p className="text-xs text-stone-500">
                    {item.filename} · added{" "}
                    {new Date(item.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="text-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void load(search, items.length)}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 disabled:opacity-60 dark:border-stone-700"
          >
            {busy ? "Loading…" : "Show more"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
