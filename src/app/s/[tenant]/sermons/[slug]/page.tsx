import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import MediaPlayer from "@/components/MediaPlayer";
import { getNextInSeries, getSermon } from "@/lib/content";
import { formatDate, formatDuration } from "@/lib/format";
import { getChurchBySlug } from "@/lib/churches";

export async function generateMetadata({
  params,
}: PageProps<"/s/[tenant]/sermons/[slug]">): Promise<Metadata> {
  const { tenant, slug } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) return { title: "Not found" };

  const sermon = await getSermon(church.id, slug);
  if (!sermon) return { title: "Not found" };

  return {
    title: { absolute: `${sermon.title} · ${church.name}` },
    description: sermon.description,
    openGraph: {
      title: sermon.title,
      description: sermon.description,
      images: sermon.posterUrl ? [sermon.posterUrl] : undefined,
    },
  };
}

export default async function SermonPage({ params }: PageProps<"/s/[tenant]/sermons/[slug]">) {
  const { tenant, slug } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const sermon = await getSermon(church.id, slug);
  if (!sermon) notFound();

  const next = await getNextInSeries(church.id, sermon);

  return (
    <article className="mx-auto max-w-4xl space-y-8">
      <MediaPlayer slug={sermon.slug} title={sermon.title} media={sermon.media} />

      <header className="space-y-3">
        {sermon.seriesSlug ? (
          <Link
            href={`/series/${sermon.seriesSlug}`}
            className="text-xs font-semibold tracking-widest text-amber-700 uppercase hover:underline dark:text-amber-500"
          >
            {sermon.seriesTitle}
          </Link>
        ) : null}
        <h1 className="text-3xl font-semibold text-balance">{sermon.title}</h1>
        <p className="text-stone-600 dark:text-stone-400">
          {sermon.speaker} &middot; {formatDate(sermon.date)} &middot;{" "}
          {formatDuration(sermon.durationSeconds)}
        </p>
        {sermon.scripture ? (
          <p className="font-medium text-stone-700 dark:text-stone-300">{sermon.scripture}</p>
        ) : null}
      </header>

      {sermon.description ? (
        <p className="text-lg leading-relaxed text-stone-700 dark:text-stone-300">
          {sermon.description}
        </p>
      ) : null}

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
