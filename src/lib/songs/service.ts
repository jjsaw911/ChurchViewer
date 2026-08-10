import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mediaAssets, songs } from "@/db/schema";
import { transcribeAudio, tidySlides } from "@/lib/ai/openai";
import { buildSlides, DEFAULT_SLIDE_OPTIONS } from "@/lib/songs/slides";
import { rootUrl } from "@/lib/env";
import { deleteObject, isGcsLocation, playbackUrl } from "@/lib/storage";
import { slugify } from "@/lib/tenant";
import type { SlidePayload } from "@/lib/songs/types";

/** OpenAI rejects anything larger; catching it here gives a usable message. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * What OpenAI will accept, and — this is the part that bites — how it decides.
 * It reads the extension of the filename it's given, not the bytes and not the
 * content type, so a perfectly good mp3 sent as `song.audio` comes back as
 * "Invalid file format".
 */
const TRANSCRIBABLE = new Set([
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "wav",
  "webm",
]);

const EXTENSION_FOR_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/**
 * The name to hand the file over as.
 *
 * The location's own extension is the best evidence; the content type the
 * bucket served it with is the next best. Everything the worker makes itself is
 * an mp3, which is what makes that a safe last resort rather than a guess.
 */
export function transcribeFilename(
  location: string,
  slug: string,
  contentType = "",
): string {
  const fromName = (location.split("?")[0].split(".").pop() ?? "").toLowerCase();
  if (TRANSCRIBABLE.has(fromName)) return `${slug}.${fromName}`;

  const fromType = EXTENSION_FOR_TYPE[contentType.split(";")[0].trim().toLowerCase()];
  return `${slug}.${fromType ?? "mp3"}`;
}

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
 * Add a song to the library from a title and, usually, a recording.
 *
 * Deliberately thinner than the song form: this is the path taken while
 * planning a service, where the answer to "which song?" is a name and an mp3.
 * Everything else — the writer, the CCLI number, the timing — can be filled in
 * later on the song's own page, and shouldn't stand between someone and a plan.
 */
export async function createSong(input: {
  churchId: string;
  title: string;
  audioSrc?: string | null;
  /** A video to take the audio out of, when that's what the church has. */
  videoSrc?: string | null;
  sourceUrl?: string | null;
}) {
  const base = slugify(input.title) || "song";

  // Two services can each add "Way Maker"; suffix until the address is free
  // rather than failing on the unique index in the middle of planning.
  let slug = base;
  for (let attempt = 2; attempt < 50; attempt++) {
    const [clash] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.churchId, input.churchId), eq(songs.slug, slug)))
      .limit(1);
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  const [created] = await db
    .insert(songs)
    .values({
      churchId: input.churchId,
      slug,
      title: input.title,
      audioSrc: input.audioSrc ?? null,
      videoSrc: input.videoSrc ?? null,
      sourceUrl: input.sourceUrl ?? null,
    })
    .returning();

  return created;
}

/**
 * Throw away the video a song was made from.
 *
 * By default only once the work it existed for is done: there's audio, and
 * there are slides. A video deleted before that leaves a song with nothing to
 * extract and nothing to show.
 *
 * This is not undoable — the original is gone from the bucket — which is why it
 * checks rather than trusts its caller. The trade is deliberate: a service
 * video is a hundred times the size of the audio taken from it and is never
 * watched again through this app, and a library that grows by a gigabyte a
 * Sunday is a bill nobody signed up for.
 */
export async function discardSourceVideo(
  churchId: string,
  songId: string,
  options: { requireSlides?: boolean } = {},
): Promise<boolean> {
  const requireSlides = options.requireSlides ?? true;

  const [song] = await db
    .select({
      id: songs.id,
      videoSrc: songs.videoSrc,
      audioSrc: songs.audioSrc,
      slides: songs.slides,
    })
    .from(songs)
    .where(and(eq(songs.id, songId), eq(songs.churchId, churchId)))
    .limit(1);

  if (!song?.videoSrc || !song.audioSrc) return false;
  if (requireSlides && song.slides.length === 0) return false;

  await db.update(songs).set({ videoSrc: null }).where(eq(songs.id, song.id));
  await db
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.churchId, churchId), eq(mediaAssets.location, song.videoSrc)));

  if (isGcsLocation(song.videoSrc)) await deleteObject(song.videoSrc);
  return true;
}

/**
 * Do the actual transcription for one song and return the slides.
 *
 * Status transitions belong to the queue (`lib/songs/queue.ts`), not here — this
 * function is the unit of work a worker runs, so it stays free of bookkeeping.
 */
export async function runTranscription(job: {
  id: string;
  slug: string;
  title: string;
  author: string;
  audioSrc: string | null;
  durationSeconds: number;
  tidyRequested: boolean;
}): Promise<SlidePayload[]> {
  if (!job.audioSrc) {
    throw new Error(
      "This song has no audio to transcribe. Upload the recording you hold the rights to, or paste a direct audio link.",
    );
  }

  const location = await playbackUrl(job.audioSrc);
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
    filename: transcribeFilename(job.audioSrc, job.slug, audio.type),
    // Names help the model; the words themselves are what we're asking it to hear.
    prompt: [job.title, job.author].filter(Boolean).join(" — ") || undefined,
  });

  let slides = buildSlides(transcript.words, DEFAULT_SLIDE_OPTIONS, job.durationSeconds);

  if (job.tidyRequested && slides.length > 0) {
    try {
      const tidied = await tidySlides({ title: job.title, slides });
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
    .set({ transcript, slides, status: "ready", claimedAt: null, lastError: null })
    .where(eq(songs.id, job.id));

  return slides;
}
