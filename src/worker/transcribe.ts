/**
 * The transcription worker.
 *
 * Transcribing a song takes tens of seconds and a sermon takes minutes, which is
 * far too long to hold a web request open. The web app only ever puts a song in
 * the queue; this process does the work, and several copies can run at once —
 * `claimNextJob` hands each a different row.
 *
 *   npm run worker
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
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set — the worker would fail every job.");
    process.exit(1);
  }

  // Imported after the environment is loaded, so the pool reads the real URL.
  const { claimNextJob, markFailed, MAX_ATTEMPTS } = await import("@/lib/songs/queue");
  const { runTranscription } = await import("@/lib/songs/service");

  const idleDelayMs = Number(process.env.WORKER_POLL_MS ?? 3000);
  let running = true;

  // Finish the job in hand before exiting, so a deploy doesn't strand one.
  const stop = (signal: string) => {
    console.log(`${signal} received — finishing the current job, then stopping.`);
    running = false;
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  console.log("Transcription worker started.");

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
