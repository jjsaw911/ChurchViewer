"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { mediaAssets } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import {
  findMatchingMedia,
  getMedia,
  isHeldFile,
  listMedia,
  mediaUsage,
  registerMedia,
  songsForLocations,
  type MediaKind,
  type MediaSong,
} from "@/lib/media/service";
import { deleteObject, playbackUrl } from "@/lib/storage";

/**
 * One library entry, ready to show: the record, plus a URL that will actually
 * play. Bucket objects stay private, so the URL is signed here and is good for
 * a few hours — long enough for a service, short enough not to be a handout.
 */
export type MediaItem = {
  id: string;
  location: string;
  title: string;
  filename: string;
  kind: MediaKind;
  contentType: string;
  bytes: number | null;
  notes: string;
  createdAt: string;
  /** Null when uploads aren't configured and the file is in a bucket. */
  url: string | null;
  /** The song made from this recording, and the slides that came with it. */
  song: MediaSong | null;
};

async function present(
  churchId: string,
  rows: Awaited<ReturnType<typeof listMedia>>["rows"],
): Promise<MediaItem[]> {
  const songs = await songsForLocations(
    churchId,
    rows.map((row) => row.location),
  );

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      location: row.location,
      title: row.title,
      filename: row.filename,
      kind: row.kind,
      contentType: row.contentType,
      bytes: row.bytes,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      url: await playbackUrl(row.location),
      song: songs.get(row.location) ?? null,
    })),
  );
}

/** What the picker and the library page both call as someone types. */
export async function searchMediaAction(input: {
  tenant: string;
  search?: string;
  kinds?: MediaKind[];
  offset?: number;
  limit?: number;
}): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const { church } = await requireChurchAccess(input.tenant);

  const { rows, hasMore } = await listMedia({
    churchId: church.id,
    search: input.search,
    kinds: input.kinds,
    offset: input.offset,
    limit: input.limit,
  });

  return { items: await present(church.id, rows), hasMore };
}

/**
 * Whether this church already holds this exact file.
 *
 * Asked before the bytes go anywhere, so a second copy of last week's video
 * costs one small request rather than a hundred and fifty megabytes.
 */
export async function findExistingMediaAction(input: {
  tenant: string;
  filename: string;
  bytes: number;
}): Promise<MediaItem | null> {
  const { church } = await requireChurchAccess(input.tenant);

  const match = await findMatchingMedia(church.id, input.filename, input.bytes);
  if (!match) return null;

  const [item] = await present(church.id, [match]);
  return item;
}

/**
 * Record a file that has just landed in the bucket.
 *
 * The browser uploads straight to storage through a signed URL, so this is the
 * only moment the app learns the file exists — without it the library would
 * only ever know about files somebody happened to attach to something.
 */
export async function registerMediaAction(input: {
  tenant: string;
  location: string;
  filename: string;
  contentType?: string;
  bytes?: number;
  title?: string;
}): Promise<{ ok: true; item: MediaItem } | { ok: false; error: string }> {
  const { church, user } = await requireChurchAccess(input.tenant);

  const saved = await registerMedia({
    churchId: church.id,
    location: input.location,
    filename: input.filename,
    contentType: input.contentType,
    bytes: input.bytes,
    title: input.title,
    uploadedBy: user.id,
  });

  if (!saved) return { ok: false, error: "Couldn't add that to the library." };

  revalidatePath(`/s/${input.tenant}`, "layout");
  const [item] = await present(church.id, [saved]);
  return { ok: true, item };
}

export async function renameMediaAction(input: {
  tenant: string;
  id: string;
  title: string;
  notes?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { church } = await requireChurchAccess(input.tenant);

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Give it a name." };

  await db
    .update(mediaAssets)
    .set({ title, ...(input.notes === undefined ? {} : { notes: input.notes.trim() }) })
    .where(and(eq(mediaAssets.id, input.id), eq(mediaAssets.churchId, church.id)));

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true };
}

/**
 * Remove a file from the library and from the bucket.
 *
 * Refused while anything still points at it. A location is just a string on the
 * row that uses it, so deleting a file in use doesn't break a page — it leaves
 * a sermon that plays nothing, found at the worst possible moment.
 */
export async function deleteMediaAction(input: {
  tenant: string;
  id: string;
  /** Set once the person has been told how many things use it. */
  evenIfUsed?: boolean;
}): Promise<{ ok: boolean; error?: string; usedBy?: number }> {
  const { church } = await requireChurchAccess(input.tenant);

  const asset = await getMedia(church.id, input.id);
  if (!asset) return { ok: true };

  const usedBy = await mediaUsage(church.id, asset.location);
  if (usedBy > 0 && !input.evenIfUsed) {
    return {
      ok: false,
      usedBy,
      error: `${usedBy} ${usedBy === 1 ? "thing uses" : "things use"} this file.`,
    };
  }

  await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
  if (isHeldFile(asset.location)) await deleteObject(asset.location);

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true };
}
