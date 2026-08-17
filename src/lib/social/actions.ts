"use server";

import { revalidatePath } from "next/cache";
import { requireChurchAccess } from "@/lib/admin/guard";
import { disconnectAccount, publish } from "@/lib/social/service";

export type SocialState = { error?: string; ok?: string; outcomes?: string[] };

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

/**
 * Put a post out.
 *
 * Nothing here happens on a timer or on anybody's behalf: a person writes the
 * words, ticks the places, and presses the button. That matters more than it
 * sounds — this is the one part of the app that reaches outside the building
 * and cannot be taken back quietly.
 */
export async function publishPostAction(
  _previous: SocialState,
  formData: FormData,
): Promise<SocialState> {
  const tenant = value(formData, "tenant");
  const { church, user } = await requireChurchAccess(tenant);

  const message = value(formData, "message");
  const mediaSrc = value(formData, "mediaSrc") || null;
  const linkUrl = value(formData, "linkUrl") || null;
  const accountIds = formData.getAll("accountIds").map(String);

  if (accountIds.length === 0) return { error: "Tick where it should go." };
  if (!message && !mediaSrc) return { error: "Write something, or add a picture." };

  const outcomes = await publish({
    churchId: church.id,
    userId: user.id,
    accountIds,
    message,
    mediaSrc,
    linkUrl,
  });

  revalidatePath(`/s/${tenant}/admin/social`);

  const failed = outcomes.filter((outcome) => !outcome.ok);
  const posted = outcomes.filter((outcome) => outcome.ok);

  return {
    ok: posted.length
      ? `Posted to ${posted.map((outcome) => outcome.accountName).join(", ")}.`
      : undefined,
    error: failed.length
      ? failed.map((outcome) => `${outcome.accountName}: ${outcome.error}`).join(" · ")
      : undefined,
  };
}

/** Forget a page. Nothing already posted is touched. */
export async function disconnectAccountAction(formData: FormData): Promise<void> {
  const tenant = value(formData, "tenant");
  const { church } = await requireChurchAccess(tenant);

  await disconnectAccount(church.id, value(formData, "accountId"));
  revalidatePath(`/s/${tenant}/admin/social`);
}
