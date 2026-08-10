/**
 * The song worker.
 *
 * Two jobs live here, in the order a song needs them: pulling the audio out of
 * a video, then turning that audio into slides. Both are far too long to hold a
 * web request open — a service video takes minutes to transcode — so the web app
 * only ever puts a song in the queue and this process does the work. Several
 * copies can run at once; `claimNextJob` hands each a different row.
 *
 *   npm run worker
 *
 * Needs ffmpeg on the PATH to extract audio. Without OPENAI_API_KEY it still
 * runs and still extracts; it just can't build slides.
 *
 * On the VM, run it as its own systemd unit alongside the app.
 */
import { loadEnvConfig } from "@next/env";

async function main() {
  loadEnvConfig(process.cwd());

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  // Imported after the environment is loaded, so the pool reads the real URL.
  const { isOpenAiConfigured } = await import("@/lib/ai/openai");
  const {
    claimNextJob,
    markExtracting,
    markExtractedOnly,
    markFailed,
    markTranscribing,
    MAX_ATTEMPTS,
  } = await import("@/lib/songs/queue");
  const { runTranscription } = await import("@/lib/songs/service");
  const { extractAudio } = await import("@/lib/songs/extract");
  const { detectSongKey } = await import("@/lib/songs/analyse");

  const idleDelayMs = Number(process.env.WORKER_POLL_MS ?? 3000);
  let running = true;

  // Finish the job in hand before exiting, so a deploy doesn't strand one.
  const stop = (signal: string) => {
    console.log(`${signal} received — finishing the current job, then stopping.`);
    running = false;
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  console.log("Song worker started.");

  while (running) {
    let job;
    try {
      job = await claimNextJob();
    } catch (error) {
      console.error("Couldn't reach the database:", error);
      await sleep(idleDelayMs);
      continue;
    }

    if (!job) {
      await sleep(idleDelayMs);
      continue;
    }

    const started = Date.now();
    console.log(`→ ${job.slug} (attempt ${job.transcribeAttempts}/${MAX_ATTEMPTS})`);

    try {
      // A song that arrived as a video has to become audio before anything can
      // listen to it. Done once: the extracted file is saved on the song, so a
      // retry or a re-run of the transcription doesn't transcode it again.
      if (!job.audioSrc && job.videoSrc) {
        await markExtracting(job);
        job.audioSrc = await extractAudio(job);
        console.log(`  audio extracted in ${Math.round((Date.now() - started) / 1000)}s`);
        await markTranscribing(job);
      }

      // What key it's in. Cheap, needs nothing but ffmpeg, and useful to the
      // band whether or not there's ever a word of it transcribed — so it
      // happens before the step that can be turned off.
      try {
        const key = await detectSongKey(job);
        if (key) console.log(`  key: ${key.label} (confidence ${key.confidence})`);
      } catch (error) {
        // A song without a key printed on it is a small loss; a job failed over
        // one is a larger one.
        console.warn(`  couldn't work out the key: ${error instanceof Error ? error.message : error}`);
      }

      // Checked per job, not at startup: the key can be set in the platform
      // console at any moment, and a worker that decided hours ago that there
      // wasn't one would keep refusing until somebody restarted it.
      if (!(await isOpenAiConfigured())) {
        await markExtractedOnly(job);
        console.log(`✓ ${job.slug}: audio ready, no OpenAI key so no slides`);
        continue;
      }

      const slides = await runTranscription(job);
      console.log(`✓ ${job.slug}: ${slides.length} slides in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed.";
      console.error(`✗ ${job.slug}: ${message}`);
      try {
        await markFailed(job, message);
      } catch (bookkeeping) {
        // If this fails the row stays claimed; the stale-claim sweep recovers it.
        console.error("Couldn't record the failure:", bookkeeping);
      }
    }
  }

  console.log("Worker stopped.");
  process.exit(0);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

void main();
