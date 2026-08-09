import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SlideEditor from "@/components/songs/SlideEditor";
import SongForm from "@/components/songs/SongForm";
import { isOpenAiConfigured } from "@/lib/ai/openai";
import { requireChurchAccess } from "@/lib/admin/guard";
import { deleteSongAction } from "@/lib/songs/actions";
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
            Last transcription failed: {song.lastError}
          </p>
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
