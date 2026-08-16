import { rootUrl, tenantUrl } from "@/lib/env";

/**
 * What a church's address shows to anybody who isn't in that church.
 *
 * This is a tool for the people who plan and run services, not a website for a
 * congregation — so the front door is a door. It gives away the church's name,
 * which is already in the address, and nothing else: not the plans, not the
 * songs, not who is on next Sunday.
 *
 * The way in carries where they were going, so signing in returns somebody to
 * the page they were sent rather than dropping them at a list.
 */
export default function ChurchDoor({
  name,
  slug,
  tagline,
  path = "/",
}: {
  name: string;
  slug: string;
  tagline?: string | null;
  path?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold">{name}</h1>
          {tagline ? <p className="text-stone-600 dark:text-stone-400">{tagline}</p> : null}
        </div>

        <a
          href={`${rootUrl("/login")}?next=${encodeURIComponent(tenantUrl(slug, path))}`}
          className="inline-block w-full rounded-xl bg-amber-700 px-6 py-3 text-base font-semibold text-white hover:bg-amber-800"
        >
          Sign in
        </a>

        <p className="text-sm text-stone-500">
          For the people who plan and run services here. If you should have an account,
          ask somebody at the church to send you a link.
        </p>

        <p className="text-xs text-stone-400 dark:text-stone-600">
          <a href={rootUrl("/")} className="hover:underline">
            ChurchViewer
          </a>
        </p>
      </div>
    </div>
  );
}
