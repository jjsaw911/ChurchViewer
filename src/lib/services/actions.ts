"use server";

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { serviceItems, services, songs } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { kindFor } from "@/lib/media/service";
import {
  orderWithDrop,
  orderWithInsert,
  orderWithInsertBefore,
  orderWithMove,
} from "@/lib/services/ordering";
import { isImportable, slidesFromFile } from "@/lib/services/import";
import { normaliseSlides } from "@/lib/services/slides";
import { parseTimeOfDay } from "@/lib/services/timeline";
import { enqueueSongWork } from "@/lib/songs/queue";
import { createSong } from "@/lib/songs/service";
import type { SlidePayload } from "@/lib/songs/types";
import { slugify } from "@/lib/tenant";

export type ServiceState = { error?: string; values?: Record<string, string> };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function submitted(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of formData.entries()) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code?: unknown }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Confirm a service belongs to this church before touching anything under it. */
async function ownedService(churchId: string, serviceId: string) {
  const rows = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.churchId, churchId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function saveServiceAction(
  _previous: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const title = value(formData, "title");
  if (!title) return { error: "Give the service a name.", values: submitted(formData) };

  const heldOn = value(formData, "heldOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) {
    return { error: "Pick the date it's on.", values: submitted(formData) };
  }

  const startsAt = value(formData, "startsAt") || "10:00";
  if (parseTimeOfDay(startsAt) === null) {
    return { error: "Start time should look like 10:00.", values: submitted(formData) };
  }

  // Two services on one date is normal — put the date in the address.
  const slug = slugify(value(formData, "slug") || `${heldOn}-${title}`);
  const originalSlug = value(formData, "originalSlug");

  const values = {
    churchId: church.id,
    slug,
    title,
    heldOn,
    startsAt,
    backgroundSrc: value(formData, "backgroundSrc") || null,
    screenAspect: ASPECTS.includes(value(formData, "screenAspect"))
      ? value(formData, "screenAspect")
      : "16:9",
    notes: value(formData, "notes"),
  };

  try {
    if (originalSlug) {
      await db
        .update(services)
        .set(values)
        .where(and(eq(services.churchId, church.id), eq(services.slug, originalSlug)));
    } else {
      await db.insert(services).values(values);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: `Another service already uses the address "${slug}".`,
        values: submitted(formData),
      };
    }
    throw error;
  }

  revalidatePath(`/s/${tenant}`, "layout");
  redirect(`/admin/services/${slug}`);
}

/** The screen shapes worth offering; anything else is a typo. */
const ASPECTS = ["16:9", "16:10", "4:3", "21:9"];

const KINDS = [
  "song",
  "scripture",
  "prayer",
  "sermon",
  "offering",
  "announcements",
  "communion",
  "worship",
  "other",
] as const;
type Kind = (typeof KINDS)[number];

