"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { churches, memberships, users } from "@/db/schema";
import { findUserByEmail, isPlausibleEmail, normalizeEmail } from "@/lib/auth/accounts";
import { createResetToken, revokeAllSessions } from "@/lib/auth/reset";
import { requirePlatformAdmin } from "@/lib/admin/platform";
import { getAnyChurchBySlug } from "@/lib/churches";
import { rootUrl } from "@/lib/env";
import { clearSetting, OPENAI_API_KEY, setSetting, TESTFLIGHT_URL } from "@/lib/settings";
import { META_APP_ID, META_APP_SECRET } from "@/lib/social/meta";
import { MAIL_API_KEY, MAIL_FROM, sendMail } from "@/lib/mail/send";
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

/**
 * Store the OpenAI key the platform pays for.
 *
 * Kept out of the environment on purpose: the person holding this key is
 * holding it in a browser, and making them open an SSH session and restart two
 * services to change it is how a key ends up not being rotated. It goes in the
 * database, is read at the point of use, and is never sent back to a browser —
 * the console only ever shows the last four characters.
 */
export async function saveOpenAiKeyAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const admin = await requirePlatformAdmin();

  const key = value(formData, "apiKey");
  if (!key) return fail("Paste the key first.", "openai");

  // Not validation so much as a typo check: a key that isn't a key fails later,
  // in a worker log nobody is watching.
  if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) {
    return fail("That doesn't look like an OpenAI key — they start with sk-.", "openai");
  }

  await setSetting(OPENAI_API_KEY, key, admin.id);

  revalidatePath("/admin");
  return { ok: "Key saved. Transcription is on from the next job.", scope: "openai" };
}

/**
 * The Facebook app the whole site posts through.
 *
 * One app for ChurchViewer rather than one per church: Meta registers a single
 * redirect address, and a church per subdomain would mean registering every
 * church with Meta. Churches then connect their own pages to it.
 */
export async function saveMetaAppAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const admin = await requirePlatformAdmin();

  const appId = value(formData, "appId");
  const appSecret = value(formData, "appSecret");
  if (!appId || !appSecret) return fail("Both the app ID and the secret.", "meta");
  if (!/^\d{8,}$/.test(appId)) {
    return fail("A Facebook app ID is all digits — check that one.", "meta");
  }

  await setSetting(META_APP_ID, appId, admin.id);
  await setSetting(META_APP_SECRET, appSecret, admin.id);

  revalidatePath("/admin");
  return { ok: "Saved. Churches can connect their pages now.", scope: "meta" };
}

export async function clearMetaAppAction(): Promise<PlatformState> {
  await requirePlatformAdmin();
  await clearSetting(META_APP_ID);
  await clearSetting(META_APP_SECRET);

  revalidatePath("/admin");
  return { ok: "Removed. Nobody can connect a new page until it's set again.", scope: "meta" };
}

/** The TestFlight invitation, or nothing when there isn't one. */
export async function saveTestFlightAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const admin = await requirePlatformAdmin();
  const url = value(formData, "url");

  if (!url) {
    await clearSetting(TESTFLIGHT_URL);
    revalidatePath("/admin");
    return { ok: "Removed. The download pages stop offering the iPhone app.", scope: "testflight" };
  }

  if (!/^https:\/\/testflight\.apple\.com\//.test(url)) {
    return fail("A public TestFlight link starts https://testflight.apple.com/", "testflight");
  }

  await setSetting(TESTFLIGHT_URL, url, admin.id);
  revalidatePath("/admin");
  return { ok: "Saved. Every church's download page offers it now.", scope: "testflight" };
}

/**
 * The relay this site sends its mail through.
 *
 * Both halves at once, because one without the other sends nothing: the key,
 * and the address it comes from — which has to be at a domain the relay has
 * been shown you own, or every message is silently binned as a forgery.
 */
export async function saveMailAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const admin = await requirePlatformAdmin();

  const apiKey = value(formData, "apiKey");
  const from = value(formData, "from");

  if (!apiKey && !from) {
    await clearSetting(MAIL_API_KEY);
    await clearSetting(MAIL_FROM);
    revalidatePath("/admin");
    return { ok: "Removed. Nothing sends mail until it's set again.", scope: "mail" };
  }

  if (!from || !/^[^@<>\s]+@[^@<>\s.]+\.[^@<>\s]+$/.test(from.replace(/^.*</, "").replace(/>$/, ""))) {
    return fail("Give the address it comes from, like ChurchViewer <hello@churchviewer.com>.", "mail");
  }
  if (!apiKey) return fail("Paste the key from the mail relay.", "mail");

  await setSetting(MAIL_API_KEY, apiKey, admin.id);
  await setSetting(MAIL_FROM, from, admin.id);

  revalidatePath("/admin");
  return { ok: "Saved. Try the test below before trusting it.", scope: "mail" };
}

/** Prove it works, to an address the person setting it up can open. */
export async function sendTestMailAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const admin = await requirePlatformAdmin();
  const to = value(formData, "to") || admin.email;

  const sent = await sendMail({
    to,
    subject: "ChurchViewer test",
    text: [
      "This is the test from the platform console.",
      "",
      "If it arrived, password resets and invitations will too. If it landed in spam,",
      "the domain's SPF and DKIM records are the thing to look at.",
    ].join("\n"),
  });

  return sent.ok
    ? { ok: `Sent to ${to}. Check it arrived, and check the spam folder if it didn't.`, scope: "mail" }
    : fail(sent.error, "mail");
}

export async function clearOpenAiKeyAction(): Promise<PlatformState> {
  await requirePlatformAdmin();
  await clearSetting(OPENAI_API_KEY);

  revalidatePath("/admin");
  return { ok: "Key removed. Audio still gets extracted; nothing will be transcribed.", scope: "openai" };
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

/**
 * Mint a one-time link that lets someone set their own password.
 *
 * The admin never chooses the password — they hand over a way to choose one.
 * That's the difference between helping somebody back into their account and
 * being able to walk into it yourself, and it's worth keeping.
 */
export async function createResetLinkAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  const admin = await requirePlatformAdmin();

  const userId = value(formData, "userId");
  const [person] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!person) return fail("No such account.");

  const token = await createResetToken(person.id, admin.id);

  revalidatePath("/admin");
  return {
    ok: rootUrl(`/reset/${token}`),
    scope: person.email,
  };
}

/** Drop every session for an account — the answer to "someone else is in there". */
export async function revokeSessionsAction(
  _previous: PlatformState,
  formData: FormData,
): Promise<PlatformState> {
  await requirePlatformAdmin();

  const userId = value(formData, "userId");
  const [person] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!person) return fail("No such account.");

  await revokeAllSessions(person.id);

  revalidatePath("/admin");
  return { ok: `${person.email} is signed out everywhere.`, scope: person.email };
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
