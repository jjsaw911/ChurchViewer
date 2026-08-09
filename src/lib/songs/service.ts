import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { songs } from "@/db/schema";
import { transcribeAudio, tidySlides } from "@/lib/ai/openai";
import { buildSlides, DEFAULT_SLIDE_OPTIONS } from "@/lib/songs/slides";
import { rootUrl } from "@/lib/env";
import { playbackUrl } from "@/lib/storage";
import type { SlidePayload } from "@/lib/songs/types";

/** OpenAI rejects anything larger; catching it here gives a usable message. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function getSong(churchId: string, slug: string) {
  const rows = await db
    .select()
    .from(songs)
    .where(and(eq(songs.churchId, churchId), eq(songs.slug, slug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listSongs(churchId: string) {
  return db.select().from(songs).where(eq(songs.churchId, churchId)).orderBy(songs.title);
}

/**
 * Transcribe a song's audio and turn it into timed slides.
 *
 * Runs start to finish in one call — a five-minute song takes well under a
 * minute — but the row's status is updated as it goes so a refreshed page (or a
 * second person watching) sees where it got to.
 */
export async function transcribeSong(input: {
  churchId: string;
  songId: string;
  /** Optional AI clean-up of punctuation and section labels. */
  tidy?: boolean;
}): Promise<{ slides: SlidePayload[] }> {
  const rows = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, input.songId), eq(songs.churchId, input.churchId)))
    .limit(1);

  const song = rows[0];
  if (!song) throw new Error("That song no longer exists.");
  if (!song.audioSrc) {
    throw new Error(
      "This song has no audio to transcribe. Upload the recording you hold the rights to, or paste a direct audio link.",
    );
  }

  await db
    .update(songs)
    .set({ status: "transcribing", lastError: null })
    .where(eq(songs.id, song.id));

  try {
    const location = await playbackUrl(song.audioSrc);
    if (!location) throw new Error("Couldn't resolve the audio file's location.");

    // A church may point at a path on their own site ("/media/song.mp3"). That
    // works in the browser, but a server-side fetch needs it made absolute.
    let url: URL;
    try {
      url = new URL(location, rootUrl("/"));
    } catch {
      throw new Error(`Couldn't make sense of the audio location "${location}".`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Audio has to be an http(s) location.");
    }

    const audioResponse = await fetch(url);
    if (!audioResponse.ok) {
      throw new Error(`Couldn't download the audio (${audioResponse.status}).`);
    }

    const audio = await audioResponse.blob();
    if (audio.size > MAX_AUDIO_BYTES) {
      throw new Error(
        `That file is ${(audio.size / 1024 / 1024).toFixed(0)}MB; OpenAI accepts up to 25MB. Export a smaller audio-only version.`,
      );
    }

    const transcript = await transcribeAudio({
      audio,
      filename: `${song.slug}.audio`,
      // Names help the model; the lyrics are what we're asking it to hear.
      prompt: [song.title, song.author].filter(Boolean).join(" — ") || undefined,
    });

    let slides = buildSlides(transcript.words, DEFAULT_SLIDE_OPTIONS, song.durationSeconds);

    if (input.tidy && slides.length > 0) {
      try {
        const tidied = await tidySlides({ title: song.title, slides });
        slides = slides.map((slide, index) => ({
          ...slide,
          lines: tidied[index]?.lines ?? slide.lines,
          label: tidied[index]?.label,
        }));
      } catch {
        // The clean-up is a nicety — never lose a good transcript over it.
      }
    }

    await db
      .update(songs)
      .set({ transcript, slides, status: "ready", lastError: null })
      .where(eq(songs.id, song.id));

    return { slides };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transcription failed.";
    await db
      .update(songs)
      .set({ status: "failed", lastError: message })
      .where(eq(songs.id, song.id));
    throw error;
  }
}
