/**
 * Integration checks for the transcription queue. These need a real Postgres —
 * the guarantees under test (row locking, atomic claiming) only exist there.
 *
 *   npm run test:db     # with DATABASE_URL pointing at a scratch database
 *
 * Every song row is rewritten, so point it at a development database.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { loadEnvConfig } from "@next/env";
import { eq, sql } from "drizzle-orm";

/**
 * Config has to be loaded before `db/client` builds its pool, so the modules are
 * pulled in lazily rather than at the top of the file.
 */
let loaded: Awaited<ReturnType<typeof load>> | null = null;

async function load() {
  loadEnvConfig(process.cwd());
  const [{ db }, schema, queue] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
    import("@/lib/songs/queue"),
  ]);
  return { db, churches: schema.churches, songs: schema.songs, ...queue };
}

const ctx = async () => (loaded ??= await load());

async function scratchChurch(): Promise<string> {
  const { db, churches } = await ctx();
  const slug = `queue-test-${Date.now()}-${Math.round(process.hrtime()[1] / 1000)}`;
  const [row] = await db
    .insert(churches)
    .values({ slug, name: "Queue Test" })
    .returning({ id: churches.id });
  return row.id;
}

async function makeSong(churchId: string, slug: string, audio: string | null = "/media/x.wav") {
  const { db, songs } = await ctx();
  const [row] = await db
    .insert(songs)
    .values({ churchId, slug, title: slug, audioSrc: audio })
    .returning({ id: songs.id });
  return row.id;
}

const statusOf = async (id: string) => {
  const { db, songs } = await ctx();
  const [row] = await db
    .select({ status: songs.status, attempts: songs.transcribeAttempts, error: songs.lastError })
    .from(songs)
    .where(eq(songs.id, id));
  return row;
};

test("two workers claim different jobs, and never the same one", async () => {
  const { db, churches, claimNextJob, enqueueTranscription } = await ctx();
  const churchId = await scratchChurch();
  const first = await makeSong(churchId, "one");
  const second = await makeSong(churchId, "two");
  await enqueueTranscription({ churchId, songId: first, tidy: true });
  await enqueueTranscription({ churchId, songId: second, tidy: true });

  // Both claims race, exactly as two worker processes would.
  const [a, b] = await Promise.all([claimNextJob(), claimNextJob()]);
  assert.ok(a && b, "both workers should get a job");
  assert.notEqual(a.id, b.id, "two workers claimed the same job");
  assert.deepEqual(
    [a.id, b.id].sort(),
    [first, second].sort(),
    "the claimed jobs should be the two queued ones",
  );

  assert.equal(await claimNextJob(), null, "an empty queue should hand out nothing");

  await db.delete(churches).where(eq(churches.id, churchId));
});

test("a job whose worker died is reclaimed, not left stuck", async () => {
  const { db, churches, songs, claimNextJob, enqueueTranscription } = await ctx();
  const churchId = await scratchChurch();
  const songId = await makeSong(churchId, "abandoned");
  await enqueueTranscription({ churchId, songId, tidy: true });

  const claimed = await claimNextJob();
  assert.equal(claimed?.id, songId);
  assert.equal(await claimNextJob(), null, "a freshly claimed job must not be handed out twice");

  // Pretend that worker was killed a while ago.
  await db
    .update(songs)
    .set({ claimedAt: sql`now() - interval '30 minutes'` })
    .where(eq(songs.id, songId));

  const reclaimed = await claimNextJob();
  assert.equal(reclaimed?.id, songId, "a stale claim should be picked up again");
  assert.equal(reclaimed?.transcribeAttempts, 2, "the retry should count");

  await db.delete(churches).where(eq(churches.id, churchId));
});

test("failures retry, then stop and say why", async () => {
  const { db, churches, claimNextJob, enqueueTranscription, markFailed, MAX_ATTEMPTS } = await ctx();
  const churchId = await scratchChurch();
  const songId = await makeSong(churchId, "doomed");
  await enqueueTranscription({ churchId, songId, tidy: true });

  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
    const job = await claimNextJob();
    assert.equal(job?.id, songId);
    await markFailed(job!, "the audio was unreadable");
    const after = await statusOf(songId);
    assert.equal(after.status, "queued", `attempt ${attempt} should go back in the queue`);
    assert.match(after.error ?? "", /retrying/);
  }

  const last = await claimNextJob();
  assert.equal(last?.transcribeAttempts, MAX_ATTEMPTS);
  await markFailed(last!, "the audio was unreadable");

  const finished = await statusOf(songId);
  assert.equal(finished.status, "failed", "it should stop trying eventually");
  assert.equal(finished.error, "the audio was unreadable");
  assert.equal(await claimNextJob(), null, "a failed job must not be retried forever");

  await db.delete(churches).where(eq(churches.id, churchId));
});

test("a song with no audio is never queued", async () => {
  const { db, churches, claimNextJob, enqueueTranscription } = await ctx();
  const churchId = await scratchChurch();
  const songId = await makeSong(churchId, "silent", null);

  assert.equal(await enqueueTranscription({ churchId, songId, tidy: true }), false);
  assert.equal((await statusOf(songId)).status, "draft");
  assert.equal(await claimNextJob(), null);

  await db.delete(churches).where(eq(churches.id, churchId));
});

test("one church cannot queue another church's song", async () => {
  const { db, churches, enqueueTranscription } = await ctx();
  const mine = await scratchChurch();
  const theirs = await scratchChurch();
  const songId = await makeSong(theirs, "not-yours");

  assert.equal(await enqueueTranscription({ churchId: mine, songId, tidy: true }), false);
  assert.equal((await statusOf(songId)).status, "draft");

  await db.delete(churches).where(eq(churches.id, mine));
  await db.delete(churches).where(eq(churches.id, theirs));
});
