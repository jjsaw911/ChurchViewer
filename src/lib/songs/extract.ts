import { spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { songs } from "@/db/schema";
import { rootUrl } from "@/lib/env";
import { displayFilename, registerMedia } from "@/lib/media/service";
import { playbackUrl, uploadFile } from "@/lib/storage";

/**
 * Pulling the audio out of a video the church holds.
 *
 * This is what a church actually has after a Sunday: one video file. Getting
 * slides out of it used to mean finding an audio editor, exporting an mp3, and
 * uploading that instead — and even then a full-length video is far past the
 * 25MB the transcription API accepts, so the obvious thing simply failed.
 *
 * A mono 96kbps mp3 is about 0.7MB a minute, which puts a half-hour recording
 * comfortably inside that limit and loses nothing that matters for hearing
 * words. It also gives the church a file that plays anywhere, which is worth
 * having on its own.
 *
 * Nothing here touches YouTube. Downloading from YouTube is against its terms
 * whoever holds the rights to the song; a church that owns the upload can take
 * the original out of YouTube Studio.
 */

/** Enough for a service video; past this something has gone wrong upstream. */
const MAX_SOURCE_BYTES = 4 * 1024 * 1024 * 1024;

const AUDIO_BITRATE = "96k";

export type ExtractableJob = {
  id: string;
  churchId: string;
  churchSlug: string;
  slug: string;
  title: string;
  videoSrc: string | null;
};

/**
 * `service-2026-08-09.mp4` -> `service-2026-08-09.mp3`.
 *
 * Object keys carry a uuid to keep them unguessable; it comes off here, or the
 * church ends up with an audio file named after a random number.
 */
export function audioFilenameFor(source: string, fallback: string): string {
  const last = displayFilename(source.split("?")[0]);
  const base = (last || fallback).replace(/\.[^.]+$/, "");
  return `${base || fallback}.mp3`;
}

/** The ffmpeg call, kept apart so what it does is readable and testable. */
export function ffmpegArgs(input: string, output: string): string[] {
  return [
    // Never wait on a terminal: this runs headless under systemd.
    "-nostdin",
    "-y",
    "-i",
    input,
    // Drop the picture, keep one channel — speech and singing don't need two.
    "-vn",
    "-ac",
    "1",
    "-acodec",
    "libmp3lame",
    "-b:a",
    AUDIO_BITRATE,
    output,
  ];
}

export class MissingFfmpegError extends Error {
  constructor() {
    super(
      "ffmpeg isn't installed where the worker runs. On the server: sudo apt install ffmpeg.",
    );
    this.name = "MissingFfmpegError";
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });

    // ffmpeg talks on stderr even when it's happy, so it's only worth keeping
    // to explain a failure. The tail is plenty; a long encode is a lot of text.
    let errors = "";
    child.stderr.on("data", (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-4000);
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      reject(error.code === "ENOENT" ? new MissingFfmpegError() : error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}.\n${errors.trim()}`));
    });
  });
}

/** Stream the source to disk — a service video does not belong in memory. */
async function download(location: string, to: string): Promise<void> {
  const resolved = await playbackUrl(location);
  if (!resolved) throw new Error("Couldn't work out where that video lives.");

  // A church may hold the file on their own site at a path like `/media/x.mp4`.
  const url = new URL(resolved, rootUrl("/"));
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The video has to be at an http(s) location.");
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Couldn't download the video (${response.status}).`);
  }

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_SOURCE_BYTES) {
    throw new Error(`That video is ${(declared / 1024 ** 3).toFixed(1)}GB, which is too big.`);
  }

  let seen = 0;
  const counted = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      // A server that didn't declare a length still can't fill the disk.
      if (seen > MAX_SOURCE_BYTES) throw new Error("That video is too big to work with.");
      controller.enqueue(chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(response.body.pipeThrough(counted) as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(to),
  );
}

/**
 * Turn the song's video into an audio file, store it, and point the song at it.
 *
 * Returns the new audio location. The video is left exactly as it was, so this
 * can be run again.
 */
export async function extractAudio(job: ExtractableJob): Promise<string> {
  if (!job.videoSrc) throw new Error("There's no video on this song to take the audio from.");

  const workspace = await mkdtemp(join(tmpdir(), "churchviewer-"));
  const source = join(workspace, "source");
  const output = join(workspace, "audio.mp3");

  try {
    await download(job.videoSrc, source);
    await run("ffmpeg", ffmpegArgs(source, output));

    const { size } = await stat(output);
    if (size === 0) throw new Error("ffmpeg produced an empty file — is there an audio track?");

    const filename = audioFilenameFor(job.videoSrc, job.slug);
    const location = await uploadFile({
      churchSlug: job.churchSlug,
      filename,
      contentType: "audio/mpeg",
      path: output,
    });

    await db.update(songs).set({ audioSrc: location }).where(eq(songs.id, job.id));

    // Into the library like any other file, so it can be found and reused
    // rather than being a thing only this song knows about.
    await registerMedia({
      churchId: job.churchId,
      location,
      filename,
      contentType: "audio/mpeg",
      bytes: size,
      title: `${job.title} (audio)`,
    });

    return location;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
