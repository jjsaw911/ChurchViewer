import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";

/**
 * Settings that live in the database rather than in the environment.
 *
 * A secret in `.env.local` needs an SSH session and a restart to change, and
 * the restart is what makes it a deploy. That's the wrong shape for a key the
 * platform administrator holds in a browser, so these are read at the point of
 * use — set one and the next job picks it up, no process anywhere restarted.
 *
 * Everything here is a secret. Read it on the server, use it, and never hand it
 * back out; `describeSecret` is what a browser is allowed to know.
 */

export const OPENAI_API_KEY = "openai.apiKey";

/**
 * The public TestFlight invitation for the iPhone remote.
 *
 * A setting rather than a constant because it changes when a build expires,
 * and asking somebody to deploy the site to update a link is how the link ends
 * up out of date on every church's download page at once.
 */
export const TESTFLIGHT_URL = "ios.testflightUrl";

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return row?.value ?? null;
}

export async function setSetting(
  key: string,
  value: string,
  updatedBy: string | null,
): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedBy })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedBy, updatedAt: new Date() },
    });
}

export async function clearSetting(key: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, key));
}

/**
 * What a browser may be told about a stored secret: that there is one, and just
 * enough of its tail to tell one key from another. Never the key.
 */
export function describeSecret(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `••••${tail}`;
}
