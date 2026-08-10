import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { songs } from "@/db/schema";
import { rootUrl } from "@/lib/env";
import { detectKey, type DetectedKey } from "@/lib/songs/key";
import { playbackUrl } from "@/lib/storage";

/**
 * Listening to a recording for what key it's in.
 *
 * Cheap next to transcription — no network, no API, a few seconds of maths —
 * so it runs for every song that has audio, including on a server with no
 * OpenAI key at all.
 */

/** The rate the analysis works at; anything above 11kHz is cymbals. */
const SAMPLE_RATE = 22050;

/**
 * How much of the song to listen to.
 *
 * Two minutes is a verse and a chorus, which is the key. Songs that modulate do
 * it late and for effect, and the band still writes the opening key at the top
 * of the chart.
 */
const SECONDS = 120;

/** Below this the two best keys were too close to be worth printing. */
const MINIMUM_CONFIDENCE = 0.25;

/** Decode straight to raw mono samples, which is all the analysis wants. */
function decode(url: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-nostdin",
      "-loglevel",
      "error",
      "-i",
      url,
      "-t",
      String(SECONDS),
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "s16le",
      "-",
    ]);

    const chunks: Buffer[] = [];
    let errors = "";

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-2000);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with ${code}. ${errors.trim()}`));
        return;
      }

      const pcm = Buffer.concat(chunks);
      const samples = new Float32Array(pcm.length / 2);
      for (let i = 0; i < samples.length; i++) {
        // Signed 16-bit little-endian, scaled into -1..1.
        samples[i] = pcm.readInt16LE(i * 2) / 32768;
      }
      resolve(samples);
    });
  });
}

/**
 * Work out the key and write it on the song.
 *
 * Returns what it found, or null when it couldn't tell — a spoken recording, a
 * song that sits equally well in two keys, silence. Null is written as null:
 * an empty key on a chart is honest, and a wrong one sends a band into the
 * wrong shape in front of everybody.
 */
export async function detectSongKey(job: {
  id: string;
  audioSrc: string | null;
}): Promise<DetectedKey | null> {
  if (!job.audioSrc) return null;

  const location = await playbackUrl(job.audioSrc);
  if (!location) return null;

  // ffmpeg reads a URL directly, so nothing lands on disk for this one.
  const url = new URL(location, rootUrl("/"));
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const samples = await decode(url.toString());
  const detected = detectKey(samples, SAMPLE_RATE);

  const worthKeeping = detected && detected.confidence >= MINIMUM_CONFIDENCE ? detected : null;

  await db
    .update(songs)
    .set({ musicalKey: worthKeeping?.label ?? null })
    .where(eq(songs.id, job.id));

  return worthKeeping;
}
