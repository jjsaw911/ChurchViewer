import type { Metadata } from "next";
import MailForm from "@/components/admin/MailForm";
import MetaAppForm from "@/components/admin/MetaAppForm";
import TestFlightForm from "@/components/admin/TestFlightForm";
import OpenAiKeyForm from "@/components/admin/OpenAiKeyForm";
import PlatformConsole from "@/components/admin/PlatformConsole";
import { requirePlatformAdmin } from "@/lib/admin/platform";
import { listChurches, listPeople, platformStats } from "@/lib/churches";
import { env } from "@/lib/env";
import { describeSecret, getSetting, OPENAI_API_KEY } from "@/lib/settings";
import { META_APP_ID, META_APP_SECRET } from "@/lib/social/meta";
import { TESTFLIGHT_URL } from "@/lib/settings";
import { MAIL_API_KEY, MAIL_FROM, MAIL_REPLY_TO } from "@/lib/mail/send";
import { rootUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Platform admin" };

/**
 * The console lives on the apex, not a subdomain: `src/proxy.ts` only rewrites
 * when the Host carries a tenant label, so `/admin` here never collides with a
 * church's own `/s/<tenant>/admin`. It also means no extra DNS record and no
 * extra name on the certificate.
 */
export default async function PlatformAdminPage() {
  const admin = await requirePlatformAdmin();
  const [churches, people, stats, storedKey] = await Promise.all([
    listChurches(),
    listPeople(),
    platformStats(),
    getSetting(OPENAI_API_KEY),
  ]);

  const [metaAppId, metaSecret, testFlight] = await Promise.all([
    getSetting(META_APP_ID),
    getSetting(META_APP_SECRET),
    getSetting(TESTFLIGHT_URL),
  ]);

  const [mailFrom, mailKey, mailReplyTo] = await Promise.all([
    getSetting(MAIL_FROM),
    getSetting(MAIL_API_KEY),
    getSetting(MAIL_REPLY_TO),
  ]);

  return (
    <div className="space-y-10">
      <OpenAiKeyForm
        hint={describeSecret(storedKey)}
        fromEnvironment={Boolean(process.env.OPENAI_API_KEY)}
      />

      <MailForm from={mailFrom} replyTo={mailReplyTo} hasKey={Boolean(mailKey)} />

      <TestFlightForm url={testFlight} />

      <MetaAppForm
        appId={metaAppId}
        hasSecret={Boolean(metaSecret)}
        redirectUri={rootUrl("/api/social/callback")}
      />

      <PlatformConsole
        churches={churches.map((church) => ({
          ...church,
          archivedAt: church.archivedAt ? church.archivedAt.toISOString() : null,
          createdAt: church.createdAt.toISOString(),
          lastActivityAt: church.lastActivityAt
            ? new Date(church.lastActivityAt).toISOString()
            : null,
        }))}
        people={people.map((person) => ({
          ...person,
          createdAt: person.createdAt.toISOString(),
          lastSeenAt: person.lastSeenAt ? new Date(person.lastSeenAt).toISOString() : null,
        }))}
        stats={stats}
        rootDomain={env.rootDomain}
        adminEmail={admin.email}
      />
    </div>
  );
}
