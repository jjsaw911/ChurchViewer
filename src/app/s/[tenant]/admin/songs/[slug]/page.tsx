import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SlideEditor from "@/components/songs/SlideEditor";
import SongForm from "@/components/songs/SongForm";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { requireChurchAccess } from "@/lib/admin/guard";
import { deleteSongAction, queueSongWorkAction } from "@/lib/songs/actions";
import { getSong } from "@/lib/songs/service";
import { env } from "@/lib/env";
import { playbackUrl } from "@/lib/storage";
import { youtubeVideoId } from "@/lib/youtube";

export const metadata: Metadata = { title: "Edit song" };

export default async function EditSongPage({
  params,
}: PageProps<"/s/[tenant]/admin/songs/[slug]">) {
  const { tenant, slug } = await params;
  const { church } = await requireChurchAccess(tenant);

  const song = await getSong(church.id, slug);
  if (!song) notFound();

  const audioUrl = await playbackUrl(song.audioSrc);
  const videoId = song.sourceUrl ? youtubeVideoId(song.sourceUrl) : null;

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <Link href="/admin/songs" className="text-sm text-stone-500 hover:underline">
          &larr; Songs
        </Link>
        <h1 className="text-3xl font-semibold">{song.title}</h1>
        {song.status === "failed" && song.lastError ? (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Last run failed: {song.lastError}
          </p>
        ) : null}

        {song.status === "queued" || song.status === "extracting" ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {song.status === "extracting"
              ? "Pulling the audio out of the video — this takes a few minutes for a full service."
              : "Waiting for the worker to pick this up."}{" "}
            Reload to check.
          </p>
        ) : null}

        {/* The video is the thing a church actually has after a Sunday, so the
            step that turns it into something usable shouldn't be buried. */}
        {song.videoSrc && !song.audioSrc && song.status !== "extracting" ? (
          <form
            action={queueSongWorkAction}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800"
          >
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="slug" value={song.slug} />
            <p className="flex-1 text-sm text-stone-600 dark:text-stone-400">
              There&apos;s a video on this song but no audio yet.
            </p>
            <button
              type="submit"
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
            >
              Pull the audio out
            </button>
          </form>
        ) : null}
      </header>

      <SlideEditor
        tenant={tenant}
        slug={song.slug}
        title={song.title}
        videoId={videoId}
        audioUrl={audioUrl}
        initialSlides={song.slides}
        initialOffsetMs={song.timingOffsetMs}
        canTranscribe={isOpenAiConfigured()}
        hasAudio={Boolean(song.audioSrc)}
      />

      <details className="rounded-xl border border-stone-200 p-5 dark:border-stone-800">
        <summary className="cursor-pointer text-sm font-semibold">Song details</summary>
        <div className="pt-5">
          <SongForm
            tenant={tenant}
            uploadsEnabled={env.storage.isConfigured}
            song={{
              slug: song.slug,
              title: song.title,
              author: song.author,
              ccliNumber: song.ccliNumber,
              sourceUrl: song.sourceUrl,
              audioSrc: song.audioSrc,
              videoSrc: song.videoSrc,
              durationSeconds: song.durationSeconds,
            }}
          />

          <form action={deleteSongAction} className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
            <input type="hidden" name="tenant" value={tenant} />
            <input type="hidden" name="slug" value={song.slug} />
            <button
              type="submit"
              className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
            >
              Delete this song
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
