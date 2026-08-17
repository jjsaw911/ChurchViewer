"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { churchPosts } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";

export type BoardState = { error?: string };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Say something, or reply to something.
 *
 * One action for both, because a reply is a post with a parent and pretending
 * otherwise means two of everything.
 */
export async function postToBoardAction(
  _previous: BoardState,
  formData: FormData,
): Promise<BoardState> {
  const tenant = value(formData, "tenant");
  const { church, user } = await requireChurchAccess(tenant);

  const body = value(formData, "body");
  if (!body) return { error: "Nothing to post." };
  if (body.length > 5000) return { error: "That's longer than a noticeboard wants." };

  const parentId = value(formData, "parentId") || null;

  // A reply has to belong to this church's board, not just to any id somebody
  // can type into a form.
  if (parentId) {
    const [parent] = await db
      .select({ id: churchPosts.id })
      .from(churchPosts)
      .where(and(eq(churchPosts.id, parentId), eq(churchPosts.churchId, church.id)))
      .limit(1);
    if (!parent) return { error: "That conversation has gone." };
  }

  await db.insert(churchPosts).values({
    churchId: church.id,
    parentId,
    authorId: user.id,
    // Written down rather than joined: a post should still read properly after
    // somebody leaves the church and their account goes.
    authorName: user.name || user.email,
    body,
  });

  revalidatePath(`/s/${tenant}/admin/board`);
  return {};
}

/**
 * Take something back.
 *
 * Your own, always. An owner can remove anybody's, because somebody has to be
 * able to deal with the post that shouldn't be there and it cannot wait for the
 * person who wrote it.
 */
export async function deleteBoardPostAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church, user, role } = await requireChurchAccess(tenant);
  const id = value(formData, "id");

  const [post] = await db
    .select({ authorId: churchPosts.authorId })
    .from(churchPosts)
    .where(and(eq(churchPosts.id, id), eq(churchPosts.churchId, church.id)))
    .limit(1);

  if (!post) return;
  if (post.authorId !== user.id && role !== "owner") return;

  // Replies go with the thread they hang off, which is what deleting a
  // conversation means to the person pressing it.
  await db.delete(churchPosts).where(eq(churchPosts.parentId, id));
  await db.delete(churchPosts).where(eq(churchPosts.id, id));

  revalidatePath(`/s/${tenant}/admin/board`);
}
