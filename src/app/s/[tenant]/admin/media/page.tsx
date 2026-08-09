import type { Metadata } from "next";
import Link from "next/link";
import MediaLibrary from "@/components/media/MediaLibrary";
import { requireChurchAccess } from "@/lib/admin/guard";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Media" };

export default async function MediaPage({ params }: PageProps<"/s/[tenant]/admin/media">) {
  const { tenant } = await params;
  await requireChurchAccess(tenant);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Link href="/admin" className="text-sm text-stone-500 hover:underline">
          &larr; Manage
        </Link>
        <h1 className="text-3xl font-semibold">Media</h1>
        <p className="text-sm text-stone-500">
          Everything the church has uploaded. Anywhere a file is asked for, it can be taken from
          here instead of uploaded again.
        </p>
      </div>

      <MediaLibrary tenant={tenant} uploadsEnabled={env.storage.isConfigured} />
    </div>
  );
}
