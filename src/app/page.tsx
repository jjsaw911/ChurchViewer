import Link from "next/link";
import SermonLibrary from "@/components/SermonLibrary";
import {
  formatDate,
  formatDuration,
  getAllSeries,
  getAllSermons,
  getLatestSermon,
  getSeries,
  getSpeakers,
} from "@/lib/sermons";

export default function HomePage() {
  const latest = getLatestSermon();
  const latestSeries = latest.seriesSlug ? getSeries(latest.seriesSlug) : undefined;

  return (
    <div className="space-y-12">
      <section className="grid gap-8 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 md:grid-cols-2 md:items-center dark:border-stone-800 dark:bg-stone-900">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase dark:text-amber-500">
            Most recent
          </p>
          <h1 className="text-3xl font-semibold text-balance">{latest.title}</h1>
          <p className="text-stone-600 dark:text-stone-400">
            {latest.speaker} &middot; {formatDate(latest.date)} &middot;{" "}
            {formatDuration(latest.durationSeconds)}
          </p>
          <p className="text-stone-700 dark:text-stone-300">{latest.description}</p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={`/sermons/${latest.slug}`}
              className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
            >
              {latest.media.kind === "video" ? "Watch now" : "Listen now"}
            </Link>
            {latestSeries ? (
              <Link
                href={`/series/${latestSeries.slug}`}
                className="text-sm font-medium underline underline-offset-4 hover:text-amber-700 dark:hover:text-amber-500"
              >
                Full series: {latestSeries.title}
              </Link>
            ) : null}
          </div>
        </div>

        <Link
          href={`/sermons/${latest.slug}`}
          className="block overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-800"
        >
          {latest.media.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={latest.media.poster}
              alt=""
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div className="aspect-video w-full" />
          )}
        </Link>
      </section>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Browse the library</h2>
        <SermonLibrary
          sermons={getAllSermons()}
          series={getAllSeries()}
          speakers={getSpeakers()}
        />
      </div>
    </div>
  );
}
