import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { songs } from "@/db/schema";

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
  slug: string;
  title: string;
  author: string;
  audioSrc: string | null;
  durationSeconds: number;
  tidyRequested: boolean;
  transcribeAttempts: number;
};

/** Put a song in line. Returns false if it has no audio to work from. */
export async function enqueueTranscription(input: {
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
        // No audio, no job — the UI blocks this, but the action is public.
        sql`${songs.audioSrc} is not null`,
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
         or (status = 'transcribing'
             and claimed_at < now() - interval '${sql.raw(String(CLAIM_TIMEOUT_MINUTES))} minutes')
      order by claimed_at asc nulls first, created_at asc
      for update skip locked
      limit 1
    )
    returning id, church_id, slug, title, author, audio_src,
              duration_seconds, tidy_requested, transcribe_attempts
  `);

  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  return {
    id: String(row.id),
    churchId: String(row.church_id),
    slug: String(row.slug),
    title: String(row.title),
    author: String(row.author ?? ""),
    audioSrc: row.audio_src === null ? null : String(row.audio_src),
    durationSeconds: Number(row.duration_seconds ?? 0),
    tidyRequested: row.tidy_requested === true,
    transcribeAttempts: Number(row.transcribe_attempts ?? 1),
  };
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
