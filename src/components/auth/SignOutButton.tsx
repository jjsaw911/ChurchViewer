import { signOutAction } from "@/lib/auth/actions";

export default function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="hover:text-amber-700 dark:hover:text-amber-500">
        Sign out
      </button>
    </form>
  );
}
