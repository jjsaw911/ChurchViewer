import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { resolveAccess } from "@/lib/admin/guard";
import { getChurchBySlug } from "@/lib/churches";
import { isPlatformAdminEmail, rootUrl } from "@/lib/env";

export default async function TenantLayout({ children, params }: LayoutProps<"/s/[tenant]">) {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const user = await getSessionUser();
  const access = user ? await resolveAccess(user, church.id) : null;
  const role = access?.role ?? null;
  // A platform admin who is also a member of this church gets no banner, so
  // without this there'd be no way back to the console from inside a church —
  // and registering drops you straight in here.
  const isPlatformAdmin = isPlatformAdminEmail(user?.email);

  return (
    <>
      {access?.viaPlatform ? (
        // Standing in someone else's church is a thing you should never do by
        // accident, or forget you're doing.
        <div className="bg-amber-100 px-6 py-2 text-center text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          You&apos;re in {church.name} as a platform administrator — not a member of this
          church.{" "}
          <a href={rootUrl("/admin")} className="underline underline-offset-2">
            Back to the console
          </a>
        </div>
      ) : null}
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
            {isPlatformAdmin ? (
              <a
                href={rootUrl("/admin")}
                className="hover:text-amber-700 dark:hover:text-amber-500"
              >
                Platform
              </a>
            ) : null}
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
