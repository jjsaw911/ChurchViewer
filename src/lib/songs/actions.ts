"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { songs } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { parseClock } from "@/lib/format";
import { displayFilename, kindFor, titleFromFilename } from "@/lib/media/service";
import { enqueueSongWork } from "@/lib/songs/queue";
import { createSong, discardSourceVideo } from "@/lib/songs/service";
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

  /**
   * A link to a video file, not a link to a page with a video on it.
   *
   * Pasting a YouTube address here is the commonest thing anybody tries, and
   * what comes back down the wire is a web page — so the worker would download
   * half a megabyte of HTML, hand it to ffmpeg, and fail an hour later in a log
   * nobody is reading. Said here instead, with where the file actually comes
   * from.
   */
  const videoSrc = optional(formData, "videoSrc");
  if (videoSrc && /(^|\.)(youtube\.com|youtu\.be|vimeo\.com)/i.test(hostOf(videoSrc))) {
    return {
      error:
        "That's a link to a page, not to a video file. If it's your church's own upload, " +
        "download the original from YouTube Studio and put that here — the YouTube link " +
        "itself goes in the field above.",
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
    videoSrc,
    backgroundSrc: optional(formData, "backgroundSrc"),
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

/**
 * Put the song in the worker's queue.
 *
 * Separate from the editor's "Transcribe" button because a video needs work
 * doing to it before anything can be transcribed, and that work is worth doing
 * on a server with no OpenAI key at all — the church still ends up with an
 * audio file that plays.
 */
export async function queueSongWorkAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const slug = value(formData, "slug");
  const [song] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.churchId, church.id), eq(songs.slug, slug)))
    .limit(1);
  if (!song) redirect("/admin/songs");

  await enqueueSongWork({ churchId: church.id, songId: song.id, tidy: true });

  revalidatePath(`/s/${tenant}`, "layout");
}

/**
 * Turn a file that's just been uploaded into a song, and start work on it.
 *
 * The shortest path from "I have the recording" to "there are slides": no form,
 * no fields, just the file. A video goes in as a video and the worker takes the
 * audio off it; audio is used as it is. The title comes from the filename and
 * can be fixed afterwards — a wrong title is visible and editable, where a
 * blocking form in the way of the upload is just friction.
 */
export async function createSongFromFileAction(input: {
  tenant: string;
  location: string;
  filename: string;
  contentType: string;
}): Promise<
  | { ok: true; slug: string; title: string; alreadyThere?: boolean }
  | { ok: false; error: string }
> {
  const { church } = await requireChurchAccess(input.tenant);

  const kind = kindFor(input.contentType, input.filename);
  if (kind !== "audio" && kind !== "video") {
    return { ok: false, error: `${input.filename} isn't audio or video.` };
  }

  // The file may already be a song — dropped in again from the same folder it
  // came from last week. Hand back the one that exists rather than making a
  // second copy of the same words and paying to transcribe them twice.
  const [existing] = await db
    .select({ slug: songs.slug, title: songs.title })
    .from(songs)
    .where(
      and(
        eq(songs.churchId, church.id),
        or(eq(songs.audioSrc, input.location), eq(songs.videoSrc, input.location))!,
      ),
    )
    .limit(1);

  if (existing) {
    return { ok: true, slug: existing.slug, title: existing.title, alreadyThere: true };
  }

  const title = titleFromFilename(displayFilename(input.filename));
  const song = await createSong({
    churchId: church.id,
    title,
    audioSrc: kind === "audio" ? input.location : null,
    videoSrc: kind === "video" ? input.location : null,
  });

  await enqueueSongWork({ churchId: church.id, songId: song.id, tidy: true });

  revalidatePath(`/s/${input.tenant}`, "layout");
  return { ok: true, slug: song.slug, title: song.title };
}

/**
 * Throw away the video, keep the audio and the slides.
 *
 * A service video is a hundred times the size of the audio pulled out of it and
 * is usually never watched again through this app. Once there are slides, the
 * big file has done its job.
 *
 * Deliberately a decision somebody makes rather than something the worker does
 * on its own: the video is the only copy that can be extracted again — at other
 * settings, or after a better take — and a background job that quietly deletes
 * originals is not one anybody can undo.
 */
export async function deleteSongVideoAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  const slug = value(formData, "slug");
  const [song] = await db
    .select({ id: songs.id })
    .from(songs)
    .where(and(eq(songs.churchId, church.id), eq(songs.slug, slug)))
    .limit(1);

  if (song) {
    // Asked for by hand, so slides aren't required — somebody looking at a song
    // that will never be transcribed can still want the space back. Audio still
    // is: without it there'd be nothing left at all.
    await discardSourceVideo(church.id, song.id, { requireSlides: false });
  }

  revalidatePath(`/s/${tenant}`, "layout");
  redirect(`/admin/songs/${slug}`);
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

/** The host of something that may not be a URL at all. */
function hostOf(location: string): string {
  try {
    return new URL(location).hostname;
  } catch {
    return "";
  }
}
