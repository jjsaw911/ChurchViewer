import type { Metadata } from "next";
import Link from "next/link";
import ForgotForm from "@/components/auth/ForgotForm";

export const metadata: Metadata = { title: "Forgotten password" };

/**
 * The way back in, without needing anybody's help.
 *
 * Until now the only route was an owner or an administrator making a link and
 * reading it out — which needs two people awake at the same time, and is why
 * the volunteer who forgets their password on a Saturday night simply borrows
 * somebody else's login instead.
 */
export default function ForgotPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Forgotten password</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Put in your email address and we&rsquo;ll send you a link to choose a new one.
        </p>
      </div>

      <ForgotForm />

      <p className="text-sm text-stone-600 dark:text-stone-400">
        <Link href="/login" className="text-amber-700 underline underline-offset-2">
          Back to signing in
        </Link>
      </p>
    </div>
  );
}
