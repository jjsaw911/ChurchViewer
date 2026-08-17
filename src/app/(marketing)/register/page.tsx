import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { churches, memberships } from "@/db/schema";
import GoogleButton from "@/components/auth/GoogleButton";
import RegisterForm from "@/components/auth/RegisterForm";
import { getSessionUser } from "@/lib/auth/session";
import { env, tenantUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Register your church" };

export default async function RegisterPage() {
  const user = await getSessionUser();

  // Archived churches are excluded: their subdomain 404s, so listing one here
  // would just be a link into a dead end.
  const existing = user
    ? await db
        .select({ slug: churches.slug, name: churches.name })
        .from(memberships)
        .innerJoin(churches, eq(churches.id, memberships.churchId))
        .where(and(eq(memberships.userId, user.id), isNull(churches.archivedAt)))
    : [];

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">
          {user ? "Add a church" : "Register your church"}
        </h1>
        <p className="text-stone-600 dark:text-stone-400">
          {user
            ? `Signed in as ${user.email}.`
            : "Create your account and your church's site in one step."}
        </p>
      </div>

      {existing.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
          <h2 className="text-sm font-semibold">Your churches</h2>
          <ul className="space-y-1 text-sm">
            {existing.map((church) => (
              <li key={church.slug}>
                <a
                  href={tenantUrl(church.slug, "/admin")}
                  className="text-amber-700 underline underline-offset-2 dark:text-amber-500"
                >
                  {church.name}
                </a>{" "}
                <span className="text-stone-500">
                  {church.slug}.{env.rootDomain}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!user && env.google.isConfigured ? (
        <div className="space-y-4">
          <GoogleButton label="Sign up with Google" />
          <div className="flex items-center gap-3 text-xs text-stone-500">
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
            or with an email and password
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
          </div>
        </div>
      ) : null}

      <RegisterForm needsAccount={!user} rootDomain={env.rootDomain} />

      {!user ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Already registered?{" "}
          <Link href="/login" className="text-amber-700 underline underline-offset-2 dark:text-amber-500">
            Log in
          </Link>
        </p>
      ) : null}
    </div>
  );
}
