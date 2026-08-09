import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { series } from "@/db/schema";
import SermonForm from "@/components/admin/SermonForm";
import { deleteSermonAction } from "@/lib/admin/actions";
import { requireChurchAccess } from "@/lib/admin/guard";
import { getSermonRow } from "@/lib/content";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Edit message" };

export default async function EditSermonPage({
  params,
}: PageProps<"/s/[tenant]/admin/sermons/[slug]">) {
  const { tenant, slug } = await params;
  const { church } = await requireChurchAccess(tenant);

  const sermon = await getSermonRow(church.id, slug);
  if (!sermon) notFound();

  const seriesOptions = await db
    .select({ id: series.id, title: series.title })
    .from(series)
    .where(eq(series.churchId, church.id))
    .orderBy(asc(series.title));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link href="/admin" className="text-sm text-stone-500 hover:underline">
          &larr; Manage
        </Link>
        <h1 className="text-3xl font-semibold">Edit message</h1>
      </div>

      <SermonForm
        tenant={tenant}
        seriesOptions={seriesOptions}
        uploadsEnabled={env.storage.isConfigured}
        sermon={{
          slug: sermon.slug,
          title: sermon.title,
          speaker: sermon.speaker,
          seriesId: sermon.seriesId,
          preachedOn: sermon.preachedOn,
          scripture: sermon.scripture,
          description: sermon.description,
          durationSeconds: sermon.durationSeconds,
          mediaKind: sermon.mediaKind,
          mediaSrc: sermon.mediaSrc,
          posterSrc: sermon.posterSrc,
          captionsSrc: sermon.captionsSrc,
          published: sermon.published,
        }}
      />

      <form
        action={deleteSermonAction}
        className="border-t border-stone-200 pt-6 dark:border-stone-800"
      >
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="slug" value={sermon.slug} />
        <button
          type="submit"
          className="text-sm font-medium text-red-700 hover:underline dark:text-red-400"
        >
          Delete this message
        </button>
        <p className="mt-1 text-xs text-stone-500">
          Uploaded files are removed too. Linked recordings are left alone.
        </p>
      </form>
    </div>
  );
}
