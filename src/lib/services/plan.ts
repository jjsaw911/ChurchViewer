import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { serviceItems, services, songs } from "@/db/schema";
import { resolveAttachment } from "@/lib/media/attachment";
import { resolveBackground } from "@/lib/media/background";
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
 * The service the church is on right now.
 *
 * The machine at the projector is switched on and should already be showing the
 * right thing. Nobody wants to type a date into it, and nobody will remember to
 * change it next week — so it asks for the church and this answers "this one".
 *
 * Today's, if there is one. Otherwise the next one coming, so a screen set up
 * on Saturday is already on Sunday's plan. Failing that the most recent, which
 * is what a church that only plans occasionally has.
 */
export async function currentService(churchId: string, today: string) {
  const pick = async (where: ReturnType<typeof and>, order: typeof asc) =>
    (
      await db
        .select()
        .from(services)
        .where(where)
        .orderBy(order(services.heldOn))
        .limit(1)
    )[0] ?? null;

  return (
    (await pick(and(eq(services.churchId, churchId), eq(services.heldOn, today)), asc)) ??
    (await pick(and(eq(services.churchId, churchId), sql`${services.heldOn} > ${today}`), asc)) ??
    (await pick(and(eq(services.churchId, churchId), sql`${services.heldOn} < ${today}`), desc))
  );
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
      songKey: songs.musicalKey,
      // The recording behind a song item, so the run sheet can play it and let
      // the slides follow it rather than being clicked through by hand.
      songSourceUrl: songs.sourceUrl,
      songAudioSrc: songs.audioSrc,
      songTimingOffsetMs: songs.timingOffsetMs,
      /** The song's own picture, behind its words wherever it is sung. */
      songBackgroundSrc: songs.backgroundSrc,
      slides: serviceItems.slides,
      mediaUrl: serviceItems.mediaUrl,
      backgroundSrc: serviceItems.backgroundSrc,
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
export async function withAttachments(
  rows: PlanItemRow[],
  serviceBackgroundSrc: string | null = null,
) {
  const serviceBackground = await resolveBackground(serviceBackgroundSrc);

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      attachment: await resolveAttachment(row.mediaUrl),
      songAudioUrl: row.songId ? await playbackUrl(row.songAudioSrc) : null,
      // This activity's own, then the song's, then the service's — the same
      // order the screen itself follows.
      background:
        (await resolveBackground(row.backgroundSrc)) ??
        (await resolveBackground(row.songBackgroundSrc)) ??
        serviceBackground,
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
