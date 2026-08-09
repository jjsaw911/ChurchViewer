"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { serviceItems, services } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
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

export async function addServiceItemAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const serviceId = value(formData, "serviceId");
  const service = await ownedService(church.id, serviceId);
  if (!service) redirect("/admin/services");

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${serviceItems.position}), 0) + 1` })
    .from(serviceItems)
    .where(eq(serviceItems.serviceId, service.id));

  const kind = value(formData, "kind");
  const kinds = [
    "song",
    "scripture",
    "prayer",
    "sermon",
    "offering",
    "announcements",
    "communion",
    "other",
  ] as const;
  type Kind = (typeof kinds)[number];
  const safeKind: Kind = (kinds as readonly string[]).includes(kind) ? (kind as Kind) : "other";

  const songId = value(formData, "songId") || null;
  const durationMinutes = Number(value(formData, "durationMinutes")) || 5;

  await db.insert(serviceItems).values({
    serviceId: service.id,
    position: next,
    kind: safeKind,
    title: value(formData, "title") || defaultTitle(safeKind),
    durationSeconds: Math.max(0, Math.round(durationMinutes * 60)),
    owner: value(formData, "owner"),
    songId: safeKind === "song" ? songId : null,
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

  await db
    .update(serviceItems)
    .set({
      title: value(formData, "title"),
      owner: value(formData, "owner"),
      notes: value(formData, "notes"),
      durationSeconds: Math.max(0, Math.round((durationMinutes || 0) * 60)),
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
  const direction = value(formData, "direction") === "up" ? -1 : 1;

  const ordered = await db
    .select({ id: serviceItems.id })
    .from(serviceItems)
    .where(eq(serviceItems.serviceId, service.id))
    .orderBy(asc(serviceItems.position));

  const index = ordered.findIndex((row) => row.id === itemId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= ordered.length) return;

  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  await db.transaction(async (tx) => {
    for (const [position, row] of ordered.entries()) {
      await tx
        .update(serviceItems)
        .set({ position: position + 1 })
        .where(eq(serviceItems.id, row.id));
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
