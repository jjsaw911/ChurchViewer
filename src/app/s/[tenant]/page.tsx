import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SermonLibrary from "@/components/SermonLibrary";
import { listSermons, listSeries, listSpeakers } from "@/lib/content";
import { formatDate, formatDuration } from "@/lib/format";
import { getChurchBySlug } from "@/lib/churches";
import { hasChurchAccess } from "@/lib/admin/guard";

export async function generateMetadata({ params }: PageProps<"/s/[tenant]">): Promise<Metadata> {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) return { title: "Not found" };
  return {
    title: { absolute: `${church.name} · Sermons` },
    description: church.tagline || `Recorded services from ${church.name}.`,
  };
}

export default async function LibraryPage({ params }: PageProps<"/s/[tenant]">) {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();
  // Nobody outside this church renders any of it — see `hasChurchAccess`.
  if (!(await hasChurchAccess(church.id))) return null;


  const [sermons, series, speakers] = await Promise.all([
    listSermons(church.id),
    listSeries(church.id),
    listSpeakers(church.id),
  ]);

  const latest = sermons[0];

  /**
   * The front door.
   *
   * Somebody typing the church's address is one of two people. A member, on a
   * Sunday morning, who wants the run sheet — and used to land on a sermon
   * library with no way to sign in at all, which is how a volunteer decides the
   * account they were handed doesn't work. Or a visitor looking for a message
   * they missed, who should still find one if the church publishes them.
   *
   * So: what you can do here, first, and the library underneath it.
   */
  /**
   * Where somebody who works here actually wants to go.
   *
   * Nobody without an account reaches this page — the layout puts a door in
   * front of the whole address — so this is a staff landing rather than a front
   * page: the three things anybody types this address to do.
   */
  const doorway = (
    <section className="mx-auto max-w-lg space-y-5 py-10 text-center">
      <h1 className="text-3xl font-semibold">{church.name}</h1>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/present/today"
          className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Run today&rsquo;s service
        </Link>
        <Link
          href="/admin/services"
          className="rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
        >
          Plans
        </Link>
        <Link
          href="/admin/board"
          className="rounded-lg border border-stone-300 px-5 py-2.5 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
        >
          Noticeboard
        </Link>
      </div>
    </section>
  );

  if (!latest) {
    return (
      <div className="space-y-8">
        {doorway}

        <p className="mx-auto max-w-lg text-center text-sm text-stone-500">
          Below this is the recordings library &mdash; messages the church has kept, for
          anybody here who wants to hear one again. Nothing has been added to it yet;
          recordings go in under Messages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {doorway}

      <section className="grid gap-8 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8 md:grid-cols-2 md:items-center dark:border-stone-800 dark:bg-stone-900">
        <div className="space-y-4">
          <p className="text-xs font-semibold tracking-widest text-amber-700 uppercase dark:text-amber-500">
            Most recent
          </p>
          <h1 className="text-3xl font-semibold text-balance">{latest.title}</h1>
          <p className="text-stone-600 dark:text-stone-400">
            {latest.speaker} &middot; {formatDate(latest.date)} &middot;{" "}
            {formatDuration(latest.durationSeconds)}
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={`/sermons/${latest.slug}`}
              className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
            >
              {latest.mediaKind === "video" ? "Watch now" : "Listen now"}
            </Link>
            {latest.seriesSlug ? (
              <Link
                href={`/series/${latest.seriesSlug}`}
                className="text-sm font-medium underline underline-offset-4 hover:text-amber-700 dark:hover:text-amber-500"
              >
                Full series: {latest.seriesTitle}
              </Link>
            ) : null}
          </div>
        </div>

        <Link
          href={`/sermons/${latest.slug}`}
          className="block overflow-hidden rounded-xl bg-stone-200 dark:bg-stone-800"
        >
          {latest.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={latest.posterUrl} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="aspect-video w-full" />
          )}
        </Link>
      </section>

      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Browse the library</h2>
        <SermonLibrary sermons={sermons} series={series} speakers={speakers} />
      </div>
    </div>
  );
}
