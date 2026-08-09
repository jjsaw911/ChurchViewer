import type { Metadata } from "next";
import Link from "next/link";
import { requireChurchAccess } from "@/lib/admin/guard";
import { listSongs } from "@/lib/songs/service";
import { formatDuration } from "@/lib/format";

export const metadata: Metadata = { title: "Songs" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  transcribing: "Transcribing…",
  ready: "Ready",
  failed: "Needs attention",
};

export default async function SongsPage({ params }: PageProps<"/s/[tenant]/admin/songs">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);
  const songs = await listSongs(church.id);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <Link href="/admin" className="text-sm text-stone-500 hover:underline">
            &larr; Manage
          </Link>
          <h1 className="text-3xl font-semibold">Songs</h1>
          <p className="text-sm text-stone-500">
            Worship slides, timed to the recording so they change themselves.
          </p>
        </div>
        <Link
          href="/admin/songs/new"
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Add a song
        </Link>
      </header>

      {songs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-12 text-center text-stone-500 dark:border-stone-700">
          No songs yet.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {songs.map((song) => (
            <li key={song.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/songs/${song.slug}`}
                  className="font-medium hover:text-amber-700 dark:hover:text-amber-500"
                >
                  {song.title}
                </Link>
                <p className="text-sm text-stone-500">
                  {[song.author, formatDuration(song.durationSeconds)].filter(Boolean).join(" · ")}
                  {song.slides.length ? ` · ${song.slides.length} slides` : " · no slides yet"}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span
                  className={
                    song.status === "ready"
                      ? "text-emerald-700 dark:text-emerald-500"
                      : song.status === "failed"
                        ? "text-red-700 dark:text-red-400"
                        : "text-stone-500"
                  }
                >
                  {STATUS_LABEL[song.status] ?? song.status}
                </span>
                {song.slides.length > 0 ? (
                  <Link
                    href={`/present/songs/${song.slug}`}
                    className="font-medium text-amber-700 hover:underline dark:text-amber-500"
                  >
                    Present
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
