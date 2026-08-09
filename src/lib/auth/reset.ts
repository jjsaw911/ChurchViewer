import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { passwordResets, sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";

/**
 * Password recovery by one-time link.
 *
 * There's no mail server, so nothing is emailed: a platform admin generates a
 * link and passes it to the person however they already talk to them. That
 * keeps the admin out of the credential itself — they hand over a way to set a
 * password, never a password.
 */

/** Long enough that guessing is hopeless; the same shape as a session token. */
const TOKEN_BYTES = 32;
const LIFETIME_MS = 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Mint a link for this user and return the raw token — stored only as a hash. */
export async function createResetToken(userId: string, issuedBy: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  // One live link per person: issuing a new one retires whatever came before,
  // so a link handed out last week can't be used after a fresh one is sent.
  await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));

  await db.insert(passwordResets).values({
    tokenHash: hashToken(token),
    userId,
    issuedBy,
    expiresAt: new Date(Date.now() + LIFETIME_MS),
  });

  return token;
}

/** The account this token is for, or null if it's spent, expired, or unknown. */
export async function resolveResetToken(token: string) {
  if (!token) return null;

  const rows = await db
    .select({ userId: passwordResets.userId, email: users.email, name: users.name })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(
      and(
        eq(passwordResets.tokenHash, hashToken(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Set the new password and spend the token.
 *
 * Every existing session for that account is dropped at the same time. If the
 * reason for the reset was that somebody else had got in, leaving their session
 * alive would make the whole exercise pointless.
 */
export async function completeReset(token: string, password: string): Promise<boolean> {
  const target = await resolveResetToken(token);
  if (!target) return false;

  const passwordHash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, target.userId));
    await tx
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.tokenHash, hashToken(token)));
    await tx.delete(sessions).where(eq(sessions.userId, target.userId));
  });

  return true;
}

/** Sign someone out everywhere. Used on its own when an account looks stolen. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
