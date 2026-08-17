import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { churchPosts } from "@/db/schema";

/**
 * The church's noticeboard.
 *
 * Threads newest first, replies oldest first underneath them — which is how a
 * conversation reads, and the opposite of how a list of conversations does.
 */

export type BoardReply = {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  at: string;
};

export type BoardThread = BoardReply & { replies: BoardReply[] };

export async function listBoard(churchId: string, limit = 50): Promise<BoardThread[]> {
  const threads = await db
    .select()
    .from(churchPosts)
    .where(and(eq(churchPosts.churchId, churchId), isNull(churchPosts.parentId)))
    .orderBy(desc(churchPosts.createdAt))
    .limit(limit);

  if (threads.length === 0) return [];

  const replies = await db
    .select()
    .from(churchPosts)
    .where(
      and(
        eq(churchPosts.churchId, churchId),
        inArray(
          churchPosts.parentId,
          threads.map((thread) => thread.id),
        ),
      ),
    )
    .orderBy(asc(churchPosts.createdAt));

  const shape = (row: (typeof threads)[number]): BoardReply => ({
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName || "Somebody",
    body: row.body,
    at: row.createdAt.toISOString(),
  });

  return threads.map((thread) => ({
    ...shape(thread),
    replies: replies.filter((reply) => reply.parentId === thread.id).map(shape),
  }));
}
