"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { directMessages } from "@/db/schema";
import { requireChurchAccess } from "@/lib/admin/guard";
import { bothInChurch, markRead } from "@/lib/dm/service";

export type MessageState = { error?: string };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Write to somebody in the same church.
 *
 * Membership is checked on both ends every time. A user id is a thing anybody
 * can put in a form, and being in this church is the entire basis on which two
 * people are allowed to write to each other here — so it is asked at the moment
 * of sending rather than assumed from the page that offered the box.
 */
export async function sendDirectMessageAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const tenant = value(formData, "tenant");
  const { church, user } = await requireChurchAccess(tenant);

  const toUserId = value(formData, "toUserId");
  const body = value(formData, "body");

  if (!body) return { error: "Nothing to send." };
  if (body.length > 5000) return { error: "That's longer than a message wants to be." };
  if (toUserId === user.id) return { error: "That's you." };

  if (!(await bothInChurch(church.id, user.id, toUserId))) {
    return { error: "They're not in this church." };
  }

  await db.insert(directMessages).values({
    churchId: church.id,
    fromUserId: user.id,
    toUserId,
    body,
  });

  revalidatePath(`/s/${tenant}/admin/inbox`, "layout");
  return {};
}

/** Opening a conversation marks what they sent as read. */
export async function markConversationReadAction(
  tenant: string,
  otherId: string,
): Promise<void> {
  const { church, user } = await requireChurchAccess(tenant);
  await markRead(church.id, user.id, otherId);
}
