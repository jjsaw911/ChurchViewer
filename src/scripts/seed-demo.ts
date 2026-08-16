/**
 * The demo church, for Apple's reviewer and anybody being shown this.
 *
 *   npm run demo:seed -- demo@churchviewer.com
 *
 * A beta is rejected on its first screen if the reviewer cannot sign in, and
 * "here is a login" is only half of it: an account that lands on an empty plan
 * shows nothing working. So this makes a church, an account in it, and a Sunday
 * with real songs, slides and a message — everything the app does, visible
 * without a projector in the room.
 *
 * Safe to run twice. It fills in what is missing and leaves what is there.
 */
import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { churches, memberships, serviceItems, services, songs, users } from "@/db/schema";
import { createPasswordUser, findUserByEmail, normalizeEmail } from "@/lib/auth/accounts";
import { hashPassword } from "@/lib/auth/password";

const SLUG = "demo";
const CHURCH_NAME = "Demo Church";

/** Readable down a phone, and still not guessable. */
function password(): string {
  return `${randomBytes(9).toString("base64url")}`;
}

async function main() {
  const email = normalizeEmail(process.argv[2] ?? "demo@churchviewer.com");
  const secret = process.argv[3] || password();

  // --- the church ----------------------------------------------------------
  let [church] = await db.select().from(churches).where(eq(churches.slug, SLUG)).limit(1);
  if (!church) {
    [church] = await db
      .insert(churches)
      .values({
        slug: SLUG,
        name: CHURCH_NAME,
        tagline: "A worked example, for anybody being shown ChurchViewer",
      })
      .returning();
    console.log(`Made the church ${SLUG}.`);
  }

  // --- the account ---------------------------------------------------------
  const existing = await findUserByEmail(email);
  let userId: string;

  if (existing) {
    // Re-running should hand back a login that works, so the password is set
    // again rather than left as whatever it was.
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(secret), mustChangePassword: false })
      .where(eq(users.id, existing.id));
    userId = existing.id;
    console.log("Reset the password on the existing account.");
  } else {
    userId = await createPasswordUser({ name: "App Review", email, password: secret });
    console.log("Made the account.");
  }

  // Never `mustChangePassword` here. A reviewer handed a password and then
  // forced to change it is a reviewer whose credentials no longer match the
  // ones in the submission.
  await db
    .update(users)
    .set({ mustChangePassword: false })
    .where(eq(users.id, userId));

  await db
    .insert(memberships)
    .values({ churchId: church.id, userId, role: "editor" })
    .onConflictDoNothing();

  // --- something to look at ------------------------------------------------
  //
  // Songs are per church, so the demo needs its own rows. They point at the
  // same stored recordings, which is fine for a demo and worth knowing: this
  // church is a window onto those files, not an owner of them.
  const sources = await db
    .select({
      title: songs.title,
      slides: songs.slides,
      audioSrc: songs.audioSrc,
      musicalKey: songs.musicalKey,
      timingOffsetMs: songs.timingOffsetMs,
    })
    .from(songs)
    .where(and(isNotNull(songs.audioSrc), sql`jsonb_array_length(${songs.slides}) > 8`))
    .limit(3);

  const copied: string[] = [];
  for (const [index, source] of sources.entries()) {
    const slug = `demo-song-${index + 1}`;
    const [already] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.churchId, church.id), eq(songs.slug, slug)))
      .limit(1);

    if (already) {
      copied.push(already.id);
      continue;
    }

    const [song] = await db
      .insert(songs)
      .values({
        churchId: church.id,
        slug,
        title: source.title,
        slides: source.slides,
        audioSrc: source.audioSrc,
        musicalKey: source.musicalKey,
        timingOffsetMs: source.timingOffsetMs,
        status: "ready",
      })
      .returning({ id: songs.id });
    copied.push(song.id);
  }

  // --- a Sunday ------------------------------------------------------------
  //
  // Dated ahead, so `/present/today` finds it however long this sits unused:
  // today's first, then the next one coming.
  const heldOn = "2027-01-03";
  let [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.churchId, church.id), eq(services.heldOn, heldOn)))
    .limit(1);

  if (!service) {
    [service] = await db
      .insert(services)
      .values({
        churchId: church.id,
        slug: heldOn,
        title: "Sunday Morning",
        heldOn,
        startsAt: "10:30",
        notes: "A worked example: announcements, a worship set, and a message.",
      })
      .returning();

    await db.insert(serviceItems).values({
      serviceId: service.id,
      position: 1,
      title: "Welcome and notices",
      kind: "announcements",
      durationSeconds: 300,
      slides: [
        { id: "slide-1", label: "Welcome", lines: ["Welcome", "Good morning"], atMs: 0, endMs: 0 },
        { id: "slide-2", label: "Notices", lines: ["Church lunch after the service"], atMs: 0, endMs: 0 },
      ],
    });

    const [worship] = await db
      .insert(serviceItems)
      .values({
        serviceId: service.id,
        position: 2,
        title: "Worship",
        kind: "worship",
        durationSeconds: 300 * copied.length,
      })
      .returning({ id: serviceItems.id });

    for (const [index, songId] of copied.entries()) {
      const [song] = await db
        .select({ title: songs.title })
        .from(songs)
        .where(eq(songs.id, songId))
        .limit(1);

      await db.insert(serviceItems).values({
        serviceId: service.id,
        parentId: worship.id,
        position: index + 1,
        title: song?.title ?? "Song",
        kind: "song",
        durationSeconds: 300,
        songId,
      });
    }

    await db.insert(serviceItems).values({
      serviceId: service.id,
      position: 3,
      title: "Message",
      kind: "sermon",
      durationSeconds: 1800,
      notes: "Advanced by hand. Blank the screen between points if you want eyes up.",
      slides: [
        { id: "slide-1", label: "Message", lines: ["A worked example"], atMs: 0, endMs: 0 },
        { id: "slide-2", label: "One", lines: ["Slides typed for one Sunday"], atMs: 0, endMs: 0 },
        { id: "slide-3", label: "Two", lines: ["Advanced by hand, not by a recording"], atMs: 0, endMs: 0 },
      ],
    });

    console.log(`Made a service on ${heldOn} with ${copied.length} songs.`);
  }

  console.log("");
  console.log("  Church name to type in the app:  demo");
  console.log(`  Email:                           ${email}`);
  console.log(`  Password:                        ${secret}`);
  console.log("");
  process.exit(0);
}

void main();
