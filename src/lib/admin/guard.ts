import { notFound, redirect } from "next/navigation";
import { getMembershipRole, getSessionUser } from "@/lib/auth/session";
import { rootUrl } from "@/lib/env";
import { getChurchBySlug } from "@/lib/churches";

type Access = {
  church: NonNullable<Awaited<ReturnType<typeof getChurchBySlug>>>;
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
  role: "owner" | "editor";
};

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

  const role = await getMembershipRole(user.id, church.id);
  // Signed in, but not for this church — send them to their own list.
  if (!role) redirect(rootUrl("/register"));

  return { church, user, role };
}
