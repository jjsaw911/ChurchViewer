import type { Metadata } from "next";
import Link from "next/link";
import { getAllSeries, getSermonsInSeries } from "@/lib/sermons";

export const metadata: Metadata = {
  title: "Series",
  description: "Every teaching series, with the messages in each.",
};

export default function SeriesIndexPage() {
  const series = getAllSeries();

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-semibold">Series</h1>

      <div className="grid gap-6 sm:grid-cols-2">
        {series.map((entry) => {
          const count = getSermonsInSeries(entry.slug).length;
          return (
            <Link
              key={entry.slug}
              href={`/series/${entry.slug}`}
              className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-amber-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-700"
            >
              <div className="aspect-video bg-stone-200 dark:bg-stone-800">
                {entry.artwork ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.artwork}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="space-y-2 p-5">
                <h2 className="text-lg font-semibold group-hover:text-amber-800 dark:group-hover:text-amber-400">
                  {entry.title}
                </h2>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {entry.description}
                </p>
                <p className="text-sm text-stone-500">
                  {count} {count === 1 ? "message" : "messages"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
