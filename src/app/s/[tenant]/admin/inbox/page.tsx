import type { Metadata } from "next";
import Link from "next/link";
import { requireChurchAccess } from "@/lib/admin/guard";
import { churchPeople, conversations } from "@/lib/dm/service";

export const metadata: Metadata = { title: "Messages" };

/** `3 hours ago` beats a timestamp for anything from this week. */
function when(at: string): string {
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} days ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/**
 * A list of people, not a list of messages.
 *
 * An inbox sorted by time is the thing everybody is already drowning in. This
 * is who you have been talking to, and underneath, everybody else you could.
 */
export default async function InboxPage({ params }: PageProps<"/s/[tenant]/admin/inbox">) {
  const { tenant } = await params;
  const { church, user } = await requireChurchAccess(tenant);

  const [talking, everyone] = await Promise.all([
    conversations(church.id, user.id),
    churchPeople(church.id, user.id),
  ]);

  const started = new Set(talking.map((one) => one.id));
  const rest = everyone.filter((person) => !started.has(person.id));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Messages</h1>
        <p className="text-sm text-stone-500">
          One person to one person, inside {church.name}. For &ldquo;can you swap
          Sunday&rdquo; &mdash; the things nobody wants to post to everybody.
        </p>
      </header>

      {talking.length > 0 ? (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
          {talking.map((person) => (
            <li key={person.id}>
              <Link
                href={`/admin/inbox/${person.id}`}
                className="flex items-center gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-900"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{person.name}</span>
                    {person.unread > 0 ? (
                      <span className="rounded-full bg-amber-700 px-2 py-0.5 text-xs font-semibold text-white">
                        {person.unread}
                      </span>
                    ) : null}
                  </span>
                  <span className="block truncate text-sm text-stone-500">
                    {person.latest}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-stone-500">{when(person.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-semibold">
          {talking.length > 0 ? "Everybody else here" : `Everybody at ${church.name}`}
        </h2>

        {rest.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700">
            Nobody else has an account yet. Invite somebody from People.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {rest.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/admin/inbox/${person.id}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-stone-50 dark:hover:bg-stone-900"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{person.name || person.email}</span>
                    <span className="block truncate text-sm text-stone-500">
                      {person.email} · {person.role}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-amber-700 dark:text-amber-500">
                    Message
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
