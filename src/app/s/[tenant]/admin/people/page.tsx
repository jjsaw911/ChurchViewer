import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import ChurchPeople, { type Person } from "@/components/admin/ChurchPeople";
import { requireChurchAccess } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({ params }: PageProps<"/s/[tenant]/admin/people">) {
  const { tenant } = await params;
  const { church, user, role } = await requireChurchAccess(tenant);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      mustChangePassword: users.mustChangePassword,
      addedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.churchId, church.id))
    .orderBy(asc(memberships.createdAt));

  const people: Person[] = rows.map((row) => ({
    ...row,
    addedAt: row.addedAt.toISOString(),
  }));

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">People</h1>
        <p className="text-sm text-stone-500">
          Everyone who can get into {church.name}, and how somebody new is set up.
        </p>
      </div>

      <ChurchPeople
        tenant={tenant}
        people={people}
        canManage={role === "owner"}
        currentUserId={user.id}
      />
    </div>
  );
}
