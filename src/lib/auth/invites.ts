import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { churchInvites, churches, memberships } from "@/db/schema";
import { rootUrl } from "@/lib/env";

/**
 * Letting somebody in with a link.
 *
 * Setting a volunteer up used to mean an owner typing their email address,
 * inventing a temporary password, and reading it down a phone — which is why
 * most of them never got an account and ended up borrowing somebody else's. A
 * link can be texted, and the person chooses their own password at the far end.
 *
 * Three things keep it from being a skeleton key. It only ever grants the
 * ordinary role, never ownership. It can be turned off the moment it has done
 * its job. And it stops working on its own after a fortnight, because a link
 * pasted into a group chat stays in that group chat for years.
 */

/** Long enough that guessing is not a strategy. */
const TOKEN_BYTES = 24;
const LIFETIME_DAYS = 14;

export const inviteUrl = (token: string) => rootUrl(`/join/${token}`);

export type ActiveInvite = {
  token: string;
  url: string;
  expiresAt: Date;
  uses: number;
};

/** The church's current link, if it has one that still works. */
export async function activeInvite(churchId: string): Promise<ActiveInvite | null> {
  const [row] = await db
    .select()
    .from(churchInvites)
    .where(
      and(
        eq(churchInvites.churchId, churchId),
        isNull(churchInvites.revokedAt),
        gt(churchInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(churchInvites.createdAt))
    .limit(1);

  if (!row) return null;
  return { token: row.token, url: inviteUrl(row.token), expiresAt: row.expiresAt, uses: row.uses };
}

/**
 * A new link, and the old ones stop working.
 *
 * One live link per church on purpose: two of them means one somebody has
 * forgotten about, and the entire point of being able to revoke it is knowing
 * what you have revoked.
 */
export async function createInvite(churchId: string, createdBy: string): Promise<ActiveInvite> {
  await revokeInvites(churchId);

  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(Date.now() + LIFETIME_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(churchInvites).values({ churchId, token, createdBy, expiresAt });
  return { token, url: inviteUrl(token), expiresAt, uses: 0 };
}

export async function revokeInvites(churchId: string): Promise<void> {
  await db
    .update(churchInvites)
    .set({ revokedAt: new Date() })
    .where(and(eq(churchInvites.churchId, churchId), isNull(churchInvites.revokedAt)));
}

export type InviteTarget = {
  churchId: string;
  churchName: string;
  churchSlug: string;
};

/**
 * The church a link opens, or null if the link is no good.
 *
 * Expired, revoked and never-existed are one answer on purpose. Telling the
 * holder of a wrong token which of those it was tells them whether they are
 * close, and there is nothing they could usefully do with the difference.
 */
export async function resolveInvite(token: string): Promise<InviteTarget | null> {
  if (!token || token.length > 128) return null;

  const [row] = await db
    .select({
      churchId: churches.id,
      churchName: churches.name,
      churchSlug: churches.slug,
    })
    .from(churchInvites)
    .innerJoin(churches, eq(churches.id, churchInvites.churchId))
    .where(
      and(
        eq(churchInvites.token, token),
        isNull(churchInvites.revokedAt),
        gt(churchInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Put the person in the church, and count the link as used.
 *
 * Already a member is not a failure — somebody opening the same text message
 * twice should land in the same place, not on an error. The role they already
 * have is left alone: an owner who follows the link is still an owner
 * afterwards, rather than being quietly demoted by their own invitation.
 */
export async function acceptInvite(token: string, userId: string): Promise<InviteTarget | null> {
  const target = await resolveInvite(token);
  if (!target) return null;

  await db
    .insert(memberships)
    .values({ churchId: target.churchId, userId, role: "editor" })
    .onConflictDoNothing();

  await db
    .update(churchInvites)
    .set({ uses: sql`${churchInvites.uses} + 1` })
    .where(eq(churchInvites.token, token));

  return target;
}
