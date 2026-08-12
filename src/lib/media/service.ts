import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mediaAssets,
  series,
  sermons,
  serviceItems,
  services,
  songs,
} from "@/db/schema";
import { isGcsLocation } from "@/lib/storage";

export type MediaKind = "audio" | "video" | "image" | "captions" | "other";

/**
 * What sort of thing this is, from whatever the browser told us and, failing
 * that, the name. Content types are missing often enough — a drag from a file
 * server, an external link someone pasted — that the extension has to be a
 * fallback rather than a nicety.
 */
export function kindFor(contentType: string, filename: string): MediaKind {
  const type = contentType.toLowerCase();
  if (type === "text/vtt" || type === "text/srt") return "captions";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";

  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (["mp3", "m4a", "wav", "aac", "ogg", "flac"].includes(extension)) return "audio";
  if (["mp4", "mov", "m4v", "webm", "avi", "mkv"].includes(extension)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(extension)) return "image";
  if (["vtt", "srt"].includes(extension)) return "captions";
  return "other";
}

/** The last path segment, with the uuid we prefix object keys with taken off. */
export function displayFilename(locationOrName: string): string {
  const last = locationOrName.split("/").pop() ?? locationOrName;
  return last.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    "",
  );
}

/** "worship-night-final.mp3" -> "Worship night final". */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const spaced = withoutExtension.replace(/[-_]+/g, " ").trim();
  if (!spaced) return "Untitled";
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Put a file in the library.
 *
 * Called once the bytes are safely in the bucket. Registering the same location
 * twice is a no-op that returns what's already there — two forms uploading the
 * same file, or a re-run of a backfill, shouldn't double it up.
 */
export async function registerMedia(input: {
  churchId: string;
  location: string;
  filename: string;
  contentType?: string;
  bytes?: number | null;
  title?: string;
  uploadedBy?: string | null;
}) {
  const filename = displayFilename(input.filename);

  const [created] = await db
    .insert(mediaAssets)
    .values({
      churchId: input.churchId,
      location: input.location,
      filename,
      title: input.title?.trim() || titleFromFilename(filename),
      contentType: input.contentType ?? "",
      kind: kindFor(input.contentType ?? "", filename),
      bytes: input.bytes ?? null,
      uploadedBy: input.uploadedBy ?? null,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const [existing] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.churchId, input.churchId), eq(mediaAssets.location, input.location)),
    )
    .limit(1);

  return existing ?? null;
}

export type MediaQuery = {
  churchId: string;
  /** Matched against the title and the original filename. */
  search?: string;
  kinds?: MediaKind[];
  limit?: number;
  offset?: number;
};

/**
 * A page of the library, newest first.
 *
 * Paged rather than "everything, filtered in the browser": a church that has
 * been recording for ten years has thousands of files, and the picker has to
 * open in the same amount of time on year ten as on day one.
 */
