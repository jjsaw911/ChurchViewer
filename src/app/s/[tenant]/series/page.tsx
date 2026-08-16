import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listSeries } from "@/lib/content";
import { getChurchBySlug } from "@/lib/churches";

export const metadata: Metadata = { title: "Series" };

export default async function SeriesIndexPage({ params }: PageProps<"/s/[tenant]/series">) {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const series = await listSeries(church.id);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Series</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Messages grouped into the run they belong to &mdash; a month on Philippians, a
          summer of parables &mdash; so somebody who liked one can find the rest.
        </p>
      </div>

      {series.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-stone-500 dark:border-stone-700">
          No series yet. They are made under Series in the church menu, and each one holds
          the messages you put in it.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {series.map((entry) => (
            <Link
              key={entry.slug}
              href={`/series/${entry.slug}`}
              className="group overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:border-amber-300 hover:shadow-md dark:border-stone-800 dark:bg-stone-900 dark:hover:border-amber-700"
            >
              <div className="aspect-video bg-stone-200 dark:bg-stone-800">
                {entry.artworkUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.artworkUrl}
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
                {entry.description ? (
                  <p className="text-sm text-stone-600 dark:text-stone-400">{entry.description}</p>
                ) : null}
                <p className="text-sm text-stone-500">
                  {entry.sermonCount} {entry.sermonCount === 1 ? "message" : "messages"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
