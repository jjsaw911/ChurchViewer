import type { Metadata } from "next";
import Link from "next/link";
import JoinForm from "@/components/auth/JoinForm";
import { getSessionUser } from "@/lib/auth/session";
import { acceptInvite, resolveInvite } from "@/lib/auth/invites";
import { rootUrl, tenantUrl } from "@/lib/env";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Join" };

/**
 * The far end of a link somebody was texted.
 *
 * Two boxes and a button, because the person opening this is standing in a car
 * park with a message on their phone, and every extra field is somebody who
 * decides to do it later and then doesn't.
 *
 * Already signed in, they are simply put in and sent on. Being asked to sign in
 * again, on the phone that is already signed in, is where invitations go to die.
 */
export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const invite = await resolveInvite(token);

  if (!invite) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-3xl font-semibold">That link has expired</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Invitation links stop working after a couple of weeks, and can be turned off
          sooner. Ask whoever sent it for a new one.
        </p>
        <p className="text-sm text-stone-500">
          Already have an account?{" "}
          <Link href="/login" className="text-amber-700 underline underline-offset-2">
            Sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  const user = await getSessionUser();
  if (user) {
    await acceptInvite(token, user.id);
    redirect(tenantUrl(invite.churchSlug, "/present/today"));
  }

  return (
    <div className="mx-auto max-w-md space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Join {invite.churchName}</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Pick an email address and a password. That&rsquo;s the whole of it — you&rsquo;ll
          be able to plan services, run the screen and edit songs.
        </p>
      </header>

      <JoinForm token={token} />

      <p className="text-sm text-stone-600 dark:text-stone-400">
        Already have an account?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(rootUrl(`/join/${token}`))}`}
          className="text-amber-700 underline underline-offset-2 dark:text-amber-500"
        >
          Sign in instead
        </Link>{" "}
        and you&rsquo;ll be let straight in.
      </p>
    </div>
  );
}
