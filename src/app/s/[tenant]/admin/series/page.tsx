import type { Metadata } from "next";
import Link from "next/link";
import SeriesForm from "@/components/admin/SeriesForm";
import { deleteSeriesAction } from "@/lib/admin/actions";
import { requireChurchAccess } from "@/lib/admin/guard";
import { listSeries } from "@/lib/content";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Series" };

export default async function AdminSeriesPage({
  params,
}: PageProps<"/s/[tenant]/admin/series">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const series = await listSeries(church.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link href="/admin" className="text-sm text-stone-500 hover:underline">
          &larr; Manage
        </Link>
        <h1 className="text-3xl font-semibold">Series</h1>
        <p className="text-sm text-stone-500">
          Group messages that belong together. Deleting a series keeps its messages.
        </p>
      </div>

      {series.length > 0 ? (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {series.map((entry) => (
            <li key={entry.slug} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{entry.title}</p>
                <p className="text-sm text-stone-500">
                  {entry.sermonCount} {entry.sermonCount === 1 ? "message" : "messages"} &middot;
                  /series/{entry.slug}
                </p>
              </div>
              <form action={deleteSeriesAction}>
                <input type="hidden" name="tenant" value={tenant} />
                <input type="hidden" name="slug" value={entry.slug} />
                <button
                  type="submit"
                  className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <SeriesForm tenant={tenant} uploadsEnabled={env.storage.isConfigured} />
    </div>
  );
}
