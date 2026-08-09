import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MediaPlayer from "@/components/MediaPlayer";
import {
  formatDate,
  formatDuration,
  getAllSermons,
  getNextInSeries,
  getSeries,
  getSermon,
} from "@/lib/sermons";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllSermons().map((sermon) => ({ slug: sermon.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const sermon = getSermon(slug);
  if (!sermon) return { title: "Not found" };
  return {
    title: sermon.title,
    description: sermon.description,
    openGraph: {
      title: sermon.title,
      description: sermon.description,
      images: sermon.media.poster ? [sermon.media.poster] : undefined,
    },
  };
}

export default async function SermonPage({ params }: Params) {
  const { slug } = await params;
  const sermon = getSermon(slug);
  if (!sermon) notFound();

  const series = sermon.seriesSlug ? getSeries(sermon.seriesSlug) : undefined;
  const next = getNextInSeries(sermon);

  return (
    <article className="mx-auto max-w-4xl space-y-8">
      <MediaPlayer slug={sermon.slug} title={sermon.title} media={sermon.media} />

      <header className="space-y-3">
        {series ? (
          <Link
            href={`/series/${series.slug}`}
            className="text-xs font-semibold tracking-widest text-amber-700 uppercase hover:underline dark:text-amber-500"
          >
            {series.title}
          </Link>
        ) : null}
        <h1 className="text-3xl font-semibold text-balance">{sermon.title}</h1>
        <p className="text-stone-600 dark:text-stone-400">
          {sermon.speaker} &middot; {formatDate(sermon.date)} &middot;{" "}
          {formatDuration(sermon.durationSeconds)}
        </p>
        <p className="font-medium text-stone-700 dark:text-stone-300">{sermon.scripture}</p>
      </header>

      <p className="text-lg leading-relaxed text-stone-700 dark:text-stone-300">
        {sermon.description}
      </p>

      <div className="flex flex-wrap gap-4 border-t border-stone-200 pt-6 text-sm font-medium dark:border-stone-800">
        <Link href="/" className="underline underline-offset-4 hover:text-amber-700">
          &larr; Back to the library
        </Link>
        {next ? (
          <Link
            href={`/sermons/${next.slug}`}
            className="ml-auto underline underline-offset-4 hover:text-amber-700"
          >
            Next in this series: {next.title} &rarr;
          </Link>
        ) : null}
      </div>
    </article>
  );
}
