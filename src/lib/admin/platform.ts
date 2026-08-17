import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { isPlatformAdminEmail, rootUrl } from "@/lib/env";

/**
 * Platform administration — the view across every church, as opposed to
 * `requireChurchAccess` in ./guard.ts, which is per-tenant. The two are
 * deliberately separate: a church owner has no standing here, and a platform
 * admin gets no implicit membership of anyone's church.
 */

/** The signed-in platform admin, or null. Never throws — for rendering. */
export async function getPlatformAdmin(): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user || !isPlatformAdminEmail(user.email)) return null;
  return user;
}

/**
 * Gate for the console and for every action behind it.
 *
 * Server actions must call this themselves. An action is a public endpoint: the
 * page that rendered its form proves nothing about who is posting to it, and
 * these actions can take a church off the air.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(rootUrl("/login?next=/admin"));
  // Signed in, but not an admin — the marketing site, not a hint that the
  // console exists.
  if (!isPlatformAdminEmail(user.email)) redirect(rootUrl("/"));
  return user;
}
