"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { songs } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { parseClock } from "@/lib/format";
import { retimeSlides } from "@/lib/songs/slides";
import { deleteObject, isGcsLocation } from "@/lib/storage";
import { slugify } from "@/lib/tenant";
import { youtubeVideoId } from "@/lib/youtube";
import type { SlidePayload } from "@/lib/songs/types";

export type SongState = { error?: string; values?: Record<string, string> };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const optional = (data: FormData, key: string) => value(data, key) || null;

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

export async function saveSongAction(_previous: SongState, formData: FormData): Promise<SongState> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const title = value(formData, "title");
  if (!title) return { error: "Give the song a title.", values: submitted(formData) };

  const slug = slugify(value(formData, "slug") || title);
  if (!slug) return { error: "Set a web address for the song.", values: submitted(formData) };

  const sourceUrl = optional(formData, "sourceUrl");
  if (sourceUrl && !youtubeVideoId(sourceUrl)) {
    return {
      error: "That doesn't look like a YouTube link. Paste the watch, share, or embed URL.",
      values: submitted(formData),
    };
  }

  const values = {
    churchId: church.id,
    slug,
    title,
    author: value(formData, "author"),
    ccliNumber: value(formData, "ccliNumber"),
    sourceUrl,
    audioSrc: optional(formData, "audioSrc"),
    durationSeconds: parseClock(value(formData, "duration")),
  };

  const originalSlug = optional(formData, "originalSlug");

  try {
    if (originalSlug) {
      await db
        .update(songs)
        .set(values)
        .where(and(eq(songs.churchId, church.id), eq(songs.slug, originalSlug)));
    } else {
      await db.insert(songs).values(values);
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        error: `Another song already uses the address "${slug}".`,
        values: submitted(formData),
      };
    }
    throw error;
  }

  revalidatePath(`/s/${tenant}`, "layout");
  redirect(`/admin/songs/${slug}`);
}

/** Persist edited slide text, timings, and the global nudge. */
export async function saveSlidesAction(input: {
  tenant: string;
  slug: string;
  slides: SlidePayload[];
  timingOffsetMs: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { church } = await requireChurchAccess(input.tenant);

  const rows = await db
    .select({ id: songs.id, durationSeconds: songs.durationSeconds })
    .from(songs)
    .where(and(eq(songs.churchId, church.id), eq(songs.slug, input.slug)))
    .limit(1);

  const song = rows[0];
  if (!song) return { ok: false, error: "That song no longer exists." };

  const cleaned = input.slides
    .map((slide) => ({
      ...slide,
      lines: slide.lines.map((line) => line.trim()).filter(Boolean),
      atMs: Math.max(0, Math.round(slide.atMs)),
    }))
    .filter((slide) => slide.lines.length > 0);

  await db
    .update(songs)
    .set({
      slides: retimeSlides(cleaned, song.durationSeconds * 1000),
      timingOffsetMs: Math.round(input.timingOffsetMs),
      status: cleaned.length > 0 ? "ready" : "draft",
    })
    .where(eq(songs.id, song.id));

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true };
}

export async function deleteSongAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const [removed] = await db
    .delete(songs)
    .where(and(eq(songs.churchId, church.id), eq(songs.slug, value(formData, "slug"))))
    .returning({ audioSrc: songs.audioSrc });

  if (removed?.audioSrc && isGcsLocation(removed.audioSrc)) {
    await deleteObject(removed.audioSrc);
  }

  revalidatePath(`/s/${tenant}`, "layout");
  redirect("/admin/songs");
}