export async function listMedia(query: MediaQuery) {
  const limit = Math.min(60, Math.max(1, query.limit ?? 24));
  const search = query.search?.trim();

  const filters = [eq(mediaAssets.churchId, query.churchId)];
  if (search) {
    const pattern = `%${search}%`;
    filters.push(
      or(
        ilike(mediaAssets.title, pattern),
        ilike(mediaAssets.filename, pattern),
        ilike(mediaAssets.notes, pattern),
      )!,
    );
  }
  if (query.kinds?.length) {
    filters.push(
      or(...query.kinds.map((kind) => eq(mediaAssets.kind, kind)))!,
    );
  }

  // One extra row is the cheapest way to know whether to offer "load more".
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(and(...filters))
    .orderBy(desc(mediaAssets.createdAt))
    .limit(limit + 1)
    .offset(Math.max(0, query.offset ?? 0));

  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

/** A song that was made from one of these files, and how far along it is. */
export type MediaSong = {
  slug: string;
  title: string;
  status: string;
  slideCount: number;
  /** The opening line of each slide — enough to recognise, not to perform. */
  openingLines: string[];
};

/**
 * The songs behind a page of files.
 *
 * A recording in the library and the slides made from it are the same thing to
 * the person looking for them: "the mp3" and "the words to the mp3". They're
 * two tables here for good reasons, and neither of those reasons is the user's
 * problem — so the library shows them together.
 *
 * Looked up in one query after the page of files rather than joined into it: a
 * join would multiply rows if two songs ever shared a file, and the page size
 * is what decides whether there's a next page.
 */
export async function songsForLocations(
  churchId: string,
  locations: string[],
): Promise<Map<string, MediaSong>> {
  if (locations.length === 0) return new Map();

  const rows = await db
    .select({
      slug: songs.slug,
      title: songs.title,
      status: songs.status,
      slides: songs.slides,
      audioSrc: songs.audioSrc,
      videoSrc: songs.videoSrc,
    })
    .from(songs)
    .where(
      and(
        eq(songs.churchId, churchId),
        or(
          inArray(songs.audioSrc, locations),
          inArray(songs.videoSrc, locations),
        )!,
      ),
    );

  const found = new Map<string, MediaSong>();
  for (const row of rows) {
    const song: MediaSong = {
      slug: row.slug,
      title: row.title,
      status: row.status,
      slideCount: row.slides.length,
      openingLines: row.slides.slice(0, 8).map((slide) => slide.lines[0] ?? ""),
    };

    // A song can point at both its video and the audio pulled out of it, and
    // both files should say so.
    for (const location of [row.audioSrc, row.videoSrc]) {
      if (location && locations.includes(location)) found.set(location, song);
    }
  }

  return found;
}

/**
 * A file this church already has, by the two things a browser knows for free:
 * what it's called and how big it is.
 *
 * Every upload gets its own unguessable key, so nothing in storage stops the
 * same file arriving twice — and it will, because the recordings all live in one
 * folder and nobody remembers which of them went up last week. Name and exact
 * byte count is enough: two different videos agreeing on both, to the byte, is
 * not a case worth designing for, and the cost of being wrong is that somebody
 * reuses a file they meant to replace.
 */
export async function findMatchingMedia(
  churchId: string,
  filename: string,
  bytes: number,
): Promise<typeof mediaAssets.$inferSelect | null> {
  if (!bytes) return null;

  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.churchId, churchId),
        eq(mediaAssets.filename, displayFilename(filename)),
        eq(mediaAssets.bytes, bytes),
      ),
    )
    .orderBy(desc(mediaAssets.createdAt))
    .limit(1);

  return row ?? null;
}

export async function getMedia(churchId: string, id: string) {
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.churchId, churchId), eq(mediaAssets.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Where a file is being used, so nobody deletes the thing that was going on the
 * screen on Sunday. Counted rather than listed — the number is what changes the
 * decision, and six joined lists would be a lot of query for a confirm dialog.
 */
export async function mediaUsage(churchId: string, location: string): Promise<number> {
  // No FROM: this is one scalar, and hanging it off a table would make the
  // answer depend on that table having rows.
  const result = await db.execute(sql`
    select (
        (select count(*) from ${songs}
          where ${songs.churchId} = ${churchId}
            and ${location} in (${songs.audioSrc}, ${songs.videoSrc}, ${songs.backgroundSrc}))
      + (select count(*) from ${sermons}
          where ${sermons.churchId} = ${churchId}
            and ${location} in (${sermons.mediaSrc}, ${sermons.posterSrc}, ${sermons.captionsSrc}))
      + (select count(*) from ${series}
          where ${series.churchId} = ${churchId} and ${series.artworkSrc} = ${location})
      + (select count(*) from ${serviceItems}
          join ${services} on ${services.id} = ${serviceItems.serviceId}
          where ${services.churchId} = ${churchId}
            and ${location} in (${serviceItems.mediaUrl}, ${serviceItems.backgroundSrc}))
      + (select count(*) from ${services}
          where ${services.churchId} = ${churchId} and ${services.backgroundSrc} = ${location})
    )::int as total
  `);

  const row = (result.rows as { total?: number }[])[0];
  return Number(row?.total ?? 0);
}

/** Whether this is ours to delete from the bucket, or somebody else's link. */
export const isHeldFile = (location: string) => isGcsLocation(location);

/**
 * What the church is storing, and how much of it is video.
 *
 * Shown rather than left to a billing page: a service video is a hundred times
 * the size of the audio pulled out of it, and nobody discovers that on their own
 * until the bill does it for them.
 */
export async function libraryTotals(churchId: string): Promise<{
  files: number;
  bytes: number;
  videoBytes: number;
}> {
  const [row] = await db
    .select({
      files: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${mediaAssets.bytes}), 0)::bigint`,
      videoBytes: sql<number>`coalesce(sum(${mediaAssets.bytes}) filter (where ${mediaAssets.kind} = 'video'), 0)::bigint`,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.churchId, churchId));

  return {
    files: Number(row?.files ?? 0),
    bytes: Number(row?.bytes ?? 0),
    videoBytes: Number(row?.videoBytes ?? 0),
  };
}
