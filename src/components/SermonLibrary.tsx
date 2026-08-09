"use client";

import { useMemo, useState } from "react";
import SermonCard from "@/components/SermonCard";
import type { Sermon, Series } from "@/lib/types";

const ALL = "all";

function matchesQuery(sermon: Sermon, query: string): boolean {
  const haystack = [
    sermon.title,
    sermon.speaker,
    sermon.scripture,
    sermon.description,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

type Props = {
  sermons: Sermon[];
  series: Series[];
  speakers: string[];
};

export default function SermonLibrary({ sermons, series, speakers }: Props) {
  const [query, setQuery] = useState("");
  const [seriesSlug, setSeriesSlug] = useState(ALL);
  const [speaker, setSpeaker] = useState(ALL);

  const results = useMemo(
    () =>
      sermons.filter(
        (sermon) =>
          (seriesSlug === ALL || sermon.seriesSlug === seriesSlug) &&
          (speaker === ALL || sermon.speaker === speaker) &&
          matchesQuery(sermon, query),
      ),
    [sermons, query, seriesSlug, speaker],
  );

  const isFiltered = query !== "" || seriesSlug !== ALL || speaker !== ALL;

  const clear = () => {
    setQuery("");
    setSeriesSlug(ALL);
    setSpeaker(ALL);
  };

  const selectClass =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-900";

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, speaker, or passage"
          aria-label="Search sermons"
          className="min-w-64 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
        />

        <select
          value={seriesSlug}
          onChange={(event) => setSeriesSlug(event.target.value)}
          aria-label="Filter by series"
          className={selectClass}
        >
          <option value={ALL}>All series</option>
          {series.map((entry) => (
            <option key={entry.slug} value={entry.slug}>
              {entry.title}
            </option>
          ))}
        </select>

        <select
          value={speaker}
          onChange={(event) => setSpeaker(event.target.value)}
          aria-label="Filter by speaker"
          className={selectClass}
        >
          <option value={ALL}>All speakers</option>
          {speakers.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between text-sm text-stone-600 dark:text-stone-400">
        <p aria-live="polite">
          {results.length} {results.length === 1 ? "message" : "messages"}
        </p>
        {isFiltered ? (
          <button
            type="button"
            onClick={clear}
            className="font-medium text-amber-700 underline underline-offset-2 hover:text-amber-600 dark:text-amber-500"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {results.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-500 dark:border-stone-700">
          Nothing matches that search yet.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((sermon) => (
            <SermonCard key={sermon.slug} sermon={sermon} />
          ))}
        </div>
      )}
    </section>
  );
}
