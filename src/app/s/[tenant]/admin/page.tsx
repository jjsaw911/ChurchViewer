import type { Metadata } from "next";
import Link from "next/link";
import { listSermons } from "@/lib/content";
import { requireChurchAccess } from "@/lib/admin/guard";
import { formatDate, formatDuration } from "@/lib/format";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Manage" };

export default async function AdminPage({ params }: PageProps<"/s/[tenant]/admin">) {
  const { tenant } = await params;
  const { church, user } = await requireChurchAccess(tenant);

  const sermons = await listSermons(church.id, { includeDrafts: true });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">Manage {church.name}</h1>
          <p className="text-sm text-stone-500">
            {church.slug}.{env.rootDomain} &middot; signed in as {user.email}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/services"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Plans
          </Link>
          <Link
            href="/admin/songs"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Songs
          </Link>
          <Link
            href="/admin/series"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Series
          </Link>
          <Link
            href="/admin/media"
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Media
          </Link>
          <Link
            href="/admin/sermons/new"
            className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Add a message
          </Link>
        </div>
      </header>

      {sermons.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-stone-300 p-12 text-center dark:border-stone-700">
          <p className="text-stone-600 dark:text-stone-400">No messages yet.</p>
          <Link
            href="/admin/sermons/new"
            className="inline-block font-medium text-amber-700 underline underline-offset-4 dark:text-amber-500"
          >
            Add the first one
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-100 text-xs tracking-wide text-stone-600 uppercase dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Speaker</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Length</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sermons.map((sermon) => (
                <tr
                  key={sermon.slug}
                  className="border-b border-stone-100 last:border-0 dark:border-stone-800/60"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{sermon.title}</span>
                    {sermon.seriesTitle ? (
                      <span className="block text-xs text-stone-500">{sermon.seriesTitle}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{sermon.speaker}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                    {formatDate(sermon.date)}
                  </td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                    {formatDuration(sermon.durationSeconds)}
                  </td>
                  <td className="px-4 py-3">
                    {sermon.published ? (
                      <span className="text-emerald-700 dark:text-emerald-500">Published</span>
                    ) : (
                      <span className="text-amber-700 dark:text-amber-500">Draft</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/sermons/${sermon.slug}`}
                      className="font-medium text-amber-700 hover:underline dark:text-amber-500"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/sermons/${sermon.slug}`}
                      className="ml-4 text-stone-500 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
