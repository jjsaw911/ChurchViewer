"use server";

import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { churches, memberships } from "@/db/schema";
import {
  createPasswordUser,
  findUserByEmail,
  isPlausibleEmail,
  normalizeEmail,
} from "@/lib/auth/accounts";
import { checkPasswordStrength, verifyPassword } from "@/lib/auth/password";
import { completeReset, resolveResetToken } from "@/lib/auth/reset";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { tenantUrl } from "@/lib/env";
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
 * Only ever redirect to a path on this host. `//evil.com` is a protocol-relative
 * URL, so checking for a leading slash alone isn't enough.
 */
function safeNext(next: string, fallback: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
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

export async function signOutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}
