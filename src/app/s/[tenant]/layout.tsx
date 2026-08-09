import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser, getMembershipRole } from "@/lib/auth/session";
import { getChurchBySlug } from "@/lib/churches";

export default async function TenantLayout({ children, params }: LayoutProps<"/s/[tenant]">) {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const user = await getSessionUser();
  const role = user ? await getMembershipRole(user.id, church.id) : null;

  return (
    <>
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              {church.name}
            </Link>
            {church.tagline ? (
              <p className="text-sm text-stone-500">{church.tagline}</p>
            ) : null}
          </div>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-500">
              Library
            </Link>
            <Link href="/series" className="hover:text-amber-700 dark:hover:text-amber-500">
              Series
            </Link>
            {role ? (
              <Link
                href="/admin"
                className="rounded-lg bg-amber-700 px-3 py-1.5 text-white hover:bg-amber-800"
              >
                Manage
              </Link>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-stone-200 py-6 dark:border-stone-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-sm text-stone-500">
          <span>{church.name}</span>
          <span>Powered by ChurchViewer</span>
        </div>
      </footer>
    </>
  );
}
