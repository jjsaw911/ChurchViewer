import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { isPlatformAdminEmail } from "@/lib/env";
import SignOutButton from "@/components/auth/SignOutButton";

export default async function MarketingLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const isAdmin = isPlatformAdminEmail(user?.email);

  return (
    <>
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Church<span className="text-amber-700 dark:text-amber-500">Viewer</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            {user ? (
              <>
                <span className="hidden text-stone-500 sm:inline">{user.email}</span>
                {isAdmin ? (
                  <Link
                    href="/admin"
                    className="hover:text-amber-700 dark:hover:text-amber-500"
                  >
                    Platform
                  </Link>
                ) : null}
                <Link href="/register" className="hover:text-amber-700 dark:hover:text-amber-500">
                  Your churches
                </Link>
                <SignOutButton />
              </>
            ) : (
              <>
                <Link href="/login" className="hover:text-amber-700 dark:hover:text-amber-500">
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="rounded-lg bg-amber-700 px-4 py-2 text-white hover:bg-amber-800"
                >
                  Register your church
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">{children}</main>

      <footer className="border-t border-stone-200 py-6 dark:border-stone-800">
        <div className="mx-auto max-w-6xl px-6 text-sm text-stone-500">
          ChurchViewer &middot; recorded services, on demand.
        </div>
      </footer>
    </>
  );
}
