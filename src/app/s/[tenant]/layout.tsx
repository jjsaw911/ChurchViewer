import Link from "next/link";
import { notFound } from "next/navigation";
import ChurchNav from "@/components/ChurchNav";
import { LogoMark } from "@/components/Logo";
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
      {/* Sticky, because the pages under it are long. A plan runs past the
          bottom of the screen and a song editor further, and a menu you have to
          scroll back up to find is a menu that isn't there. */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur dark:border-stone-800 dark:bg-stone-900/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div>
            <Link href="/" className="text-lg font-semibold tracking-tight">
              {church.name}
            </Link>
            {church.tagline ? (
              <p className="text-sm text-stone-500">{church.tagline}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ChurchNav canManage={Boolean(role)} />
            {isPlatformAdmin ? (
              <a
                href={rootUrl("/admin")}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                Platform
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

      <footer className="border-t border-stone-200 py-6 dark:border-stone-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-6 text-sm text-stone-500">
          <span>{church.name}</span>
          <span className="flex items-center gap-2">
            <LogoMark className="h-5 w-5" />
            <a href={rootUrl("/support")} className="hover:underline">
              Powered by ChurchViewer
            </a>
          </span>
        </div>
      </footer>
    </>
  );
}
