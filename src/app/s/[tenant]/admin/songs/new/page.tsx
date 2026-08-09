import type { Metadata } from "next";
import Link from "next/link";
import SongForm from "@/components/songs/SongForm";
import { requireChurchAccess } from "@/lib/admin/guard";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Add a song" };

export default async function NewSongPage({ params }: PageProps<"/s/[tenant]/admin/songs/new">) {
  const { tenant } = await params;
  await requireChurchAccess(tenant);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link href="/admin/songs" className="text-sm text-stone-500 hover:underline">
          &larr; Songs
        </Link>
        <h1 className="text-3xl font-semibold">Add a song</h1>
        <p className="text-sm text-stone-500">
          Paste the YouTube link to play it, and add an audio file if you want the words
          transcribed automatically.
        </p>
      </div>

      <SongForm tenant={tenant} uploadsEnabled={env.storage.isConfigured} />
    </div>
  );
}
