import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Conversation from "@/components/admin/Conversation";
import { requireChurchAccess } from "@/lib/admin/guard";
import { bothInChurch, churchPeople, markRead, thread } from "@/lib/dm/service";

export const metadata: Metadata = { title: "Messages" };

/** One conversation: what has been said, and a box to say more. */
export default async function ConversationPage({
  params,
}: PageProps<"/s/[tenant]/admin/inbox/[person]">) {
  const { tenant, person } = await params;
  const { church, user } = await requireChurchAccess(tenant);

  // Both ends have to be in this church — that membership is the whole basis
  // on which these two are allowed to write to each other.
  if (person === user.id || !(await bothInChurch(church.id, user.id, person))) notFound();

  const people = await churchPeople(church.id, user.id);
  const other = people.find((one) => one.id === person);
  if (!other) notFound();

  const messages = await thread(church.id, user.id, person);
  // Opening it is reading it.
  await markRead(church.id, user.id, person);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <Link href="/admin/inbox" className="text-sm text-stone-500 hover:underline">
          &larr; Messages
        </Link>
        <h1 className="text-2xl font-semibold">{other.name || other.email}</h1>
        <p className="text-sm text-stone-500">{other.email}</p>
      </div>

      <Conversation
        tenant={tenant}
        toUserId={person}
        viewerId={user.id}
        messages={messages}
      />
    </div>
  );
}
