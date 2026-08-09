import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SermonCard from "@/components/SermonCard";
import { getAllSeries, getSeries, getSermonsInSeries } from "@/lib/sermons";

type Params = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllSeries().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const series = getSeries(slug);
  if (!series) return { title: "Not found" };
  return { title: series.title, description: series.description };
}

export default async function SeriesPage({ params }: Params) {
  const { slug } = await params;
  const series = getSeries(slug);
  if (!series) notFound();

  const sermons = getSermonsInSeries(slug);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase dark:text-amber-500">
          Series
        </p>
        <h1 className="text-3xl font-semibold text-balance">{series.title}</h1>
        <p className="text-stone-700 dark:text-stone-300">{series.description}</p>
        <p className="text-sm text-stone-500">
          {sermons.length} {sermons.length === 1 ? "message" : "messages"}
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {sermons.map((sermon) => (
          <SermonCard key={sermon.slug} sermon={sermon} />
        ))}
      </div>
    </div>
  );
}
