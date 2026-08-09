import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { churches, songs } from "@/db/schema";

/** Give up after this many tries rather than burning API credit on a bad file. */
export const MAX_ATTEMPTS = 3;

/**
 * How long a claimed job may sit before another worker may take it. Covers the
 * case where a worker is killed mid-transcription and never releases the row.
 */
export const CLAIM_TIMEOUT_MINUTES = 15;

export type ClaimedJob = {
  id: string;
  churchId: string;
  /** Where this church's files live in the bucket. */
  churchSlug: string;
  slug: string;
  title: string;
  author: string;
  audioSrc: string | null;
  videoSrc: string | null;
  durationSeconds: number;
  tidyRequested: boolean;
  transcribeAttempts: number;
};

/**
 * Put a song in line for whatever it needs: the audio pulled out of its video,
 * transcribing, or both. Returns false when there's nothing to work from.
 */
export async function enqueueSongWork(input: {
  churchId: string;
  songId: string;
  tidy: boolean;
}): Promise<boolean> {
  const [updated] = await db
    .update(songs)
    .set({
      status: "queued",
      tidyRequested: input.tidy,
      transcribeAttempts: 0,
      claimedAt: null,
      lastError: null,
    })
    .where(
      and(
        eq(songs.id, input.songId),
        eq(songs.churchId, input.churchId),
        // Nothing to listen to and no video to get it from — the UI blocks
        // this, but the action behind it is a public endpoint.
        sql`(${songs.audioSrc} is not null or ${songs.videoSrc} is not null)`,
      ),
    )
    .returning({ id: songs.id });

  return Boolean(updated);
}

/**
 * Take the next job, atomically.
 *
 * `FOR UPDATE SKIP LOCKED` is what lets several workers share one queue without
 * a lock server: each grabs a different row instead of queueing behind the same
 * one. The same statement also reclaims jobs whose worker died holding them.
 */
export async function claimNextJob(): Promise<ClaimedJob | null> {
  const result = await db.execute(sql`
    update songs
    set status = 'transcribing',
        claimed_at = now(),
        transcribe_attempts = transcribe_attempts + 1
    where id = (
      select id from songs
      where status = 'queued'
         -- Either working state can be left behind by a worker that died, and
         -- extracting is the longer of the two to be stranded in.
         or (status in ('transcribing', 'extracting')
             and claimed_at < now() - interval '${sql.raw(String(CLAIM_TIMEOUT_MINUTES))} minutes')
      order by claimed_at asc nulls first, created_at asc
      for update skip locked
      limit 1
    )
    returning id, church_id, slug, title, author, audio_src, video_src,
              duration_seconds, tidy_requested, transcribe_attempts
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  const churchId = String(row.church_id);
  const [church] = await db
    .select({ slug: churches.slug })
    .from(churches)
    .where(eq(churches.id, churchId))
    .limit(1);

  return {
    id: String(row.id),
    churchId,
    churchSlug: church?.slug ?? "unknown",
    slug: String(row.slug),
    title: String(row.title),
    author: String(row.author ?? ""),
    audioSrc: row.audio_src === null ? null : String(row.audio_src),
    videoSrc: row.video_src === null ? null : String(row.video_src),
    durationSeconds: Number(row.duration_seconds ?? 0),
    tidyRequested: row.tidy_requested === true,
    transcribeAttempts: Number(row.transcribe_attempts ?? 1),
  };
}

/** Say what the job is doing, so the editor can show more than "working". */
export async function markExtracting(job: ClaimedJob): Promise<void> {
  await db
    .update(songs)
    .set({ status: "extracting", claimedAt: new Date() })
    .where(eq(songs.id, job.id));
}

/** Back to the queue's working state once there's audio to transcribe. */
export async function markTranscribing(job: ClaimedJob): Promise<void> {
  await db
    .update(songs)
    .set({ status: "transcribing", claimedAt: new Date() })
    .where(eq(songs.id, job.id));
}

/**
 * The audio came out of the video, but nothing can be transcribed because the
 * server has no OpenAI key. That's a finished job, not a failed one — the
 * church has a playable file, and the reason there are no slides is worth
 * saying plainly rather than leaving the song stuck in "working".
 */
export async function markExtractedOnly(job: ClaimedJob): Promise<void> {
  await db
    .update(songs)
    .set({
      status: "draft",
      claimedAt: null,
      lastError:
        "Audio pulled out of the video. Set OPENAI_API_KEY on the server to turn it into slides.",
    })
    .where(eq(songs.id, job.id));
}

export async function markFailed(job: ClaimedJob, message: string): Promise<void> {
  // Under the limit it goes back in the queue; at the limit it stops and says why.
  const exhausted = job.transcribeAttempts >= MAX_ATTEMPTS;
  await db
    .update(songs)
    .set({
      status: exhausted ? "failed" : "queued",
      claimedAt: null,
      lastError: exhausted
        ? message
        : `${message} — retrying (attempt ${job.transcribeAttempts} of ${MAX_ATTEMPTS}).`,
    })
    .where(eq(songs.id, job.id));
}
