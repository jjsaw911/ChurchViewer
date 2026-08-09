"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { serviceItems, services } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { orderWithInsert, orderWithMove } from "@/lib/services/ordering";
import { parseTimeOfDay } from "@/lib/services/timeline";
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

const KINDS = [
  "song",
  "scripture",
  "prayer",
  "sermon",
  "offering",
  "announcements",
  "communion",
  "other",
] as const;
type Kind = (typeof KINDS)[number];

const safeKind = (kind: string): Kind =>
  (KINDS as readonly string[]).includes(kind) ? (kind as Kind) : "other";

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

  await db.insert(services).values({
    churchId: church.id,
    slug,
    title,
    heldOn,
    startsAt: value(formData, "startsAt") || "10:00",
  });

  revalidatePath(`/s/${tenant}`, "layout");
  redirect(`/admin/services/${slug}`);
}

/**
 * Add an item, optionally in the middle.
 *
 * `afterItemId` is what makes the "+" on the arrow between two boxes work —
 * without it every new item lands at the end and has to be walked up the list
 * one move at a time.
 */
export async function addServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const serviceId = value(formData, "serviceId");
  const service = await ownedService(church.id, serviceId);
  if (!service) redirect("/admin/services");

  const kind = safeKind(value(formData, "kind"));
  const songId = value(formData, "songId") || null;
  const durationMinutes = Number(value(formData, "durationMinutes")) || 5;

  const shared = {
    serviceId: service.id,
    kind,
    title: value(formData, "title") || defaultTitle(kind),
    durationSeconds: Math.max(0, Math.round(durationMinutes * 60)),
    owner: value(formData, "owner"),
    songId: kind === "song" ? songId : null,
    mediaUrl: value(formData, "mediaUrl") || null,
  };

  const afterItemId = value(formData, "afterItemId");

  if (!afterItemId) {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${serviceItems.position}), 0) + 1` })
      .from(serviceItems)
      .where(eq(serviceItems.serviceId, service.id));
    await db.insert(serviceItems).values({ ...shared, position: next });
    revalidatePath(`/s/${tenant}`, "layout");
    return;
  }

  await db.transaction(async (tx) => {
    const ordered = await tx
      .select({ id: serviceItems.id })
      .from(serviceItems)
      .where(eq(serviceItems.serviceId, service.id))
      .orderBy(asc(serviceItems.position));

    const [inserted] = await tx
      .insert(serviceItems)
      .values({ ...shared, position: 0 })
      .returning({ id: serviceItems.id });

    // Positions are rewritten densely afterwards, so the placeholder 0 above
    // and any repeated inserts can't leave ties behind.
    const ids = orderWithInsert(
      ordered.map((row) => row.id),
      afterItemId,
      inserted.id,
    );

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
      // A song link only means anything on a song item; changing the kind away
      // from "song" clears it rather than leaving a dangling reference.
      songId: kind === "song" ? songId : null,
      mediaUrl: value(formData, "mediaUrl") || null,
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
 * Move an item one place up or down. Positions are rewritten as a dense list
 * afterwards, so repeated moves can't drift into ties.
 */
export async function moveServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const service = await ownedService(church.id, value(formData, "serviceId"));
  if (!service) redirect("/admin/services");

  const itemId = value(formData, "itemId");
  const direction = value(formData, "direction") === "up" ? "up" : "down";

  const ordered = await db
    .select({ id: serviceItems.id })
    .from(serviceItems)
    .where(eq(serviceItems.serviceId, service.id))
    .orderBy(asc(serviceItems.position));

  const before = ordered.map((row) => row.id);
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

export async function deleteServiceAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  await db
    .delete(services)
    .where(and(eq(services.churchId, church.id), eq(services.slug, value(formData, "slug"))));

  revalidatePath(`/s/${tenant}`, "layout");
  redirect("/admin/services");
}
