import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stat } from "node:fs/promises";
import { getChurchBySlug } from "@/lib/churches";

export const metadata: Metadata = { title: "The display app" };

/** Where nginx serves the packaged Mac app from. */
const DOWNLOAD = "/downloads/ChurchViewer-Display.zip";
const PACKAGED = "/srv/static/downloads/ChurchViewer-Display.zip";

/**
 * How big it is and when it was built, read off the file itself.
 *
 * Written down nowhere: a version number in the page and a different one in the
 * zip is worse than no version number, and this can't drift.
 */
async function packaged(): Promise<{ size: string; built: string } | null> {
  try {
    const file = await stat(PACKAGED);
    return {
      size: `${Math.max(1, Math.round(file.size / 1024 / 102.4) / 10)} MB`,
      built: file.mtime.toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }),
    };
  } catch {
    // Not deployed to this machine — the link still works if nginx has it.
    return null;
  }
}

/**
 * The page a church sends somebody to when the projector computer needs
 * setting up.
 *
 * Public on purpose. The person who does this is a volunteer with the keys to
 * the building, not necessarily anybody with an account, and asking them to log
 * in before they can download the thing that asks them to log in is a circle.
 */
export default async function DownloadPage({ params }: PageProps<"/s/[tenant]/download">) {
  const { tenant } = await params;
  const church = await getChurchBySlug(tenant);
  if (!church) notFound();

  const file = await packaged();

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">The display app</h1>
        <p className="text-stone-600 dark:text-stone-400">
          For the computer wired to the projector at {church.name}. It shows the words and
          plays the recordings; the service is driven from a phone, an iPad, or another
          computer.
        </p>
      </header>

      <div className="space-y-3">
        <a
          href={DOWNLOAD}
          className="inline-block rounded-xl bg-amber-700 px-6 py-3 text-base font-semibold text-white hover:bg-amber-800"
        >
          Download for Mac
        </a>
        <p className="text-sm text-stone-500">
          {file ? `${file.size} · built ${file.built} · ` : ""}macOS 13 or newer, Apple
          silicon.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Setting it up</h2>
        <ol className="space-y-4 text-stone-700 dark:text-stone-300">
          <li>
            <strong>1.</strong> Unzip it, then <strong>right-click</strong>{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
              install.command
            </code>{" "}
            and choose <strong>Open</strong>.
            <p className="pt-1 text-sm text-stone-500">
              Double-clicking will refuse, and that is not a fault. macOS only trusts
              software from developers who pay Apple a yearly fee, and this doesn&rsquo;t —
              right-click and Open is how you say you know where it came from. It happens
              once.
            </p>
          </li>
          <li>
            <strong>2.</strong> When it asks for your church, type{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
              {church.slug}
            </code>
            .
          </li>
          <li>
            <strong>3.</strong> Say yes to filling the projector, and yes to opening at
            startup.
          </li>
          <li>
            <strong>4.</strong> Sign in once with a {church.name} account. It stays signed
            in.
          </li>
          <li>
            <strong>5.</strong> Press <strong>⌘,</strong> and choose which screen is the
            projector.
          </li>
        </ol>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          After that it looks after itself. Every Sunday it shows whatever service{" "}
          {church.name} has planned for that day, without anybody changing a setting.
        </p>
      </section>

      <section className="space-y-3 border-t border-stone-200 pt-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">Driving it</h2>
        <p className="text-stone-700 dark:text-stone-300">
          Anything with a browser. Open{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
            {church.slug}.churchviewer.com/present/today
          </code>{" "}
          on a phone, an iPad or a laptop and you have the run sheet: tap a box to put it
          up, Next to move, Start to play the recording. Nothing to install.
        </p>
        <p className="text-sm text-stone-500">
          There&rsquo;s a native iPad and iPhone remote as well, with bigger buttons for a
          dark room. It isn&rsquo;t on the App Store yet, so it has to be installed from a
          Mac with Xcode — ask whoever set this up.
        </p>
      </section>

      <section className="space-y-3 border-t border-stone-200 pt-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">Windows and older Macs</h2>
        <p className="text-stone-700 dark:text-stone-300">
          There is no Windows build yet. Anything with a browser can still be the display:
          open{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
            {church.slug}.churchviewer.com/present/today/screen
          </code>
          , sign in, click the page once so it&rsquo;s allowed to play sound, and press F
          to fill the screen. The app only adds the things a browser can&rsquo;t do:
          opening by itself, keeping the screens awake, and starting the music without
          being clicked first.
        </p>
      </section>
    </div>
  );
}