const safeKind = (kind: string): Kind =>
  (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : "other";

/** A pinned start, or null for "follows whatever ran before it". */
const pinnedStart = (input: string): string | null =>
  input && parseTimeOfDay(input) !== null ? input : null;

/**
 * The parent an item may hang off: a top-level activity of this service.
 *
 * Anything else — an id from another service, something already nested, a row
 * deleted in another tab — comes back null and the item is planned at the top
 * level. Losing the nesting is obvious on screen and fixable in a click; a
 * dangling parent would quietly hide the item instead.
 */
async function topLevelParent(serviceId: string, parentId: string): Promise<string | null> {
  if (!parentId) return null;

  const [parent] = await db
    .select({ id: serviceItems.id, parentId: serviceItems.parentId })
    .from(serviceItems)
    .where(and(eq(serviceItems.id, parentId), eq(serviceItems.serviceId, serviceId)))
    .limit(1);

  return parent && !parent.parentId ? parent.id : null;
}

/**
 * The ids of everything at one level of a service, in the order they run.
 *
 * Takes whatever can run a select, so the same read serves a plain query and
 * one inside the transaction that's about to renumber what it returns.
 */
async function siblingIds(
  runner: Pick<typeof db, "select">,
  serviceId: string,
  parentId: string | null,
): Promise<string[]> {
  const rows = await runner
    .select({ id: serviceItems.id })
    .from(serviceItems)
    .where(
      and(
        eq(serviceItems.serviceId, serviceId),
        parentId === null ? isNull(serviceItems.parentId) : eq(serviceItems.parentId, parentId),
      ),
    )
    .orderBy(asc(serviceItems.position));

  return rows.map((row) => row.id);
}

/**
 * Start a service from nothing but a date.
 *
 * Planning starts with "which Sunday", not with a title — so the date is the
 * only thing asked for, and everything else gets a sensible default that can be
 * edited in the planner. The slug is the date, which keeps run-sheet URLs
 * readable and naturally unique per church.
 */
export async function createServiceForDateAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const heldOn = value(formData, "heldOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn)) redirect("/admin/services");

  // Parsed as UTC deliberately — a date-only value has no timezone, and letting
  // the server's zone shift it turns Sunday into Saturday for half the world.
  const date = new Date(`${heldOn}T00:00:00Z`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const title = weekday === "Sunday" ? "Sunday Morning" : `${weekday} Service`;

  // A church can hold more than one service on a day, so the date alone isn't
  // enough; suffix until it's free rather than failing on the unique index.
  let slug = heldOn;
  for (let attempt = 2; attempt < 20; attempt++) {
    const [clash] = await db
      .select({ id: services.id })
      .from(services)
      .where(and(eq(services.churchId, church.id), eq(services.slug, slug)))
      .limit(1);
    if (!clash) break;
    slug = `${heldOn}-${attempt}`;
  }

  // The projector doesn't change between Sundays, so neither should this: a
  // new plan starts with whatever the last one was set to.
  const [previous] = await db
    .select({ screenAspect: services.screenAspect, backgroundSrc: services.backgroundSrc })
    .from(services)
    .where(eq(services.churchId, church.id))
    .orderBy(desc(services.heldOn))
    .limit(1);

  await db.insert(services).values({
    churchId: church.id,
    slug,
    title,
    heldOn,
    startsAt: value(formData, "startsAt") || "10:00",
    screenAspect: previous?.screenAspect ?? "16:9",
    backgroundSrc: previous?.backgroundSrc ?? null,
  });

  revalidatePath(`/s/${tenant}`, "layout");
  redirect(`/admin/services/${slug}`);
}

/**
 * Add an activity — at a time, in the middle, or inside another one.
 *
 * Three fields decide where it lands. `parentId` puts it inside an activity,
 * which is how a song joins the worship set. `afterItemId` / `beforeItemId`
 * place it among its siblings, so a click on the arrow between two boxes, or on
 * an empty 9:15 on the ruler, doesn't have to be walked up the list one move at
 * a time. `startsAt` pins it to the clock.
 *
 * A song can be added before it exists in the library: give `newSongTitle` and
 * a recording, and the song is created, linked, and queued for transcription.
 * Planning a set shouldn't mean leaving the plan to go and add each song first.
 */
export async function addServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const serviceId = value(formData, "serviceId");
  const service = await ownedService(church.id, serviceId);
  if (!service) redirect("/admin/services");

  const parentId = await topLevelParent(service.id, value(formData, "parentId"));
  const kind = safeKind(value(formData, "kind"));
  const durationMinutes = Number(value(formData, "durationMinutes")) || 5;

  let songId = kind === "song" ? value(formData, "songId") || null : null;
  let songTitle = "";

  // Picking "Cornerstone" off the list and leaving the name blank should give
  // an item called Cornerstone, not one called "Song".
  if (songId) {
    const [picked] = await db
      .select({ title: songs.title })
      .from(songs)
      .where(and(eq(songs.id, songId), eq(songs.churchId, church.id)))
      .limit(1);
    if (picked) songTitle = picked.title;
    else songId = null;
  }

  const newSongTitle = value(formData, "newSongTitle");
  if (kind === "song" && !songId && newSongTitle) {
    // What someone has after a Sunday is usually the video. It goes in as a
    // video and the worker takes the audio out of it; only an actual audio file
    // is used as-is.
    const recording = value(formData, "newSongAudioSrc") || null;
    const isVideo = recording ? kindFor("", recording) === "video" : false;

    const created = await createSong({
      churchId: church.id,
      title: newSongTitle,
      audioSrc: isVideo ? null : recording,
      videoSrc: isVideo ? recording : null,
      sourceUrl: value(formData, "newSongSourceUrl") || null,
    });
    songId = created.id;
    songTitle = created.title;

    // Slides are the point of adding the recording, so start on them now rather
    // than making someone come back and press a second button. Extraction is
    // worth queueing on its own; transcription needs a key to be any use.
    if (created.audioSrc ? await isOpenAiConfigured() : Boolean(created.videoSrc)) {
      await enqueueSongWork({ churchId: church.id, songId: created.id, tidy: true });
    }
  }

  const shared = {
    serviceId: service.id,
    parentId,
    kind,
    title: value(formData, "title") || songTitle || defaultTitle(kind),
    durationSeconds: Math.max(0, Math.round(durationMinutes * 60)),
    startsAt: pinnedStart(value(formData, "startsAt")),
    owner: value(formData, "owner"),
    songId,
    mediaUrl: value(formData, "mediaUrl") || null,
  };

  const afterItemId = value(formData, "afterItemId");
  const beforeItemId = value(formData, "beforeItemId");

  if (!afterItemId && !beforeItemId) {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${serviceItems.position}), 0) + 1` })
      .from(serviceItems)
      .where(
        and(
          eq(serviceItems.serviceId, service.id),
          parentId === null ? isNull(serviceItems.parentId) : eq(serviceItems.parentId, parentId),
        ),
      );
    await db.insert(serviceItems).values({ ...shared, position: next });
    revalidatePath(`/s/${tenant}`, "layout");
    return;
  }

  await db.transaction(async (tx) => {
    const ordered = await siblingIds(tx, service.id, parentId);

    const [inserted] = await tx
      .insert(serviceItems)
      .values({ ...shared, position: 0 })
      .returning({ id: serviceItems.id });

    // Positions are rewritten densely afterwards, so the placeholder 0 above
    // and any repeated inserts can't leave ties behind.
    const ids = beforeItemId
      ? orderWithInsertBefore(ordered, beforeItemId, inserted.id)
      : orderWithInsert(ordered, afterItemId, inserted.id);

    for (const [index, id] of ids.entries()) {
      await tx
        .update(serviceItems)
        .set({ position: index + 1 })
        .where(eq(serviceItems.id, id));
    }
  });

  revalidatePath(`/s/${tenant}`, "layout");
}

function defaultTitle(kind: string): string {
  const titles: Record<string, string> = {
    song: "Song",
    scripture: "Scripture reading",
    prayer: "Prayer",
    sermon: "Message",
    offering: "Offering",
    announcements: "Announcements",
    communion: "Communion",
    worship: "Worship",
    other: "Item",
  };
  return titles[kind] ?? "Item";
}

export async function updateServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const serviceId = value(formData, "serviceId");
  const service = await ownedService(church.id, serviceId);
  if (!service) redirect("/admin/services");

  const durationMinutes = Number(value(formData, "durationMinutes"));
  const kind = safeKind(value(formData, "kind"));
  const songId = value(formData, "songId") || null;

  await db
    .update(serviceItems)
    .set({
      kind,
      title: value(formData, "title"),
      owner: value(formData, "owner"),
      notes: value(formData, "notes"),
      durationSeconds: Math.max(0, Math.round((durationMinutes || 0) * 60)),
      // Clearing the field un-pins it: the item goes back to starting when the
      // one before it ends, which is what most of a running order should do.
      startsAt: pinnedStart(value(formData, "startsAt")),
      // A song link only means anything on a song item; changing the kind away
      // from "song" clears it rather than leaving a dangling reference.
      songId: kind === "song" ? songId : null,
      mediaUrl: value(formData, "mediaUrl") || null,
      backgroundSrc: value(formData, "backgroundSrc") || null,
    })
    .where(
      and(
        eq(serviceItems.id, value(formData, "itemId")),
        eq(serviceItems.serviceId, service.id),
      ),
    );

  revalidatePath(`/s/${tenant}`, "layout");
}

export async function deleteServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const service = await ownedService(church.id, value(formData, "serviceId"));
  if (!service) redirect("/admin/services");

  await db
    .delete(serviceItems)
    .where(
      and(
        eq(serviceItems.id, value(formData, "itemId")),
        eq(serviceItems.serviceId, service.id),
      ),
    );

  revalidatePath(`/s/${tenant}`, "layout");
}

/**
 * Move an item one place up or down among its own siblings — a song moves
 * within the worship set, not out of it. Positions are rewritten as a dense
 * list afterwards, so repeated moves can't drift into ties.
 */
export async function moveServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const service = await ownedService(church.id, value(formData, "serviceId"));
  if (!service) redirect("/admin/services");

  const itemId = value(formData, "itemId");
  const direction = value(formData, "direction") === "up" ? "up" : "down";

  const [moving] = await db
    .select({ parentId: serviceItems.parentId })
    .from(serviceItems)
    .where(and(eq(serviceItems.id, itemId), eq(serviceItems.serviceId, service.id)))
    .limit(1);
  if (!moving) return;

  const before = await siblingIds(db, service.id, moving.parentId);
  const after = orderWithMove(before, itemId, direction);
  // A move off either end, or of something already deleted, changes nothing —
  // don't spend a transaction rewriting every row to the values it already has.
  if (after.every((id, index) => id === before[index])) return;

  await db.transaction(async (tx) => {
    for (const [position, id] of after.entries()) {
      await tx
        .update(serviceItems)
        .set({ position: position + 1 })
        .where(eq(serviceItems.id, id));
    }
  });

  revalidatePath(`/s/${tenant}`, "layout");
}

/**
 * Drop an item somewhere else: before another one, or inside an activity.
 *
 * This is the drag-and-drop landing. It can change both the level an item sits
 * at and its place among its new siblings, which is why it isn't the existing
 * one-step move — dragging a song into the worship set is a change of parent,
 * and dragging it back out is the same move in reverse.
 *
 * A pinned start is dropped on the way. Dragging says "it goes here, after
 * that one", and a pin says "it starts at 9:15 whatever else happens" — keep
 * both and the plan shows an order its own times contradict.
 */
export async function moveItemToAction(input: {
  tenant: string;
  serviceId: string;
  itemId: string;
  /** The activity to put it inside, or null for the running order itself. */
  parentId: string | null;
  /** Land directly before this sibling; omit to go last. */
  beforeItemId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { church } = await requireChurchAccess(input.tenant);

  const service = await ownedService(church.id, input.serviceId);
  if (!service) return { ok: false, error: "That service no longer exists." };

  const [moving] = await db
    .select({ id: serviceItems.id })
    .from(serviceItems)
    .where(and(eq(serviceItems.id, input.itemId), eq(serviceItems.serviceId, service.id)))
    .limit(1);
  if (!moving) return { ok: false, error: "That activity is no longer in the plan." };

  const parentId = input.parentId
    ? await topLevelParent(service.id, input.parentId)
    : null;
  if (parentId === input.itemId) return { ok: false, error: "An activity can't hold itself." };

  if (parentId) {
    // One level deep: an activity that already holds songs can't be tucked
    // inside another one, because its songs would have nowhere to be drawn.
    const [{ children }] = await db
      .select({ children: sql<number>`count(*)::int` })
      .from(serviceItems)
      .where(eq(serviceItems.parentId, input.itemId));
    if (children > 0) {
      return { ok: false, error: "Take the songs out of it first — it can only nest one deep." };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(serviceItems)
      .set({ parentId, startsAt: null })
      .where(eq(serviceItems.id, input.itemId));

    const ordered = await siblingIds(tx, service.id, parentId);
    const placed = orderWithDrop(ordered, input.itemId, input.beforeItemId ?? null);

    for (const [index, id] of placed.entries()) {
      await tx
        .update(serviceItems)
        .set({ position: index + 1 })
        .where(eq(serviceItems.id, id));
    }
  });

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true };
}

/**
 * Set how long one activity runs.
 *
 * Its own action because it's what dragging the bottom of a box does, and that
 * happens a lot in a row — reusing the whole edit form would mean sending, and
 * re-saving, every other field on the item each time somebody nudged a minute.
 */
export async function setItemDurationAction(input: {
  tenant: string;
  serviceId: string;
  itemId: string;
  minutes: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { church } = await requireChurchAccess(input.tenant);

  const service = await ownedService(church.id, input.serviceId);
  if (!service) return { ok: false, error: "That service no longer exists." };

  // Four hours is past any single item in a service and well past a drag that
  // meant anything; a negative one isn't a length at all.
  const minutes = Math.min(240, Math.max(0, Math.round(input.minutes)));

  const [saved] = await db
    .update(serviceItems)
    .set({ durationSeconds: minutes * 60 })
    .where(and(eq(serviceItems.id, input.itemId), eq(serviceItems.serviceId, service.id)))
    .returning({ id: serviceItems.id });

  if (!saved) return { ok: false, error: "That activity is no longer in the plan." };

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true };
}

/**
 * Save the slides typed onto one activity.
 *
 * Called from the editor rather than through a form, because the operator is
 * moving lines between slides while looking at them — a page reload per change
 * would make that unusable.
 */
export async function saveItemSlidesAction(input: {
  tenant: string;
  serviceId: string;
  itemId: string;
  slides: SlidePayload[];
}): Promise<{ ok: true; slides: SlidePayload[] } | { ok: false; error: string }> {
  const { church } = await requireChurchAccess(input.tenant);

  const service = await ownedService(church.id, input.serviceId);
  if (!service) return { ok: false, error: "That service no longer exists." };

  const slides = normaliseSlides(input.slides);

  const [saved] = await db
    .update(serviceItems)
    .set({ slides })
    .where(and(eq(serviceItems.id, input.itemId), eq(serviceItems.serviceId, service.id)))
    .returning({ id: serviceItems.id });

  if (!saved) return { ok: false, error: "That activity is no longer in the plan." };

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true, slides };
}

/**
 * Slides out of a file the church already made.
 *
 * The announcements exist before anyone opens this app — built in PowerPoint on
 * a Tuesday, or typed in Word. Asking whoever runs the service to retype them
 * into boxes is asking for the work to be done twice, which is how a church
 * quietly goes back to using PowerPoint on the day.
 *
 * The words come across and nothing else: fonts, colours, boxes and clip art
 * are exactly the parts that look wrong on somebody else's projector, and the
 * background is a thing chosen once for the whole service.
 */
export async function importSlidesFromFileAction(
  tenant: string,
  serviceId: string,
  itemId: string,
  formData: FormData,
): Promise<{ ok: true; slides: SlidePayload[] } | { ok: false; error: string }> {
  const { church } = await requireChurchAccess(tenant);

  const service = await ownedService(church.id, serviceId);
  if (!service) return { ok: false, error: "That service no longer exists." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };

  if (!isImportable(file.name)) {
    return {
      ok: false,
      error: "That file type can't be read. PowerPoint, Word or a plain text file.",
    };
  }

  // A deck of announcements is a few hundred kilobytes. Anything far past that
  // is a video somebody renamed, and reading it into memory helps nobody.
  if (file.size > 20 * 1024 * 1024) {
    return { ok: false, error: "That file is too big to read — 20MB is the limit." };
  }

  let slides: SlidePayload[];
  try {
    slides = slidesFromFile(file.name, Buffer.from(await file.arrayBuffer()));
  } catch {
    return { ok: false, error: "That file couldn't be opened. Is it really a .pptx or .docx?" };
  }

  if (slides.length === 0) {
    return { ok: false, error: "No words were found in that file — only pictures, perhaps?" };
  }

  const [saved] = await db
    .update(serviceItems)
    .set({ slides })
    .where(and(eq(serviceItems.id, itemId), eq(serviceItems.serviceId, service.id)))
    .returning({ id: serviceItems.id });

  if (!saved) return { ok: false, error: "That activity is no longer in the plan." };

  revalidatePath(`/s/${tenant}`, "layout");
  return { ok: true, slides };
}

/**
 * Copy slides onto an activity from something the church already has: a song in
 * the library, or an activity in another service. Most announcements are last
 * week's announcements with two lines changed.
 *
 * The slides are copied, not referenced — editing them here must not rewrite
 * the source, and a service that has already happened should stay as it ran.
 */
export async function importItemSlidesAction(input: {
  tenant: string;
  serviceId: string;
  itemId: string;
  /** `song:<id>` or `item:<id>` — what to copy from. */
  source: string;
}): Promise<{ ok: true; slides: SlidePayload[] } | { ok: false; error: string }> {
  const { church } = await requireChurchAccess(input.tenant);

  const service = await ownedService(church.id, input.serviceId);
  if (!service) return { ok: false, error: "That service no longer exists." };

  const [kind, sourceId] = input.source.split(":");
  if (!sourceId) return { ok: false, error: "Pick something to import from." };

  let source: SlidePayload[] = [];

  if (kind === "song") {
    const [song] = await db
      .select({ slides: songs.slides })
      .from(songs)
      .where(and(eq(songs.id, sourceId), eq(songs.churchId, church.id)))
      .limit(1);
    source = song?.slides ?? [];
  } else if (kind === "item") {
    // Joined back to `services` so one church can't pull slides out of another.
    const [item] = await db
      .select({ slides: serviceItems.slides })
      .from(serviceItems)
      .innerJoin(services, eq(services.id, serviceItems.serviceId))
      .where(and(eq(serviceItems.id, sourceId), eq(services.churchId, church.id)))
      .limit(1);
    source = item?.slides ?? [];
  }

  if (source.length === 0) return { ok: false, error: "There were no slides to copy." };

  const slides = normaliseSlides(source);

  const [saved] = await db
    .update(serviceItems)
    .set({ slides })
    .where(and(eq(serviceItems.id, input.itemId), eq(serviceItems.serviceId, service.id)))
    .returning({ id: serviceItems.id });

  if (!saved) return { ok: false, error: "That activity is no longer in the plan." };

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true, slides };
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  await db
    .delete(services)
    .where(and(eq(services.churchId, church.id), eq(services.slug, value(formData, "slug"))));

  revalidatePath(`/s/${tenant}`, "layout");
  redirect("/admin/services");
}
