import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SermonLibrary from "@/components/SermonLibrary";
import { listSermons, listSeries, listSpeakers } from "@/lib/content";
import { formatDate, formatDuration } from "@/lib/format";
import { getChurchBySlug } from "@/lib/churches";

export async function generateMetadata({ params }: PageProps<"/s/[tenant]">): Promise<Metadata> {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) return { title: "Not found" };
  return {
    title: { absolute: `${church.name} · Sermons` },
    description: church.tagline || `Recorded services from ${church.name}.`,
  };
}

export default async function LibraryPage({ params }: PageProps<"/s/[tenant]">) {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const [sermons, series, speakers] = await Promise.all([
    listSermons(church.id),
    listSeries(church.id),
    listSpeakers(church.id),
  ]);

  const latest = sermons[0];

  if (!latest) {
    return (
      <div className="mx-auto max-w-lg space-y-3 py-20 text-center">
        <h1 className="text-2xl font-semibold">Nothing here yet</h1>
        <p className="text-stone-600 dark:text-stone-400">
          {church.name} hasn&rsquo;t published any messages yet. Check back soon.
        </p>
      </div>
    );
  }

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
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={`/sermons/${latest.slug}`}
              className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
            >
              {latest.mediaKind === "video" ? "Watch now" : "Listen now"}
            </Link>
            {latest.seriesSlug ? (
              <Link
                href={`/series/${latest.seriesSlug}`}
                className="text-sm font-medium underline underline-offset-4 hover:text-amber-700 dark:hover:text-amber-500"
              >
                Full series: {latest.seriesTitle}
              </Link>
            ) : null}
          </div>
        </div>

        <Link
          href={`/sermons/${latest.slug}`}
          className="block overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-800"
        >
          {latest.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={latest.posterUrl} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="aspect-video w-full" />
          )}
        </Link>
      </section>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Browse the library</h2>
        <SermonLibrary sermons={sermons} series={series} speakers={speakers} />
      </div>
    </div>
  );
}
