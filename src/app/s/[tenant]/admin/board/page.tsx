import type { Metadata } from "next";
import ChurchBoard from "@/components/admin/ChurchBoard";
import { requireChurchAccess } from "@/lib/admin/guard";
import { listBoard } from "@/lib/board/service";

export const metadata: Metadata = { title: "Noticeboard" };

/**
 * Where a church's own people talk to each other.
 *
 * Members only, which is the whole point: the group chat currently doing this
 * job has whoever was in it three years ago still reading it, and nobody wants
 * to be the one who removes them.
 */
export default async function BoardPage({ params }: PageProps<"/s/[tenant]/admin/board">) {
  const { tenant } = await params;
  const { church, user, role } = await requireChurchAccess(tenant);

  return (
    <ChurchBoard
      tenant={tenant}
      churchName={church.name}
      threads={await listBoard(church.id)}
      viewerId={user.id}
      isOwner={role === "owner"}
    />
  );
}
