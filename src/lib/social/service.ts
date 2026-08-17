import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { socialAccounts, socialPosts } from "@/db/schema";
import { playbackUrl } from "@/lib/storage";
import { postToInstagram, postToPage, type Destination } from "@/lib/social/meta";

/**
 * Posting on a church's behalf, and remembering that it happened.
 *
 * Everything here runs on the server and nothing hands a token to a browser: a
 * page token is the whole of the permission, and the composer only ever names
 * the row it wants posted from.
 */

export type ConnectedAccount = {
  id: string;
  platform: "facebook" | "instagram";
  name: string;
  brokenReason: string | null;
};

export async function connectedAccounts(churchId: string): Promise<ConnectedAccount[]> {
  const rows = await db
    .select({
      id: socialAccounts.id,
      platform: socialAccounts.platform,
      name: socialAccounts.name,
      brokenReason: socialAccounts.brokenReason,
    })
    .from(socialAccounts)
    .where(eq(socialAccounts.churchId, churchId))
    .orderBy(socialAccounts.platform, socialAccounts.name);

  return rows;
}

/** Store what was chosen, replacing whatever was there for the same page. */
export async function saveDestinations(
  churchId: string,
  userId: string,
  destinations: Destination[],
): Promise<void> {
  for (const destination of destinations) {
    await db
      .insert(socialAccounts)
      .values({
        churchId,
        platform: destination.platform,
        externalId: destination.externalId,
        name: destination.name,
        accessToken: destination.accessToken,
        connectedBy: userId,
      })
      .onConflictDoUpdate({
        target: [socialAccounts.churchId, socialAccounts.platform, socialAccounts.externalId],
        set: {
          name: destination.name,
          accessToken: destination.accessToken,
          connectedBy: userId,
          connectedAt: new Date(),
          // Reconnecting is how somebody fixes a refusal, so the mark of one
          // has to come off.
          brokenAt: null,
          brokenReason: null,
        },
      });
  }
}

export async function disconnectAccount(churchId: string, accountId: string): Promise<void> {
  await db
    .delete(socialAccounts)
    .where(and(eq(socialAccounts.churchId, churchId), eq(socialAccounts.id, accountId)));
}

export type PostOutcome = {
  accountName: string;
  ok: boolean;
  error?: string;
};

/**
 * Send one message to the chosen places, one at a time.
 *
 * Not in parallel, deliberately: four failures arriving at once are hard to
 * read, and the whole thing takes a couple of seconds either way. Each
 * destination succeeds or fails on its own — one page refusing must not stop
 * the others, because the person pressing this wants the announcement out.
 */
export async function publish(input: {
  churchId: string;
  userId: string;
  accountIds: string[];
  message: string;
  mediaSrc: string | null;
  linkUrl: string | null;
}): Promise<PostOutcome[]> {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.churchId, input.churchId));

  const chosen = rows.filter((row) => input.accountIds.includes(row.id));
  if (chosen.length === 0) return [];

  // Signed at the moment of posting, because Instagram fetches the picture
  // itself and a URL signed an hour ago may be no good by the time it does.
  const imageUrl = await playbackUrl(input.mediaSrc);

  const outcomes: PostOutcome[] = [];

  for (const account of chosen) {
    const result =
      account.platform === "instagram"
        ? await postToInstagram(account.externalId, account.accessToken, {
            message: input.message,
            imageUrl,
          })
        : await postToPage(account.externalId, account.accessToken, {
            message: input.message,
            imageUrl,
            linkUrl: input.linkUrl,
          });

    await db.insert(socialPosts).values({
      churchId: input.churchId,
      accountId: account.id,
      platform: account.platform,
      accountName: account.name,
      message: input.message,
      mediaSrc: input.mediaSrc,
      linkUrl: input.linkUrl,
      status: result.ok ? "posted" : "failed",
      externalId: result.ok ? result.externalId : null,
      error: result.ok ? null : result.error,
      postedBy: input.userId,
    });

    if (!result.ok) {
      // Remembered on the account as well as the attempt: a token somebody
      // revoked will refuse every time, and the connect screen should say so
      // before the next person tries.
      await db
        .update(socialAccounts)
        .set({ brokenAt: new Date(), brokenReason: result.error })
        .where(eq(socialAccounts.id, account.id));
    } else if (account.brokenAt) {
      await db
        .update(socialAccounts)
        .set({ brokenAt: null, brokenReason: null })
        .where(eq(socialAccounts.id, account.id));
    }

    outcomes.push({
      accountName: account.name,
      ok: result.ok,
      error: result.ok ? undefined : result.error,
    });
  }

  return outcomes;
}

/** What has gone out, newest first. */
export async function recentPosts(churchId: string, limit = 20) {
  return db
    .select({
      id: socialPosts.id,
      platform: socialPosts.platform,
      accountName: socialPosts.accountName,
      message: socialPosts.message,
      status: socialPosts.status,
      error: socialPosts.error,
      createdAt: socialPosts.createdAt,
    })
    .from(socialPosts)
    .where(eq(socialPosts.churchId, churchId))
    .orderBy(desc(socialPosts.createdAt))
    .limit(limit);
}
