"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Getting around a church.
 *
 * Two audiences share these pages and they want different things. Someone who
 * came to watch last Sunday's message wants the library; someone on staff wants
 * this Sunday's plan, the songs in it, and the files behind those — and they
 * move between the four all morning.
 *
 * So there are two rows rather than one long line of links. The second only
 * exists for people who can act on it, and it says where you are, because a set
 * of admin pages that all look the same is the thing that makes them hard to
 * navigate.
 */

type Item = { href: string; label: string };

const PUBLIC_LINKS: Item[] = [
  { href: "/", label: "Library" },
  { href: "/series", label: "Series" },
];

const STAFF_LINKS: Item[] = [
  { href: "/admin/services", label: "Plans" },
  { href: "/admin/songs", label: "Songs" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin", label: "Messages" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/people", label: "People" },
];

/** Whether a link is the page you're on, or the section you're inside. */
function isCurrent(pathname: string, href: string): boolean {
  // Everything lives under /s/<tenant> once the proxy has rewritten it, so the
  // comparison is on what comes after the tenant.
  const path = pathname.replace(/^\/s\/[^/]+/, "") || "/";

  if (href === "/") return path === "/";
  // "/admin" is the messages list and the parent of everything else; without
  // this it would light up on every admin page.
  if (href === "/admin") return path === "/admin" || path.startsWith("/admin/sermons");
  return path === href || path.startsWith(`${href}/`);
}

export default function ChurchNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();

  const link = (item: Item, current: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={current ? "page" : undefined}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
        current
          ? "bg-amber-700 text-white"
          : "hover:bg-stone-100 dark:hover:bg-stone-800"
      }`}
    >
      {item.label}
    </Link>
  );

  return (
    // Scrolls sideways rather than wrapping on a narrow screen: an iPad in
    // portrait shouldn't push the page content down two rows to make room.
    <nav className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {PUBLIC_LINKS.map((item) => link(item, isCurrent(pathname, item.href)))}

      {canManage ? (
        <>
          <span className="mx-2 h-5 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />
          {STAFF_LINKS.map((item) => link(item, isCurrent(pathname, item.href)))}
        </>
      ) : null}
    </nav>
  );
}
