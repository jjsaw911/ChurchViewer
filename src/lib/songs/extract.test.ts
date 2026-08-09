/**
 * The two decisions in audio extraction that are worth pinning down: what the
 * resulting file is called, and what ffmpeg is actually asked to do. The rest
 * of that module is a subprocess and a bucket, which belong to the db tests.
 */
import assert from "node:assert/strict";
import test from "node:test";

// The module reaches the database client, which reads its URL as it loads.
// Nothing here connects — a pool is lazy — but the variable has to exist, and
// it has to be set before the import, so the import is deferred into the tests.
process.env.DATABASE_URL ??= "postgresql://unused@127.0.0.1:5432/unused";

const load = () => import("@/lib/songs/extract");

test("the audio keeps the video's name, with an mp3 extension", async () => {
  const { audioFilenameFor } = await load();

  assert.equal(
    audioFilenameFor(
      "gcs:churches/hope/3f1c2b40-9c7e-4c1a-9a0e-2b6d4f5a1e77-sunday-service.mp4",
      "song",
    ),
    "sunday-service.mp3",
  );
  assert.equal(audioFilenameFor("https://example.org/media/set.mov", "song"), "set.mp3");
});

test("a location with nothing usable in it falls back to the song", async () => {
  const { audioFilenameFor } = await load();

  assert.equal(audioFilenameFor("", "cornerstone"), "cornerstone.mp3");
  assert.equal(
    audioFilenameFor("https://example.org/download?id=12", "cornerstone"),
    "download.mp3",
  );
});

test("the room to work in leaves a reserve, and never goes negative", async () => {
  const { spaceBudget } = await load();
  const GB = 1024 ** 3;

  // Half a gig is held back, so a nearly-full disk offers nothing.
  assert.equal(spaceBudget(0.4 * GB), 0);
  assert.equal(spaceBudget(2 * GB), 1.5 * GB);
  // And a big disk is still capped at what any real video should be.
  assert.equal(spaceBudget(90 * GB), 4 * GB);
});

test("ffmpeg is asked for mono mp3 with the picture dropped", async () => {
  const { ffmpegArgs } = await load();
  const args = ffmpegArgs("/tmp/in", "/tmp/out.mp3");

  assert.deepEqual(args.slice(0, 5), ["-nostdin", "-y", "-i", "/tmp/in", "-vn"]);
  assert.ok(args.includes("libmp3lame"));
  // Mono: two channels of a congregation singing is twice the bytes for nothing.
  assert.equal(args[args.indexOf("-ac") + 1], "1");
  assert.equal(args[args.length - 1], "/tmp/out.mp3");
});
