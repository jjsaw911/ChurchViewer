import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { sermons, series } from "@/db/schema";
import { playbackUrl } from "@/lib/storage";
import type { SeriesSummary, SermonDetail, SermonSummary } from "@/lib/types";

type SermonRow = typeof sermons.$inferSelect;
type SeriesRow = typeof series.$inferSelect;

const sermonWithSeries = {
  sermon: sermons,
  seriesSlug: series.slug,
  seriesTitle: series.title,
};

async function toSummary(row: {
  sermon: SermonRow;
  seriesSlug: string | null;
  seriesTitle: string | null;
}): Promise<SermonSummary> {
  return {
    slug: row.sermon.slug,
    title: row.sermon.title,
    speaker: row.sermon.speaker,
    date: row.sermon.preachedOn,
    scripture: row.sermon.scripture,
    durationSeconds: row.sermon.durationSeconds,
    mediaKind: row.sermon.mediaKind,
    posterUrl: await playbackUrl(row.sermon.posterSrc),
    seriesSlug: row.seriesSlug,
    seriesTitle: row.seriesTitle,
    published: row.sermon.published,
  };
}

/** Published messages for one church, newest first. */
export async function listSermons(
  churchId: string,
  options: { includeDrafts?: boolean } = {},
): Promise<SermonSummary[]> {
  const filters = [eq(sermons.churchId, churchId)];
  if (!options.includeDrafts) filters.push(eq(sermons.published, true));

  const rows = await db
    .select(sermonWithSeries)
    .from(sermons)
    .leftJoin(series, eq(series.id, sermons.seriesId))
    .where(and(...filters))
    .orderBy(desc(sermons.preachedOn), desc(sermons.createdAt));

  return Promise.all(rows.map(toSummary));
}

export async function getSermon(
  churchId: string,
  slug: string,
  options: { includeDrafts?: boolean } = {},
): Promise<SermonDetail | null> {
  const filters = [eq(sermons.churchId, churchId), eq(sermons.slug, slug)];
  if (!options.includeDrafts) filters.push(eq(sermons.published, true));

  const rows = await db
    .select(sermonWithSeries)
    .from(sermons)
    .leftJoin(series, eq(series.id, sermons.seriesId))
    .where(and(...filters))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [summary, src, poster, captions] = await Promise.all([
    toSummary(row),
    playbackUrl(row.sermon.mediaSrc),
    playbackUrl(row.sermon.posterSrc),
    playbackUrl(row.sermon.captionsSrc),
  ]);

  // A GCS-backed file with storage unconfigured yields no URL; nothing to play.
  if (!src) return null;

  return {
    ...summary,
    description: row.sermon.description,
    media: { kind: row.sermon.mediaKind, src, poster, captions },
  };
}

/** The raw row, for the admin forms — no signing, no view mapping. */
export async function getSermonRow(churchId: string, slug: string): Promise<SermonRow | null> {
  const rows = await db
    .select()
    .from(sermons)
    .where(and(eq(sermons.churchId, churchId), eq(sermons.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSeries(churchId: string): Promise<SeriesSummary[]> {
  const rows = await db
    .select({
      row: series,
      sermonCount: sql<number>`count(${sermons.id})::int`,
    })
    .from(series)
    .leftJoin(sermons, and(eq(sermons.seriesId, series.id), eq(sermons.published, true)))
    .where(eq(series.churchId, churchId))
    .groupBy(series.id)
    .orderBy(asc(series.title));

  return Promise.all(
    rows.map(async ({ row, sermonCount }) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      artworkUrl: await playbackUrl(row.artworkSrc),
      sermonCount,
    })),
  );
}

export async function getSeriesRow(churchId: string, slug: string): Promise<SeriesRow | null> {
  const rows = await db
    .select()
    .from(series)
    .where(and(eq(series.churchId, churchId), eq(series.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSermonsInSeries(
  churchId: string,
  seriesId: string,
): Promise<SermonSummary[]> {
  const rows = await db
    .select(sermonWithSeries)
    .from(sermons)
    .leftJoin(series, eq(series.id, sermons.seriesId))
    .where(
      and(
        eq(sermons.churchId, churchId),
        eq(sermons.seriesId, seriesId),
        eq(sermons.published, true),
      ),
    )
    .orderBy(desc(sermons.preachedOn));

  return Promise.all(rows.map(toSummary));
}

/**
 * The message after this one in its series — the list runs newest first, so
 * "next" is the entry immediately before it.
 */
export async function getNextInSeries(
  churchId: string,
  sermon: SermonSummary,
): Promise<SermonSummary | null> {
  if (!sermon.seriesSlug) return null;

  const seriesRow = await getSeriesRow(churchId, sermon.seriesSlug);
  if (!seriesRow) return null;

  const inSeries = await listSermonsInSeries(churchId, seriesRow.id);
  const index = inSeries.findIndex((entry) => entry.slug === sermon.slug);
  return index > 0 ? inSeries[index - 1] : null;
}

export async function listSpeakers(churchId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ speaker: sermons.speaker })
    .from(sermons)
    .where(and(eq(sermons.churchId, churchId), eq(sermons.published, true)))
    .orderBy(asc(sermons.speaker));
  return rows.map((row) => row.speaker);
}
