import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ChangePasswordForm from "@/components/auth/ChangePasswordForm";
import { getSessionUser } from "@/lib/auth/session";
import { rootUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Choose a password" };

/**
 * Where somebody lands the first time they sign in with a password an owner
 * chose for them.
 *
 * On the apex rather than inside a church, because the account is the thing
 * being changed and a person can belong to more than one church.
 */
export default async function ChoosePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect(rootUrl("/login"));

  const forced = user.mustChangePassword === true;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">
          {forced ? "Choose your own password" : "Change your password"}
        </h1>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {forced
            ? "You're signed in with a password somebody else set for you. Pick one only you know — nothing else will open until you do."
            : "Signed in as " + user.email + "."}
        </p>
      </div>

      <ChangePasswordForm forced={forced} />
    </div>
  );
}
