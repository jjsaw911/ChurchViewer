import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { churches } from "@/db/schema";

/** Database lookups for tenants. Kept apart from `lib/tenant.ts` so middleware
 * and client components can use the pure helpers without pulling in `pg`. */
export async function getChurchBySlug(slug: string) {
  const rows = await db.select().from(churches).where(eq(churches.slug, slug)).limit(1);
  return rows[0] ?? null;
}

export async function isSlugTaken(slug: string): Promise<boolean> {
  return (await getChurchBySlug(slug)) !== null;
}
