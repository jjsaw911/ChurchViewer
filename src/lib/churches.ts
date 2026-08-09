import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { churches, memberships, sermons, songs, users } from "@/db/schema";

/** Database lookups for tenants. Kept apart from `lib/tenant.ts` so middleware
 * and client components can use the pure helpers without pulling in `pg`. */

/**
 * The church behind a subdomain, or null.
 *
 * Archived churches are deliberately invisible here. Every tenant-facing
 * surface — the pages, the admin guard, the upload and transcribe endpoints —
 * reads a church through this one function, so filtering here takes the whole
 * site off the air for that slug in a single place. Platform tools that need to
 * see archived churches use the explicit helpers below.
 */
export async function getChurchBySlug(slug: string) {
  const rows = await db
    .select()
    .from(churches)
    .where(and(eq(churches.slug, slug), isNull(churches.archivedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** As above, but archived churches included — for the platform console. */
export async function getAnyChurchBySlug(slug: string) {
  const rows = await db.select().from(churches).where(eq(churches.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/**
 * Whether a slug can still be registered.
 *
 * Counts archived churches as taken. An archived church is off the air but not
 * gone, and handing its address to someone else would make restoring it
 * impossible — and would quietly point an old subdomain at a different
 * congregation's recordings.
 */
export async function isSlugTaken(slug: string): Promise<boolean> {
  return (await getAnyChurchBySlug(slug)) !== null;
}

export type ChurchSummary = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  archivedAt: Date | null;
  createdAt: Date;
  sermonCount: number;
  songCount: number;
  memberCount: number;
  owners: string[];
};

/**
 * Every church, archived ones included, with enough context to decide what to
 * do about each. The counts are what make an archive decision informed — how
 * much work is behind this address before you take it off the air.
 */
export async function listChurches(): Promise<ChurchSummary[]> {
  const rows = await db
    .select({
      id: churches.id,
      slug: churches.slug,
      name: churches.name,
      tagline: churches.tagline,
      archivedAt: churches.archivedAt,
      createdAt: churches.createdAt,
      sermonCount: sql<number>`(
        select count(*)::int from ${sermons} where ${sermons.churchId} = ${churches.id}
      )`,
      songCount: sql<number>`(
        select count(*)::int from ${songs} where ${songs.churchId} = ${churches.id}
      )`,
      memberCount: sql<number>`(
        select count(*)::int from ${memberships} where ${memberships.churchId} = ${churches.id}
      )`,
    })
    .from(churches)
    .orderBy(asc(churches.name));

  // Owner emails in one extra query rather than a join — a church can have
  // several, and joining would multiply the count subqueries above.
  const ownerRows = await db
    .select({ churchId: memberships.churchId, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.role, "owner"))
    .orderBy(asc(users.email));

  const ownersByChurch = new Map<string, string[]>();
  for (const row of ownerRows) {
    const list = ownersByChurch.get(row.churchId) ?? [];
    list.push(row.email);
    ownersByChurch.set(row.churchId, list);
  }

  return rows.map((row) => ({ ...row, owners: ownersByChurch.get(row.id) ?? [] }));
}

/** Headline numbers for the console. */
export async function platformStats() {
  const [live] = await db
    .select({ n: count() })
    .from(churches)
    .where(isNull(churches.archivedAt));
  const [archived] = await db
    .select({ n: count() })
    .from(churches)
    .where(isNotNull(churches.archivedAt));
  const [sermonTotal] = await db.select({ n: count() }).from(sermons);
  const [userTotal] = await db.select({ n: count() }).from(users);

  return {
    live: live?.n ?? 0,
    archived: archived?.n ?? 0,
    sermons: sermonTotal?.n ?? 0,
    users: userTotal?.n ?? 0,
  };
}
