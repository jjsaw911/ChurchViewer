import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { series } from "@/db/schema";
import SermonForm from "@/components/admin/SermonForm";
import { requireChurchAccess } from "@/lib/admin/guard";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Add a message" };

export default async function NewSermonPage({
  params,
}: PageProps<"/s/[tenant]/admin/sermons/new">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const seriesOptions = await db
    .select({ id: series.id, title: series.title })
    .from(series)
    .where(eq(series.churchId, church.id))
    .orderBy(asc(series.title));

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <Link href="/admin" className="text-sm text-stone-500 hover:underline">
          &larr; Messages
        </Link>
        <h1 className="text-3xl font-semibold">Add a message</h1>
      </div>

      <SermonForm
        tenant={tenant}
        seriesOptions={seriesOptions}
        uploadsEnabled={env.storage.isConfigured}
      />
    </div>
  );
}
