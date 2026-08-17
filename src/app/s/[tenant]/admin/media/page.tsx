import type { Metadata } from "next";
import MediaLibrary from "@/components/media/MediaLibrary";
import { requireChurchAccess } from "@/lib/admin/guard";
import { libraryTotals } from "@/lib/media/service";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Media" };

/** `690.4 MB`, or `1.2 GB` once it's worth talking in gigabytes. */
function gigabytes(bytes: number): string {
  const mb = bytes / 1024 ** 2;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

export default async function MediaPage({ params }: PageProps<"/s/[tenant]/admin/media">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);
  const totals = await libraryTotals(church.id);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">Media</h1>
        <p className="text-sm text-stone-500">
          Everything the church has uploaded. Anywhere a file is asked for, it can be taken from
          here instead of uploaded again.
        </p>
        {totals.files > 0 ? (
          <p className="text-sm text-stone-500">
            {totals.files} {totals.files === 1 ? "file" : "files"} &middot; {gigabytes(totals.bytes)}
            {totals.videoBytes > 0 ? (
              <>
                {" "}
                &middot;{" "}
                <span title="Video is what fills a library. The audio pulled out of it is a fraction of the size.">
                  {Math.round((totals.videoBytes / Math.max(1, totals.bytes)) * 100)}% of that is
                  video
                </span>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <MediaLibrary tenant={tenant} uploadsEnabled={env.storage.isConfigured} />
    </div>
  );
}
