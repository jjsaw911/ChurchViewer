"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchMediaAction, type MediaItem } from "@/lib/media/actions";
import type { MediaKind } from "@/lib/media/service";

const PAGE = 24;

const KIND_LABEL: Record<MediaKind, string> = {
  audio: "Audio",
  video: "Video",
  image: "Pictures",
  captions: "Captions",
  other: "Other",
};

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/** The thumbnail, or the closest thing this kind of file has to one. */
export function MediaThumb({ item, className = "" }: { item: MediaItem; className?: string }) {
  if (item.kind === "image" && item.url) {
    return (
      // Deliberately not next/image: these are signed bucket URLs that change
      // every few hours, so there's nothing for the optimiser to cache.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.url}
        alt=""
        className={`h-full w-full bg-stone-100 object-cover dark:bg-stone-800 ${className}`}
      />
    );
  }

  const glyph = item.kind === "audio" ? "♪" : item.kind === "video" ? "▶" : "◻";
  return (
    <div
      className={`flex h-full w-full items-center justify-center bg-stone-100 text-xl text-stone-400 dark:bg-stone-800 ${className}`}
    >
      {glyph}
    </div>
  );
}

/**
 * The church's files, in a window you can scroll and search.
 *
 * Opened from anywhere a file is wanted, so the answer to "where's that clip
 * from Easter?" is a search box rather than someone's downloads folder. Results
 * are paged from the server as you scroll — a church with a decade of recording
 * behind it shouldn't be slower to search than one with a fortnight.
 */
export default function MediaPicker({
  tenant,
  kinds,
  title = "Choose a file",
  onPick,
  onClose,
}: {
  tenant: string;
  /** Limit to what this field can actually use. Omit for everything. */
  kinds?: MediaKind[];
  title?: string;
  onPick: (item: MediaItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest search may write to the list: type fast enough and the
  // answers come back out of order.
  const request = useRef(0);

  // A string rather than the array: `kinds` is written out at every call site,
  // so a fresh array arrives on every render and would restart the search.
  const kindKey = kinds?.join(",") ?? "";

  const load = useCallback(
    async (term: string, offset: number) => {
      const ticket = ++request.current;
      setBusy(true);
      setError(null);

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
      } catch {
        if (ticket === request.current) setError("Couldn't reach the library.");
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900"
      >
        <div className="flex items-center gap-3 border-b border-stone-200 p-4 dark:border-stone-800">
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search the media library"
            className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:underline"
          >
            Close
          </button>
        </div>

        <div className="min-h-40 flex-1 overflow-y-auto p-4">
          {items.length === 0 && !busy ? (
            <p className="p-8 text-center text-sm text-stone-500">
              {search ? `Nothing matching “${search}”.` : "Nothing in the library yet."}
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onPick(item)}
                    className="flex w-full items-center gap-3 rounded-xl border border-stone-200 p-2 text-left hover:border-amber-400 dark:border-stone-800"
                  >
                    <span className="h-12 w-16 shrink-0 overflow-hidden rounded-lg">
                      <MediaThumb item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-stone-500">
                        {[KIND_LABEL[item.kind], formatBytes(item.bytes), item.filename]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error ? <p className="p-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}

          {hasMore ? (
            <div className="pt-4 text-center">
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
      </div>
    </div>
  );
}
