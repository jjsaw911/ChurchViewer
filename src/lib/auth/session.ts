import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, sessions, users } from "@/db/schema";
import { env, usesHttps } from "@/lib/env";

export const SESSION_COOKIE = "cv_session";
const SESSION_DAYS = 30;

/** The cookie holds the raw token; the database only ever sees its hash. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function cookieDomain(): string | undefined {
  const host = env.rootDomain.split(":")[0];
  return host.includes(".") ? `.${host}` : undefined;
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type CookieSpec = {
  name: string;
  value: string;
  options: {
    httpOnly: true;
    sameSite: "lax";
    secure: boolean;
    path: string;
    expires: Date;
    domain?: string;
  };
};

/**
 * Create the session row and return the cookie to set. Route handlers that
 * return their own `NextResponse` must set it there — cookies written through
 * `cookies()` don't reliably survive a hand-built response.
 */
export async function issueSession(userId: string): Promise<CookieSpec> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt });

  return {
    name: SESSION_COOKIE,
    value: token,
    options: {
      httpOnly: true,
      sameSite: "lax",
      // Tied to the scheme we actually serve: a Secure cookie is silently
      // dropped over plain http, which would sign everyone straight back out.
      secure: usesHttps(),
      path: "/",
      expires: expiresAt,
      // Shared across every tenant subdomain, so one login covers them all.
      // Single-label hosts (plain `localhost`) can't carry a Domain attribute
      // at all — browsers drop the cookie — so leave it host-only there.
      domain: cookieDomain(),
    },
  };
}

/** For server actions, where `cookies()` is writable. */
export async function createSession(userId: string): Promise<void> {
  const cookie = await issueSession(userId);
  (await cookies()).set(cookie.name, cookie.value, cookie.options);
}

/** Delete the current session row. Returns the cookie name to clear. */
export async function revokeCurrentSession(): Promise<string> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  return SESSION_COOKIE;
}

export async function destroySession(): Promise<void> {
  await revokeCurrentSession();
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Expired rows are treated as absent. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return rows[0] ?? null;
}

/** The user's role at one church, or null if they aren't a member. */
export async function getMembershipRole(
  userId: string,
  churchId: string,
): Promise<"owner" | "editor" | null> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.churchId, churchId)))
    .limit(1);

  return rows[0]?.role ?? null;
}
