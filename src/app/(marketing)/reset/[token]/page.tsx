import type { Metadata } from "next";
import Link from "next/link";
import ResetForm from "@/components/auth/ResetForm";
import { resolveResetToken } from "@/lib/auth/reset";

export const metadata: Metadata = { title: "Set a new password" };

/**
 * Where a one-time reset link lands. Reached by someone who is locked out, so
 * nothing here requires a session.
 */
export default async function ResetPage({ params }: PageProps<"/reset/[token]">) {
  const { token } = await params;
  const target = await resolveResetToken(token);

  if (!target) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-3xl font-semibold">This link has expired</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Reset links last an hour, and only the newest one for an account works. Ask
          whoever sent it for another.
        </p>
        <Link
          href="/login"
          className="inline-block text-amber-700 underline underline-offset-2 dark:text-amber-500"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Set a new password</h1>
        <p className="text-stone-600 dark:text-stone-400">
          For {target.email}. Everywhere that account is currently signed in will be
          signed out.
        </p>
      </div>
      <ResetForm token={token} />
    </div>
  );
}
