import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Presenter from "@/components/songs/Presenter";
import { requireChurchAccess } from "@/lib/admin/guard";
import { getSong } from "@/lib/songs/service";
import { playbackUrl } from "@/lib/storage";
import { youtubeVideoId } from "@/lib/youtube";

export const metadata: Metadata = { title: "Presenting" };

export default async function PresentSongPage({
  params,
}: PageProps<"/s/[tenant]/present/songs/[slug]">) {
  const { tenant, slug } = await params;
  // Presenting is a staff activity — the screen shows the church's own material.
  const { church } = await requireChurchAccess(tenant);

  const song = await getSong(church.id, slug);
  if (!song) notFound();

  return (
    <Presenter
      title={song.title}
      videoId={song.sourceUrl ? youtubeVideoId(song.sourceUrl) : null}
      audioUrl={await playbackUrl(song.audioSrc)}
      slides={song.slides}
      offsetMs={song.timingOffsetMs}
    />
  );
}
