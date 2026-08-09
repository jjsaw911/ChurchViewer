"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { sermons, series } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { parseClock } from "@/lib/format";
import { deleteObject, isGcsLocation } from "@/lib/storage";
import { slugify } from "@/lib/tenant";

/** `values` echoes the submitted fields so a validation error doesn't wipe the
 * form — React resets uncontrolled inputs once the action resolves. */
export type ActionState = { error?: string; values?: Record<string, string> };

/** Everything the form posted, as plain strings, for echoing back on error. */
function submitted(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, entry] of formData.entries()) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out;
}

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => value(data, key) || null;

/**
 * Postgres reports a unique-constraint clash as SQLSTATE 23505 — but Drizzle
 * wraps the driver error, so the code sits on `cause`, not on the error itself.
 * Walk the chain instead of only checking the top, or the clash escapes as an
 * unhandled crash rather than a message the user can act on.
 */
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

/** Refresh every tenant page — a sermon shows up in several of them. */
function revalidateTenant(tenant: string) {
  revalidatePath(`/s/${tenant}`, "layout");
}

export async function saveSermonAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const originalSlug = optional(formData, "originalSlug");
  const title = value(formData, "title");
  const mediaSrc = value(formData, "mediaSrc");

  if (!title) return { error: "Give the message a title.", values: submitted(formData) };
  if (!mediaSrc) return { error: "Add a recording — upload a file or paste a link.", values: submitted(formData) };

  const slug = slugify(value(formData, "slug") || title);
  if (!slug) return { error: "That title doesn't make a usable web address — set one by hand.", values: submitted(formData) };

  const preachedOn = value(formData, "preachedOn");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(preachedOn)) return { error: "Pick the date it was preached.", values: submitted(formData) };

  const seriesId = optional(formData, "seriesId");
  if (seriesId) {
    // Never trust a submitted id to belong to this church.
    const owned = await db
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.id, seriesId), eq(series.churchId, church.id)))
      .limit(1);
    if (!owned[0]) return { error: "That series doesn't belong to this church.", values: submitted(formData) };
  }

  const values = {
    churchId: church.id,
    slug,
    title,
    speaker: value(formData, "speaker") || "Unknown",
    seriesId,
    preachedOn,
    scripture: value(formData, "scripture"),
    description: value(formData, "description"),
    durationSeconds: parseClock(value(formData, "duration")),
    mediaKind: value(formData, "mediaKind") === "audio" ? ("audio" as const) : ("video" as const),
    mediaSrc,
    posterSrc: optional(formData, "posterSrc"),
    captionsSrc: optional(formData, "captionsSrc"),
    published: formData.get("published") !== null,
  };

  try {
    if (originalSlug) {
      const updated = await db
        .update(sermons)
        .set(values)
        .where(and(eq(sermons.churchId, church.id), eq(sermons.slug, originalSlug)))
        .returning({ id: sermons.id });
      if (!updated[0]) return { error: "That message no longer exists.", values: submitted(formData) };
    } else {
      await db.insert(sermons).values(values);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: `Another message already uses the address "${slug}".`, values: submitted(formData) };
    }
    throw error;
  }

  revalidateTenant(tenant);
  redirect("/admin");
}

export async function deleteSermonAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);
  const slug = value(formData, "slug");

  const [removed] = await db
    .delete(sermons)
    .where(and(eq(sermons.churchId, church.id), eq(sermons.slug, slug)))
    .returning({ mediaSrc: sermons.mediaSrc, posterSrc: sermons.posterSrc });

  // Only our own uploads are ours to clean up; linked files belong elsewhere.
  for (const location of [removed?.mediaSrc, removed?.posterSrc]) {
    if (location && isGcsLocation(location)) await deleteObject(location);
  }

  revalidateTenant(tenant);
  redirect("/admin");
}

export async function saveSeriesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const title = value(formData, "title");
  if (!title) return { error: "Give the series a title.", values: submitted(formData) };

  const slug = slugify(value(formData, "slug") || title);
  if (!slug) return { error: "Set a web address for the series.", values: submitted(formData) };

  const originalSlug = optional(formData, "originalSlug");
  const values = {
    churchId: church.id,
    slug,
    title,
    description: value(formData, "description"),
    artworkSrc: optional(formData, "artworkSrc"),
  };

  try {
    if (originalSlug) {
      await db
        .update(series)
        .set(values)
        .where(and(eq(series.churchId, church.id), eq(series.slug, originalSlug)));
    } else {
      await db.insert(series).values(values);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: `Another series already uses the address "${slug}".`, values: submitted(formData) };
    }
    throw error;
  }

  revalidateTenant(tenant);
  return {};
}

export async function deleteSeriesAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  // Messages in the series survive; their `series_id` just goes null.
  await db
    .delete(series)
    .where(and(eq(series.churchId, church.id), eq(series.slug, value(formData, "slug"))));

  revalidateTenant(tenant);
  redirect("/admin/series");
}
