import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { GoogleIdentity } from "@/lib/auth/google";
import { hashPassword } from "@/lib/auth/password";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Good enough to catch typos; real validation is whether mail arrives. */
export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function findUserByEmail(email: string) {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPasswordUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email: normalizeEmail(input.email),
      passwordHash: await hashPassword(input.password),
    })
    .returning({ id: users.id });
  return row.id;
}

/**
 * Resolve a Google sign-in to a user id, creating or linking as needed.
 *
 * Linking to an existing password account is gated on Google asserting the
 * address is verified — otherwise anyone who could get an unverified token for
 * someone else's address would inherit their account.
 */
export async function upsertGoogleUser(identity: GoogleIdentity): Promise<string> {
  const bySub = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.googleSub, identity.sub))
    .limit(1);
  if (bySub[0]) return bySub[0].id;

  const byEmail = await findUserByEmail(identity.email);
  if (byEmail) {
    if (!identity.emailVerified) {
      throw new Error(
        "That email already has an account. Sign in with your password, or verify the address with Google first.",
      );
    }
    await db
      .update(users)
      .set({ googleSub: identity.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() })
      .where(eq(users.id, byEmail.id));
    return byEmail.id;
  }

  const [row] = await db
    .insert(users)
    .values({
      name: identity.name,
      email: identity.email,
      googleSub: identity.sub,
      emailVerifiedAt: identity.emailVerified ? new Date() : null,
    })
    .returning({ id: users.id });
  return row.id;
}
