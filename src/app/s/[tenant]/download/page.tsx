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
        <h2 className="text-xl font-semibold">The quick way</h2>
        <p className="text-stone-700 dark:text-stone-300">
          Open <strong>Terminal</strong> on the projector computer &mdash; press ⌘Space,
          type &ldquo;terminal&rdquo;, press Enter &mdash; then paste this line and press
          Enter:
        </p>
        <pre className="overflow-x-auto rounded-xl bg-stone-900 px-4 py-3 text-sm text-stone-100">
          <code>{`curl -fsSL https://${church.slug}.churchviewer.com/downloads/install.sh | bash -s ${church.slug}`}</code>
        </pre>
        <p className="text-sm text-stone-500">
          That downloads it, installs it into Applications, sets it to fill the projector
          and open when the Mac starts up, and points it at {church.name}. It asks nothing.
          You can{" "}
          <a href="/downloads/install.sh" className="underline underline-offset-2">
            read the line-by-line
          </a>{" "}
          first if you&rsquo;d rather.
        </p>
      </section>

      <section className="space-y-4 border-t border-stone-200 pt-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">Or by hand</h2>
        <ol className="space-y-4 text-stone-700 dark:text-stone-300">
          <li>
            <strong>1.</strong> Download it above and double-click the zip to unpack it.
          </li>
          <li>
            <strong>2.</strong> Open <strong>Terminal</strong>, type{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
              bash
            </code>{" "}
            and a space, then drag <strong>install.command</strong> from the unpacked
            folder into the Terminal window and press Enter.
            <p className="pt-1 text-sm text-stone-500">
              Double-clicking it will refuse, and that is not a fault. macOS only opens
              downloaded software from developers who pay Apple a yearly fee, and this
              doesn&rsquo;t &mdash; so it has to be run by name rather than by
              double-click. Once installed, the app itself opens normally every time.
            </p>
          </li>
          <li>
            <strong>3.</strong> When it asks for your church, type{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
              {church.slug}
            </code>
            , and say yes to filling the projector and opening at startup.
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
