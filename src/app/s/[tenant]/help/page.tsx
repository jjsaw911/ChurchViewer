import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireChurchAccess } from "@/lib/admin/guard";

export const metadata: Metadata = { title: "How to run a service" };

/**
 * The walkthrough, with pictures of this actual app rather than drawings of it.
 *
 * Written for the person handed a tablet on a Sunday morning who has never seen
 * any of this before, which is nearly always who ends up running it. Everything
 * is in the order it happens on the day, and nothing explains a screen they
 * won't meet.
 */
export default async function HelpPage({ params }: PageProps<"/s/[tenant]/help">) {
  const { tenant } = await params;
  const { church } = await requireChurchAccess(tenant);

  const shot = (src: string, alt: string, caption: string) => (
    <figure className="space-y-2">
      <Image
        src={src}
        alt={alt}
        width={825}
        height={1100}
        className="w-full rounded-xl border border-stone-200 shadow-sm dark:border-stone-800"
      />
      <figcaption className="text-sm text-stone-500">{caption}</figcaption>
    </figure>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Running a service</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Everything in the order it happens on a Sunday. If somebody has handed you a
          tablet and walked off, start at step three &mdash; the first two are already done.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">1. The computer at the projector</h2>
        <p className="text-stone-700 dark:text-stone-300">
          One machine is wired to the projector and shows the words. It runs the display
          app, which you install once and then leave alone &mdash; it opens by itself and
          finds whichever service {church.name} has planned for that day.
        </p>
        <p className="text-stone-700 dark:text-stone-300">
          Setting it up is on the{" "}
          <Link href="/download" className="text-amber-700 underline underline-offset-2">
            display app page
          </Link>
          . Nothing else in this guide needs that machine touched again.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">2. What you hold</h2>
        <p className="text-stone-700 dark:text-stone-300">
          A phone, a tablet or a laptop. Either open{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
            {church.slug}.churchviewer.com/present/today
          </code>{" "}
          in a browser, or install the remote from the{" "}
          <Link href="/download" className="text-amber-700 underline underline-offset-2">
            same page
          </Link>{" "}
          &mdash; it asks for the church&rsquo;s name once and then always opens on the
          right service.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">3. The service, as a list of boxes</h2>
        <p className="text-stone-700 dark:text-stone-300">
          Every part of the morning is a box, in order, with a small picture of exactly
          what the screen will show. Whatever is live opens out &mdash; that is the one you
          can read from arm&rsquo;s length, and its controls are inside it.
        </p>
        {shot(
          "/help/runsheet.png",
          "The run sheet with one item live and the rest listed below",
          "The message is live. Everything else has stepped back until its turn.",
        )}
        <p className="text-stone-700 dark:text-stone-300">
          The green dot at the top says the projector is connected. If it is red, nothing
          you press will reach a screen &mdash; that is the first thing to check, and it
          usually means the display app isn&rsquo;t open on the church computer.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">4. Putting something up</h2>
        <p className="text-stone-700 dark:text-stone-300">
          Tap a box and it asks first. Nothing has reached the room yet.
        </p>
        {shot(
          "/help/confirm.png",
          "A box tapped, showing Put it up and start, or Cancel",
          "The second press is the one that does something. It forgets the question after ten seconds.",
        )}
        <p className="text-stone-700 dark:text-stone-300">
          <strong>Put it up and start</strong> does the whole thing at once: the words go
          on the screen, and if it&rsquo;s a song, the recording starts playing on the
          church computer and the slides follow the music by themselves. You don&rsquo;t
          press anything during the song.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">5. Moving through it</h2>
        <ul className="space-y-2 text-stone-700 dark:text-stone-300">
          <li>
            <strong>Next</strong> moves a slide. At the end of one part it moves into the
            next one, and the button says where it&rsquo;s about to go.
          </li>
          <li>
            <strong>Back</strong> is the way out of a press too many &mdash; it crosses
            backwards the same way.
          </li>
          <li>
            <strong>Play</strong> starts or stops a recording. It goes grey when what&rsquo;s
            on screen has no recording.
          </li>
          <li>
            <strong>Blank</strong> makes the screen black. Use it during the sermon, or any
            time the room shouldn&rsquo;t be reading. The button fills in while it&rsquo;s
            blanked.
          </li>
        </ul>
        <p className="text-sm text-stone-500">
          On a laptop: space or the right arrow for next, backspace or the left arrow for
          back, <strong>B</strong> to blank, <strong>P</strong> to play or pause.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">6. Practising without the room seeing</h2>
        <p className="text-stone-700 dark:text-stone-300">
          <strong>Run through it</strong>, at the top of the run sheet, walks the entire
          service &mdash; every slide of every song, the message, the lot &mdash; in a
          window that never reaches the projector. It is the way to check on a Thursday
          that everything is there and spelled right.
        </p>
      </section>

      <section className="space-y-4 border-t border-stone-200 pt-8 dark:border-stone-800">
        <h2 className="text-xl font-semibold">When something looks wrong</h2>
        <dl className="space-y-4 text-stone-700 dark:text-stone-300">
          <div>
            <dt className="font-medium">Nothing happens when I press Next</dt>
            <dd className="text-sm text-stone-600 dark:text-stone-400">
              Look at the dot. Red means no screen is connected &mdash; open the display app
              on the church computer.
            </dd>
          </div>
          <div>
            <dt className="font-medium">I pressed Start and there&rsquo;s no music</dt>
            <dd className="text-sm text-stone-600 dark:text-stone-400">
              The timer under the box tells you the truth: if it&rsquo;s counting, sound is
              coming out somewhere and the problem is the sound desk. If it says the screen
              hasn&rsquo;t started it, press <strong>Reload the screen</strong> beside that
              message.
            </dd>
          </div>
          <div>
            <dt className="font-medium">The screen is stuck on the last song</dt>
            <dd className="text-sm text-stone-600 dark:text-stone-400">
              Press <strong>Blank</strong>. Parts with nothing to show &mdash; a prayer, the
              notices you didn&rsquo;t write slides for &mdash; leave whatever was up before.
            </dd>
          </div>
          <div>
            <dt className="font-medium">I&rsquo;m on the wrong service</dt>
            <dd className="text-sm text-stone-600 dark:text-stone-400">
              <strong>Plans</strong> lists every service. Both the remote and the projector
              open on today&rsquo;s by themselves, so this is usually only for a second
              service in one day.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
