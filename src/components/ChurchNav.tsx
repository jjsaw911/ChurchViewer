"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Getting around a church.
 *
 * Eleven links across the top was a menu that wrapped onto a second row and
 * made somebody read all of it to find the one thing they came for. Nearly all
 * of that reading was wasted: a church touches Plans, Songs and Media every
 * week, talks to each other most weeks, and opens the rest a handful of times a
 * year.
 *
 * So the weekly things are the menu, and everything else is behind one word.
 * That isn't hiding them — a list of eleven equal things hides all of them
 * equally, which is worse.
 */

type Item = { href: string; label: string; hint?: string };

/** What a church opens most Sundays. */
const OFTEN: Item[] = [
  { href: "/admin/services", label: "Plans" },
  { href: "/admin/songs", label: "Songs" },
  { href: "/admin/media", label: "Media" },
];

/** Talking to each other: everyone at once, or one person. */
const TALK: Item[] = [
  { href: "/admin/board", label: "Noticeboard", hint: "Everyone at the church" },
  { href: "/admin/inbox", label: "Messages", hint: "One person, like an internal email" },
];

/** Set up once, opened occasionally. */
const RARELY: Item[] = [
  { href: "/", label: "Library", hint: "Recordings the church has kept" },
  { href: "/admin", label: "Sermons", hint: "Add and publish a recording" },
  { href: "/admin/series", label: "Series", hint: "Group messages into a run" },
  { href: "/admin/social", label: "Social", hint: "Post to Facebook and Instagram" },
  { href: "/admin/people", label: "People", hint: "Who can get in, and invitations" },
  { href: "/download", label: "Display app", hint: "For the projector computer" },
];

/** Whether a link is the page you're on, or the section you're inside. */
function isCurrent(pathname: string, href: string): boolean {
  // Everything lives under /s/<tenant> once the proxy has rewritten it, so the
  // comparison is on what comes after the tenant.
  const path = pathname.replace(/^\/s\/[^/]+/, "") || "/";

  if (href === "/") return path === "/";
  // "/admin" is the sermons list and the parent of everything else; without
  // this it would light up on every admin page.
  if (href === "/admin") return path === "/admin" || path.startsWith("/admin/sermons");
  return path === href || path.startsWith(`${href}/`);
}

export default function ChurchNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const more = useRef<HTMLDivElement | null>(null);

  /**
   * Open, and the page it was opened on.
   *
   * Both in one piece of state so that moving to another page closes it as a
   * matter of arithmetic rather than as an effect that has to run and re-render
   * to say so. A menu still hanging open over the page you just navigated to is
   * a menu covering the thing you clicked towards.
   */
  const [opened, setOpened] = useState<string | null>(null);
  const shown = opened === pathname;

  useEffect(() => {
    if (!shown) return;
    const away = (event: MouseEvent) => {
      if (!more.current?.contains(event.target as Node)) setOpened(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpened(null);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [shown]);

  const link = (item: Item) => {
    const current = isCurrent(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={current ? "page" : undefined}
        className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
          current ? "bg-amber-700 text-white" : "hover:bg-stone-100 dark:hover:bg-stone-800"
        }`}
      >
        {item.label}
      </Link>
    );
  };

  if (!canManage) return null;

  const inMore = [...RARELY].some((item) => isCurrent(pathname, item.href));

  return (
    <nav className="flex items-center gap-1">
      {OFTEN.map(link)}
      <span className="mx-1 h-5 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />
      {TALK.map(link)}

      <div className="relative" ref={more}>
        <button
          type="button"
          onClick={() => setOpened(shown ? null : pathname)}
          aria-expanded={shown}
          aria-haspopup="menu"
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${
            inMore ? "bg-amber-700 text-white" : "hover:bg-stone-100 dark:hover:bg-stone-800"
          }`}
        >
          More <span aria-hidden>▾</span>
        </button>

        {shown ? (
          // With a line about each, because the difference between Library and
          // Sermons, or Noticeboard and Messages, is not obvious from the word.
          <div
            role="menu"
            className="absolute right-0 z-50 mt-1 w-72 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-700 dark:bg-stone-900"
          >
            {RARELY.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={`block px-3 py-2 hover:bg-stone-100 dark:hover:bg-stone-800 ${
                  isCurrent(pathname, item.href) ? "bg-amber-50 dark:bg-amber-950/40" : ""
                }`}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                {item.hint ? (
                  <span className="block text-xs text-stone-500">{item.hint}</span>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
