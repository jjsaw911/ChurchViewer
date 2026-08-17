import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { directMessages, memberships, users } from "@/db/schema";

/**
 * Messages between two people in one church.
 *
 * Everything here is asked in terms of "me and them" rather than a conversation
 * id, because that is what the pages ask: a list of the people I have written
 * to or heard from, and then one of those.
 */

export type Correspondent = {
  id: string;
  name: string;
  email: string;
  /** The last thing either of us said, for the list. */
  latest: string;
  at: string;
  unread: number;
};

export type DirectMessage = {
  id: string;
  fromUserId: string;
  body: string;
  at: string;
};

/** Everyone in this church, apart from the person asking. */
export async function churchPeople(churchId: string, exceptUserId: string) {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.churchId, churchId))
    .orderBy(users.name);

  return rows.filter((row) => row.id !== exceptUserId);
}

/** Whether these two can write to each other: both in this church. */
export async function bothInChurch(
  churchId: string,
  a: string,
  b: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.churchId, churchId));

  const ids = new Set(rows.map((row) => row.userId));
  return ids.has(a) && ids.has(b);
}

/**
 * The conversations this person has, newest first.
 *
 * One row per other person rather than per message — a list of messages sorted
 * by time is an inbox, and an inbox is the thing everybody is already drowning
 * in. This is a list of people.
 */
export async function conversations(
  churchId: string,
  userId: string,
): Promise<Correspondent[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      latest: sql<string>`(array_agg(${directMessages.body} order by ${directMessages.createdAt} desc))[1]`,
      at: sql<Date>`max(${directMessages.createdAt})`,
      unread: sql<number>`count(*) filter (
        where ${directMessages.toUserId} = ${userId} and ${directMessages.readAt} is null
      )::int`,
    })
    .from(directMessages)
    .innerJoin(
      users,
      sql`${users.id} = case when ${directMessages.fromUserId} = ${userId}
                             then ${directMessages.toUserId}
                             else ${directMessages.fromUserId} end`,
    )
    .where(
      and(
        eq(directMessages.churchId, churchId),
        or(eq(directMessages.fromUserId, userId), eq(directMessages.toUserId, userId)),
      ),
    )
    .groupBy(users.id, users.name, users.email)
    .orderBy(desc(sql`max(${directMessages.createdAt})`));

  return rows.map((row) => ({
    id: row.id,
    name: row.name || row.email,
    email: row.email,
    latest: row.latest ?? "",
    at: new Date(row.at).toISOString(),
    unread: row.unread,
  }));
}

/** Everything said between two people, oldest first — the shape of a talk. */
export async function thread(
  churchId: string,
  userId: string,
  otherId: string,
): Promise<DirectMessage[]> {
  const rows = await db
    .select()
    .from(directMessages)
    .where(
      and(
        eq(directMessages.churchId, churchId),
        or(
          and(eq(directMessages.fromUserId, userId), eq(directMessages.toUserId, otherId)),
          and(eq(directMessages.fromUserId, otherId), eq(directMessages.toUserId, userId)),
        ),
      ),
    )
    .orderBy(directMessages.createdAt);

  return rows.map((row) => ({
    id: row.id,
    fromUserId: row.fromUserId,
    body: row.body,
    at: row.createdAt.toISOString(),
  }));
}

/** How many messages are waiting, for the badge in the menu. */
export async function unreadCount(churchId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(directMessages)
    .where(
      and(
        eq(directMessages.churchId, churchId),
        eq(directMessages.toUserId, userId),
        isNull(directMessages.readAt),
      ),
    );

  return row?.count ?? 0;
}

/** Opening a conversation is reading it. */
export async function markRead(churchId: string, userId: string, otherId: string) {
  await db
    .update(directMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(directMessages.churchId, churchId),
        eq(directMessages.toUserId, userId),
        eq(directMessages.fromUserId, otherId),
        isNull(directMessages.readAt),
      ),
    );
}
