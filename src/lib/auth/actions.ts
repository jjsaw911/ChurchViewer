"use server";

import { eq } from "drizzle-orm";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { churches, memberships, users } from "@/db/schema";
import {
  createPasswordUser,
  findUserByEmail,
  isPlausibleEmail,
  normalizeEmail,
} from "@/lib/auth/accounts";
import { checkPasswordStrength, hashPassword, verifyPassword } from "@/lib/auth/password";
import { completeReset, createResetToken, resolveResetToken } from "@/lib/auth/reset";
import { sendMail } from "@/lib/mail/send";
import { acceptInvite, resolveInvite } from "@/lib/auth/invites";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { env, rootUrl, tenantUrl } from "@/lib/env";
import { slugify, validateSlug } from "@/lib/tenant";
import { isSlugTaken } from "@/lib/churches";

/**
 * `values` echoes the submitted fields back to the form. React resets an
 * uncontrolled form once its action resolves, so without this a validation
 * error would wipe everything the user typed. Passwords are never echoed.
 */
export type FormState = {
  error?: string;
  field?: string;
  values?: Record<string, string>;
};

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Only ever redirect somewhere that is us.
 *
 * A path on this host, or an address at a church of ours — logging in happens
 * on the main site and the person was almost always on their church's own
 * address when they were stopped, so sending them back means crossing hosts.
 * `//evil.com` is a protocol-relative URL, so a leading slash alone isn't
 * enough, and anything that isn't plainly ours is dropped for the fallback.
 */
function safeNext(next: string, fallback: string): string {
  if (next.startsWith("/") && !next.startsWith("//")) return next;

  try {
    const url = new URL(next);
    const root = env.rootDomain.split(":")[0].toLowerCase();
    const host = url.hostname.toLowerCase();

    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    if (host !== root && !host.endsWith(`.${root}`)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

/**
 * Creates the church, and the account too when nobody is signed in yet. The
 * person who registers becomes its owner.
 */
export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const churchName = value(formData, "churchName");
  const typed = {
    churchName,
    slug: value(formData, "slug"),
    tagline: value(formData, "tagline"),
    name: value(formData, "name"),
    email: value(formData, "email"),
  };
  const fail = (error: string, field: string): FormState => ({ error, field, values: typed });

  if (!churchName) return fail("What's the church called?", "churchName");

  const slug = slugify(value(formData, "slug") || churchName);
  const slugProblem = validateSlug(slug);
  if (slugProblem) return fail(slugProblem, "slug");
  if (await isSlugTaken(slug)) return fail("That address is already taken.", "slug");

  let user = await getSessionUser();

  if (!user) {
    const name = value(formData, "name");
    const email = normalizeEmail(value(formData, "email"));
    const password = String(formData.get("password") ?? "");

    if (!name) return fail("Add your name.", "name");
    if (!isPlausibleEmail(email)) return fail("Check that email address.", "email");

    const weak = checkPasswordStrength(password);
    if (weak) return fail(weak, "password");

    if (await findUserByEmail(email)) {
      return fail("An account with that email already exists — log in instead.", "email");
    }

    const userId = await createPasswordUser({ name, email, password });
    await createSession(userId);
    user = { id: userId, email, name };
  }

  const owner = user;
  await db.transaction(async (tx) => {
    const [church] = await tx
      .insert(churches)
      .values({ slug, name: churchName, tagline: value(formData, "tagline") })
      .returning({ id: churches.id });
    await tx
      .insert(memberships)
      .values({ churchId: church.id, userId: owner.id, role: "owner" });
  });

  // Outside the try/transaction — redirect() signals by throwing.
  redirect(tenantUrl(slug, "/admin"));
}

/**
 * Somebody letting themselves in with a link they were sent.
 *
 * Email and a password, and nothing else asked for. The person doing this is a
 * volunteer standing in a car park with a text message open, and every extra
 * box is a person who does it later and then doesn't.
 *
 * Their name is taken from the address rather than demanded — "joe.smith"
 * becomes "Joe Smith" — because a list of people is worth reading and nobody
 * has ever enjoyed being asked to type their own name.
 */
export async function joinChurchAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = value(formData, "token");
  const email = normalizeEmail(value(formData, "email"));
  const password = String(formData.get("password") ?? "");

  const target = await resolveInvite(token);
  if (!target) {
    return { error: "That link has expired. Ask whoever sent it for a new one." };
  }

  if (!isPlausibleEmail(email)) return { error: "Check that email address.", field: "email" };

  const existing = await findUserByEmail(email);

  // An address that already has an account is nearly always the same person,
  // invited again or joining a second church. Sending them to sign in adds
  // their membership on the way back, rather than telling them their own email
  // is taken.
  if (existing) {
    redirect(
      `${rootUrl("/login")}?next=${encodeURIComponent(rootUrl(`/join/${token}`))}` +
        `&error=${encodeURIComponent("You already have an account — sign in and you'll be let straight in.")}`,
    );
  }

  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak, field: "password" };

  const userId = await createPasswordUser({ name: nameFromEmail(email), email, password });
  await acceptInvite(token, userId);
  await createSession(userId);

  redirect(tenantUrl(target.churchSlug, "/present/today"));
}

