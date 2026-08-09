import Link from "next/link";
import { formatDate, formatDuration, getSeries } from "@/lib/sermons";
import type { Sermon } from "@/lib/types";

export default function SermonCard({ sermon }: { sermon: Sermon }) {
  const series = sermon.seriesSlug ? getSeries(sermon.seriesSlug) : undefined;

  return (
    <article className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-amber-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-700">
      <Link href={`/sermons/${sermon.slug}`} className="block">
        <div className="relative aspect-video bg-stone-200 dark:bg-stone-800">
          {sermon.media.poster ? (
            // Thumbnails come from whatever host the recordings live on.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sermon.media.poster}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : null}
          <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white">
            {formatDuration(sermon.durationSeconds)}
          </span>
          {sermon.media.kind === "audio" ? (
            <span className="absolute top-2 left-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium tracking-wide text-white uppercase">
              Audio
            </span>
          ) : null}
        </div>

        <div className="space-y-1 p-4">
          {series ? (
            <p className="text-xs font-medium tracking-wide text-amber-700 uppercase dark:text-amber-500">
              {series.title}
            </p>
          ) : null}
          <h3 className="font-semibold text-balance group-hover:text-amber-800 dark:group-hover:text-amber-400">
            {sermon.title}
          </h3>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {sermon.speaker} &middot; {formatDate(sermon.date)}
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-500">{sermon.scripture}</p>
        </div>
      </Link>
    </article>
  );
}
