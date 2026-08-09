"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { churches, memberships } from "@/db/schema";
import { findUserByEmail, isPlausibleEmail, normalizeEmail } from "@/lib/auth/accounts";
import { requirePlatformAdmin } from "@/lib/admin/platform";
import { getAnyChurchBySlug } from "@/lib/churches";
import { slugify, validateSlug } from "@/lib/tenant";

/**
 * Actions behind the platform console. Every one of these re-checks
 * `requirePlatformAdmin()` — a server action is a public endpoint, and the page
 * that rendered the form is no evidence about who is posting to it.
 */
export type PlatformState = {
  error?: string;
  ok?: string;
  /** Which church the message belongs to, so the UI shows it in the right row. */
  scope?: string;
};

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

function fail(error: string, scope?: string): PlatformState {
  return { error, scope };
}

/** The console lists everything; a tenant's own pages change when it moves. */
function refresh(...slugs: string[]) {
  revalidatePath("/admin");
  for (const slug of slugs) revalidatePath(`/s/${slug}`, "layout");
}

/**
 * Validate a proposed address and make sure nobody holds it.
 *
 * `isSlugTaken` counts archived churches on purpose, so this rejects an address
 * that belongs to a church that's merely off the air.
 */
async function checkSlug(raw: string, currentId?: string): Promise<string | PlatformState> {
  const slug = slugify(raw);
  const problem = validateSlug(slug);
  if (problem) return fail(problem);

  const existing = await getAnyChurchBySlug(slug);
  if (existing && existing.id !== currentId) {
    return fail(
      existing.archivedAt
        ? `${slug} belongs to an archived church. Rename that one first to free the address.`
        : `${slug} is already taken.`,
    );
  }
  return slug;
}

export async function createChurchAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const name = value(formData, "name");
  if (!name) return fail("Give the church a name.");

  const checked = await checkSlug(value(formData, "slug") || name);
  if (typeof checked !== "string") return checked;
  const slug = checked;

  // An owner is optional at creation, but a church with no owner has nobody who
  // can sign in and manage it, so the console says so rather than silently
  // creating an orphan.
  const ownerEmail = value(formData, "ownerEmail");
  let ownerId: string | null = null;
  if (ownerEmail) {
    if (!isPlausibleEmail(ownerEmail)) return fail("That owner email doesn't look right.");
    const owner = await findUserByEmail(normalizeEmail(ownerEmail));
    if (!owner) {
      return fail(
        `No account for ${ownerEmail}. They need to sign up first — accounts set their own password.`,
      );
    }
    ownerId = owner.id;
  }

  await db.transaction(async (tx) => {
    const [church] = await tx
      .insert(churches)
      .values({ slug, name, tagline: value(formData, "tagline") })
      .returning({ id: churches.id });
    if (ownerId) {
      await tx
        .insert(memberships)
        .values({ churchId: church.id, userId: ownerId, role: "owner" });
    }
  });

  refresh(slug);
  return {
    ok: ownerId
      ? `Created ${slug}. Add a DNS record for it — see below.`
      : `Created ${slug}, with no owner yet. Nobody can manage it until you add one.`,
    scope: slug,
  };
}

/**
 * Rename a church, its address, or both.
 *
 * Changing the slug moves the site to a new subdomain immediately. Existing
 * media keeps working: every recording stores its own object key
 * (`gcs:churches/<old-slug>/…`) and playback resolves that stored key, so
 * nothing has to be copied. Only new uploads land under the new prefix.
 */
export async function updateChurchAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const id = value(formData, "id");
  const church = id ? (await db.select().from(churches).where(eq(churches.id, id)).limit(1))[0] : null;
  if (!church) return fail("That church no longer exists.");

  const name = value(formData, "name");
  if (!name) return fail("Give the church a name.", church.slug);

  const checked = await checkSlug(value(formData, "slug") || name, church.id);
  if (typeof checked !== "string") return { ...checked, scope: church.slug };
  const slug = checked;

  await db
    .update(churches)
    .set({ slug, name, tagline: value(formData, "tagline") })
    .where(eq(churches.id, church.id));

  refresh(church.slug, slug);
  return {
    ok:
      slug === church.slug
        ? "Saved."
        : `Moved to ${slug}. Add a DNS record and extend the certificate before it will load.`,
    scope: slug,
  };
}

/**
 * Take a church off the air, reversibly.
 *
 * Not a delete: every content table cascades off this row, so a `DELETE` here
 * would take every recording, series, song and run sheet with it and there
 * would be no way back. Archiving hides the church from
 * `getChurchBySlug`, which is the single place every tenant surface reads
 * through, so the subdomain stops serving everywhere at once.
 */
export async function archiveChurchAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const id = value(formData, "id");
  const church = id ? (await db.select().from(churches).where(eq(churches.id, id)).limit(1))[0] : null;
  if (!church) return fail("That church no longer exists.");
  if (church.archivedAt) return { ok: "Already archived.", scope: church.slug };

  // Typing the address is the confirmation. It's the one thing you can't do by
  // reflex on the wrong row.
  if (value(formData, "confirm") !== church.slug) {
    return fail(`Type ${church.slug} to confirm.`, church.slug);
  }

  await db
    .update(churches)
    .set({ archivedAt: new Date() })
    .where(eq(churches.id, church.id));

  refresh(church.slug);
  return {
    ok: `${church.slug} is off the air. Nothing was deleted — restore it any time.`,
    scope: church.slug,
  };
}

export async function restoreChurchAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const id = value(formData, "id");
  const church = id ? (await db.select().from(churches).where(eq(churches.id, id)).limit(1))[0] : null;
  if (!church) return fail("That church no longer exists.");

  await db.update(churches).set({ archivedAt: null }).where(eq(churches.id, church.id));

  refresh(church.slug);
  return { ok: `${church.slug} is live again.`, scope: church.slug };
}

/** Give an existing account owner rights over a church. */
export async function addOwnerAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const id = value(formData, "id");
  const church = id ? (await db.select().from(churches).where(eq(churches.id, id)).limit(1))[0] : null;
  if (!church) return fail("That church no longer exists.");

  const email = value(formData, "email");
  if (!isPlausibleEmail(email)) return fail("That email doesn't look right.", church.slug);

  const user = await findUserByEmail(normalizeEmail(email));
  if (!user) {
    return fail(
      `No account for ${email}. They need to sign up first — accounts set their own password.`,
      church.slug,
    );
  }

  // Already a member? Promote rather than fail on the composite primary key.
  await db
    .insert(memberships)
    .values({ churchId: church.id, userId: user.id, role: "owner" })
    .onConflictDoUpdate({
      target: [memberships.churchId, memberships.userId],
      set: { role: "owner" },
    });

  refresh(church.slug);
  return { ok: `${email} now owns ${church.slug}.`, scope: church.slug };
}

export async function removeOwnerAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const id = value(formData, "id");
  const church = id ? (await db.select().from(churches).where(eq(churches.id, id)).limit(1))[0] : null;
  if (!church) return fail("That church no longer exists.");

  const email = normalizeEmail(value(formData, "email"));
  const user = await findUserByEmail(email);
  if (!user) return fail("No such account.", church.slug);

  await db
    .delete(memberships)
    .where(and(eq(memberships.churchId, church.id), eq(memberships.userId, user.id)));

  refresh(church.slug);
  return { ok: `${email} no longer has access to ${church.slug}.`, scope: church.slug };
}
