"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { createInvite, revokeInvites } from "@/lib/auth/invites";
import { findUserByEmail, isPlausibleEmail, normalizeEmail } from "@/lib/auth/accounts";
import { checkPasswordStrength, hashPassword } from "@/lib/auth/password";
import { revokeAllSessions } from "@/lib/auth/reset";

/**
 * Setting somebody up with access to one church.
 *
 * The platform console can already do this for any church; this is the same
 * job in the hands of the people who actually know who's joining — a church
 * owner adding the person who runs the projector, without going through
 * whoever administers the server.
 *
 * The password is chosen here and typed out to the new person, which is how a
 * church actually works: somebody is handed a login across a table on a Sunday.
 * It is temporary by construction — `mustChangePassword` is set, and until they
 * pick their own, the only page the account can reach is the one that changes
 * it. Nobody keeps a password somebody else knows.
 */
export type PeopleState = { error?: string; ok?: string };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/** Only an owner decides who else gets in. Editors run the church's content. */
async function requireOwner(tenant: string) {
  const access = await requireChurchAccess(tenant);
  if (access.role !== "owner") {
    return { access, denied: "Only an owner can add or remove people." as const };
  }
  return { access, denied: null };
}

/**
 * Make a link that lets somebody set themselves up.
 *
 * Handing out a temporary password works, and it is also the reason half a
 * church's volunteers never get an account: it needs the owner and the new
 * person in the same room, or a password read down a phone. A link can be
 * texted from a car park.
 *
 * One live link per church. Two means one that somebody has forgotten about,
 * and the whole point of being able to turn it off is knowing what you turned
 * off.
 */
export async function createInviteLinkAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const tenant = value(formData, "tenant");
  const { access, denied } = await requireOwner(tenant);
  if (denied) return { error: denied };

  await createInvite(access.church.id, access.user.id);
  revalidatePath(`/s/${tenant}/admin/people`);
  return { ok: "Link ready. Anyone who opens it can set themselves up." };
}

/** Turn the link off. Everyone already let in stays in. */
export async function revokeInviteLinkAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const tenant = value(formData, "tenant");
  const { access, denied } = await requireOwner(tenant);
  if (denied) return { error: denied };

  await revokeInvites(access.church.id);
  revalidatePath(`/s/${tenant}/admin/people`);
  return { ok: "That link stops working now. Nobody already in is affected." };
}

export async function addPersonAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const tenant = value(formData, "tenant");
  const { access, denied } = await requireOwner(tenant);
  if (denied) return { error: denied };

  const name = value(formData, "name");
  const email = normalizeEmail(value(formData, "email"));
  const password = String(formData.get("password") ?? "");
  const role = value(formData, "role") === "owner" ? "owner" : "editor";

  if (!name) return { error: "Give them a name — it's what the team will see." };
  if (!isPlausibleEmail(email)) return { error: "That doesn't look like an email address." };

  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };

  const existing = await findUserByEmail(email);

  if (existing) {
    // Somebody who already has an account — they help at two churches, or they
    // registered themselves. Add them to this church; never touch their
    // password, because this church's owner has no business setting it.
    const [alreadyHere] = await db
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(
        and(eq(memberships.churchId, access.church.id), eq(memberships.userId, existing.id)),
      )
      .limit(1);

    if (alreadyHere) return { error: `${email} is already on this church.` };

    await db.insert(memberships).values({
      churchId: access.church.id,
      userId: existing.id,
      role,
    });

    revalidatePath(`/s/${tenant}`, "layout");
    return {
      ok: `${email} already had an account, so they've been added with their own password.`,
    };
  }

  const [created] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    })
    .returning({ id: users.id });

  await db.insert(memberships).values({
    churchId: access.church.id,
    userId: created.id,
    role,
  });

  revalidatePath(`/s/${tenant}`, "layout");
  return {
    ok: `${email} can sign in now with the password you set. They'll be made to change it.`,
  };
}

/**
 * Give somebody a new temporary password — the "I've forgotten it" path, done
 * across a table rather than by email.
 *
 * Every session they have is ended at the same time. If the reason for the
 * reset is that somebody else got in, leaving their sessions alive would make
 * the reset pointless.
 */
export async function resetPersonPasswordAction(
  _previous: PeopleState,
  formData: FormData,
): Promise<PeopleState> {
  const tenant = value(formData, "tenant");
  const { access, denied } = await requireOwner(tenant);
  if (denied) return { error: denied };

  const userId = value(formData, "userId");
  const password = String(formData.get("password") ?? "");

  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak };

  // Only somebody on this church, so an owner can't reset a stranger's account
  // by pasting an id.
  const [member] = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.churchId, access.church.id), eq(memberships.userId, userId)))
    .limit(1);

  if (!member) return { error: "That person isn't on this church." };

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: true })
    .where(eq(users.id, userId));
  await revokeAllSessions(userId);

  revalidatePath(`/s/${tenant}`, "layout");
  return { ok: `${member.email} has been given the new password and signed out everywhere.` };
}

/** Take somebody off this church. Their account and any other church survive. */
export async function removePersonAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { access, denied } = await requireOwner(tenant);
  if (denied) return;

  const userId = value(formData, "userId");
  // An owner removing themselves would leave a church nobody can administer.
  if (userId === access.user.id) return;

  await db
    .delete(memberships)
    .where(and(eq(memberships.churchId, access.church.id), eq(memberships.userId, userId)));

  revalidatePath(`/s/${tenant}`, "layout");
}
