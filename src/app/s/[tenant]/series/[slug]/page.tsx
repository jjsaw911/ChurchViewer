import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SermonCard from "@/components/SermonCard";
import { getSeriesRow, listSermonsInSeries } from "@/lib/content";
import { getChurchBySlug } from "@/lib/churches";
import { hasChurchAccess } from "@/lib/admin/guard";

export async function generateMetadata({
  params,
}: PageProps<"/s/[tenant]/series/[slug]">): Promise<Metadata> {
  const { tenant, slug } = await params;
  const church = await getChurchBySlug(tenant);
  const series = church ? await getSeriesRow(church.id, slug) : null;
  if (!series) return { title: "Not found" };
  return { title: series.title, description: series.description };
}

export default async function SeriesPage({ params }: PageProps<"/s/[tenant]/series/[slug]">) {
  const { tenant, slug } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();
  // Nobody outside this church renders any of it — see `hasChurchAccess`.
  if (!(await hasChurchAccess(church.id))) return null;

  const series = await getSeriesRow(church.id, slug);
  if (!series) notFound();

  const sermons = await listSermonsInSeries(church.id, series.id);

  return (
    <div className="space-y-8">
      <header className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase dark:text-amber-500">
          Series
        </p>
        <h1 className="text-3xl font-semibold text-balance">{series.title}</h1>
        {series.description ? (
          <p className="text-stone-700 dark:text-stone-300">{series.description}</p>
        ) : null}
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
