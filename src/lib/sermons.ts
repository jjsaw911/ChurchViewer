import { sermons } from "@/data/sermons";
import { series } from "@/data/series";
import type { Sermon, Series } from "@/lib/types";

const byNewestFirst = (a: Sermon, b: Sermon) => b.date.localeCompare(a.date);

/** Every sermon, newest first. */
export function getAllSermons(): Sermon[] {
  return [...sermons].sort(byNewestFirst);
}

export function getSermon(slug: string): Sermon | undefined {
  return sermons.find((s) => s.slug === slug);
}

/** The most recent message — what the home page leads with. */
export function getLatestSermon(): Sermon {
  return getAllSermons()[0];
}

export function getAllSeries(): Series[] {
  return series;
}

export function getSeries(slug: string): Series | undefined {
  return series.find((s) => s.slug === slug);
}

export function getSermonsInSeries(slug: string): Sermon[] {
  return getAllSermons().filter((s) => s.seriesSlug === slug);
}

/** Speakers with at least one message, alphabetical. */
export function getSpeakers(): string[] {
  return [...new Set(sermons.map((s) => s.speaker))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** The next message in the same series, if there is one. */
export function getNextInSeries(sermon: Sermon): Sermon | undefined {
  if (!sermon.seriesSlug) return undefined;
  const inSeries = getSermonsInSeries(sermon.seriesSlug);
  const index = inSeries.findIndex((s) => s.slug === sermon.slug);
  // The list runs newest first, so "next" is the entry before this one.
  return index > 0 ? inSeries[index - 1] : undefined;
}

export function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

export function formatDate(isoDate: string): string {
  // Parse as UTC so the rendered date can't drift a day by server timezone.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