/** `joe.smith@x.org` -> `Joe Smith`. Wrong sometimes; never blank. */
function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return words.join(" ") || email;
}

export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const email = normalizeEmail(value(formData, "email"));
  const password = String(formData.get("password") ?? "");
  const next = value(formData, "next");

  const user = await findUserByEmail(email);
  // Same message either way, so this can't be used to enumerate accounts.
  const invalid: FormState = {
    error: "That email and password don't match.",
    field: "email",
    values: { email },
  };

  if (!user?.passwordHash) return invalid;
  if (!(await verifyPassword(password, user.passwordHash))) return invalid;

  await createSession(user.id);
  redirect(safeNext(next, "/register"));
}

/**
 * Ask for a way back in.
 *
 * The answer is the same whether or not that address has an account. Telling
 * somebody "no account with that email" is telling anybody who asks which of a
 * church's addresses are real, and the person who genuinely mistyped their own
 * address is helped just as well by being told to check their inbox and try
 * again.
 *
 * The token is short-lived and single use; that part already existed, because
 * administrators have been making these links by hand.
 */
export async function requestPasswordResetAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = normalizeEmail(value(formData, "email"));
  const said = {
    values: {
      sent: "If that address has an account, a link is on its way. It lasts an hour.",
    },
  };

  if (!isPlausibleEmail(email)) return { error: "Check that email address.", field: "email" };

  const user = await findUserByEmail(email);
  if (!user) return said;

  const token = await createResetToken(user.id, user.id);
  const sent = await sendMail({
    to: email,
    subject: "Choosing a new ChurchViewer password",
    text: [
      "Somebody asked for a new password for this address.",
      "",
      "Open this to choose one:",
      rootUrl(`/reset/${token}`),
      "",
      "The link works once and stops working after an hour.",
      "If this wasn't you, nothing has changed — ignore this and your password stays as it is.",
    ].join("\n"),
  });

  // Not said out loud either way: whether the mail left is not the asker's
  // business, and the failure is ours to find in the log.
  if (!sent.ok) console.error(`[mail] reset for ${email}: ${sent.error}`);

  return said;
}

/**
 * Set a new password from a one-time link. No session is required — being
 * locked out is the whole reason someone is here.
 */
export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = value(formData, "token");
  const password = String(formData.get("password") ?? "");

  const problem = checkPasswordStrength(password);
  if (problem) return { error: problem, field: "password" };
  if (password !== String(formData.get("confirm") ?? "")) {
    return { error: "Those don't match.", field: "confirm" };
  }

  const target = await resolveResetToken(token);
  if (!target) {
    return {
      error: "That link has expired or already been used. Ask for a new one.",
      field: "password",
    };
  }

  if (!(await completeReset(token, password))) {
    return { error: "That link is no longer valid.", field: "password" };
  }

  // Deliberately not signed in here. They've proved they hold the link, not
  // that they are the person — signing in is the next step, with the password
  // they just chose.
  redirect("/login");
}

/**
 * Choose your own password while signed in.
 *
 * The current one is required unless somebody else set it. A person handed a
 * temporary password across a table may not remember it two minutes later, and
 * asking them to type it back proves nothing the session cookie hasn't already
 * proved — where refusing them would leave them locked out of an account that
 * was just made for them.
 */
export async function changeOwnPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect(rootUrl("/login"));

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) return { error: "Those two don't match.", field: "confirm" };

  const weak = checkPasswordStrength(password);
  if (weak) return { error: weak, field: "password" };

  const [row] = await db
    .select({ passwordHash: users.passwordHash, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (!row?.mustChangePassword) {
    const current = String(formData.get("current") ?? "");
    if (!row?.passwordHash || !(await verifyPassword(current, row.passwordHash))) {
      return { error: "That isn't your current password.", field: "current" };
    }
  }

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), mustChangePassword: false })
    .where(eq(users.id, user.id));

  redirect(safeNext(value(formData, "next"), "/register"));
}

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
