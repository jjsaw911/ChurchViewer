import type { Metadata } from "next";
import Link from "next/link";
import ServiceForm from "@/components/services/ServiceForm";
import { requireChurchAccess } from "@/lib/admin/guard";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Plan a service" };

export default async function NewServicePage({
  params,
}: PageProps<"/s/[tenant]/admin/services/new">) {
  const { tenant } = await params;
  await requireChurchAccess(tenant);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-2">
        <Link href="/admin/services" className="text-sm text-stone-500 hover:underline">
          &larr; Services
        </Link>
        <h1 className="text-3xl font-semibold">Plan a service</h1>
        <p className="text-sm text-stone-500">
          Name it and set the date, then build the running order.
        </p>
      </div>

      <ServiceForm tenant={tenant} uploadsEnabled={env.storage.isConfigured} />
    </div>
  );
}
