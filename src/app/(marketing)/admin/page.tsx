import type { Metadata } from "next";
import PlatformConsole from "@/components/admin/PlatformConsole";
import { requirePlatformAdmin } from "@/lib/admin/platform";
import { listChurches, platformStats } from "@/lib/churches";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Platform admin" };

/**
 * The console lives on the apex, not a subdomain: `src/proxy.ts` only rewrites
 * when the Host carries a tenant label, so `/admin` here never collides with a
 * church's own `/s/<tenant>/admin`. It also means no extra DNS record and no
 * extra name on the certificate.
 */
export default async function PlatformAdminPage() {
  const admin = await requirePlatformAdmin();
  const [churches, stats] = await Promise.all([listChurches(), platformStats()]);

  return (
    <PlatformConsole
      churches={churches.map((church) => ({
        ...church,
        archivedAt: church.archivedAt ? church.archivedAt.toISOString() : null,
        createdAt: church.createdAt.toISOString(),
      }))}
      stats={stats}
      rootDomain={env.rootDomain}
      adminEmail={admin.email}
    />
  );
}
