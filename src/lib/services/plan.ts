import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { serviceItems, services, songs } from "@/db/schema";
import { resolveAttachment } from "@/lib/media/attachment";
import { playbackUrl } from "@/lib/storage";
import type { SlideSource } from "@/lib/services/slides";

/**
 * Loading a service plan, in one place.
 *
 * The planner, the run sheet and the output screen all need the same thing: the
 * service, everything in it in order, and the slides each item will actually
 * show. Three copies of that query would drift, and the one that drifted would
 * be the one on the screen behind the band.
 */

export async function getService(churchId: string, slug: string) {
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.churchId, churchId), eq(services.slug, slug)))
    .limit(1);
  return service ?? null;
}

/**
 * Everything in the service — activities and what's inside them, mixed, each
 * group in its own order. `layoutPlan` is what turns it back into a tree.
 */
export async function loadPlanItems(serviceId: string) {
  return db
    .select({
      id: serviceItems.id,
      parentId: serviceItems.parentId,
      title: serviceItems.title,
      kind: serviceItems.kind,
      durationSeconds: serviceItems.durationSeconds,
      startsAt: serviceItems.startsAt,
      owner: serviceItems.owner,
      notes: serviceItems.notes,
      songId: serviceItems.songId,
      songSlug: songs.slug,
      songSlides: songs.slides,
      // The recording behind a song item, so the run sheet can play it and let
      // the slides follow it rather than being clicked through by hand.
      songSourceUrl: songs.sourceUrl,
      songAudioSrc: songs.audioSrc,
      songTimingOffsetMs: songs.timingOffsetMs,
      slides: serviceItems.slides,
      mediaUrl: serviceItems.mediaUrl,
    })
    .from(serviceItems)
    .leftJoin(songs, eq(songs.id, serviceItems.songId))
    .where(eq(serviceItems.serviceId, serviceId))
    .orderBy(asc(serviceItems.position));
}

/** Shaped for the planner and the presenter: never a null slide list. */
export function toPlanItems(rows: Awaited<ReturnType<typeof loadPlanItems>>) {
  return rows.map((row) => ({ ...row, songSlides: row.songSlides ?? [] }));
}

export type PlanItemRow = ReturnType<typeof toPlanItems>[number];

/**
 * The same rows with their attached file resolved, for the planner — which
 * draws each one rather than printing its URL. A row without an attachment
 * costs nothing here; `resolveAttachment` only signs what exists.
 */
export async function withAttachments(rows: PlanItemRow[]) {
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      attachment: await resolveAttachment(row.mediaUrl),
      songAudioUrl: row.songId ? await playbackUrl(row.songAudioSrc) : null,
    })),
  );
}

/**
 * Slides this church already has that could be copied onto an activity — the
 * songs with slides, and the activities of other services that carry their own.
 *
 * Capped, because the list is a dropdown and "the announcements from three
 * years ago" is not what anyone is looking for.
 */
export async function slideSources(
  churchId: string,
  exceptServiceId: string,
  limit = 40,
): Promise<SlideSource[]> {
  const songRows = await db
    .select({ id: songs.id, title: songs.title, count: sql<number>`jsonb_array_length(${songs.slides})` })
    .from(songs)
    .where(and(eq(songs.churchId, churchId), sql`jsonb_array_length(${songs.slides}) > 0`))
    .orderBy(asc(songs.title))
    .limit(limit);

  const itemRows = await db
    .select({
      id: serviceItems.id,
      title: serviceItems.title,
      heldOn: services.heldOn,
      serviceTitle: services.title,
      count: sql<number>`jsonb_array_length(${serviceItems.slides})`,
    })
    .from(serviceItems)
    .innerJoin(services, eq(services.id, serviceItems.serviceId))
    .where(
      and(
        eq(services.churchId, churchId),
        ne(services.id, exceptServiceId),
        sql`jsonb_array_length(${serviceItems.slides}) > 0`,
      ),
    )
    .orderBy(desc(services.heldOn))
    .limit(limit);

  return [
    ...songRows.map((row) => ({
      value: `song:${row.id}`,
      label: `${row.title} (${row.count})`,
      group: "Songs" as const,
    })),
    ...itemRows.map((row) => ({
      value: `item:${row.id}`,
      label: `${row.title} — ${row.serviceTitle}, ${row.heldOn} (${row.count})`,
      group: "Other services" as const,
    })),
  ];
}
