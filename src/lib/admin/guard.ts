import { notFound, redirect } from "next/navigation";
import { getMembershipRole, getSessionUser, type SessionUser } from "@/lib/auth/session";
import { isPlatformAdminEmail, rootUrl } from "@/lib/env";
import { getChurchBySlug } from "@/lib/churches";

type Access = {
  church: NonNullable<Awaited<ReturnType<typeof getChurchBySlug>>>;
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
  role: "owner" | "editor";
  /**
   * True when the only reason this person is allowed in is that they administer
   * the platform — they are not a member of this church. Worth surfacing: it's
   * the difference between the church's own staff and someone from outside it
   * standing in their admin.
   */
  viaPlatform: boolean;
};

/**
 * What this person may do in this church, or null if the answer is nothing.
 *
 * Membership comes first, so a platform admin who is genuinely on staff at a
 * church keeps their real role. Failing that, administering the platform grants
 * owner-level access to every church — that's what makes overrides possible:
 * resetting a stuck account, fixing a broken series, or checking that a church
 * is actually being used, without anyone having to add you as a member and
 * without you being able to hide that you were there.
 */
export async function resolveAccess(
  user: SessionUser,
  churchId: string,
): Promise<{ role: "owner" | "editor"; viaPlatform: boolean } | null> {
  const membership = await getMembershipRole(user.id, churchId);
  if (membership) return { role: membership, viaPlatform: false };
  if (isPlatformAdminEmail(user.email)) return { role: "owner", viaPlatform: true };
  return null;
}

/**
 * Gate for everything under `/admin`. Server actions must call this too — an
 * action is a public endpoint, and the page that rendered its form proves
 * nothing about who is submitting it.
 */
export async function requireChurchAccess(tenant: string): Promise<Access> {
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const user = await getSessionUser();
  if (!user) redirect(rootUrl("/login"));

  // Somebody else's password is still on this account. Nothing else opens
  // until they've chosen their own — otherwise "temporary" is whatever the
  // person who set it decides it is.
  if (user.mustChangePassword) redirect(rootUrl("/password"));

  const access = await resolveAccess(user, church.id);
  // Signed in, but not for this church — send them to their own list.
  if (!access) redirect(rootUrl("/register"));

  return { church, user, ...access };
}
