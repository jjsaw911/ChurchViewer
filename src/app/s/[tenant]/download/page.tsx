import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stat } from "node:fs/promises";
import { getChurchBySlug } from "@/lib/churches";
import { getSetting, TESTFLIGHT_URL } from "@/lib/settings";

export const metadata: Metadata = { title: "The display app" };

/** Where nginx serves the packaged Mac app from. */
const DOWNLOAD = "/downloads/ChurchViewer-Display.zip";
const PACKAGED = "/srv/static/downloads/ChurchViewer-Display.zip";
const ANDROID = "/downloads/ChurchViewer-Remote.apk";
const ANDROID_PACKAGED = "/srv/static/downloads/ChurchViewer-Remote.apk";

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

  const [file, androidReady, testFlight] = await Promise.all([
    packaged(),
    stat(ANDROID_PACKAGED).then(
      () => true,
      () => false,
    ),
    getSetting(TESTFLIGHT_URL),
  ]);

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

      <section className="space-y-4 border-t border-stone-200 pt-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">The remote</h2>
        <p className="text-stone-700 dark:text-stone-300">
          What the person running the service holds. The buttons are big enough to hit in
          a dark room without looking, and the screen won&rsquo;t sleep during a song.
        </p>

        <div className="flex flex-wrap gap-3">
          {androidReady ? (
            <a
              href={ANDROID}
              className="rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-semibold hover:border-amber-400 dark:border-stone-700"
            >
              Download for Android
            </a>
          ) : null}

          {testFlight ? (
            <a
              href={testFlight}
              className="rounded-xl border border-stone-300 px-5 py-2.5 text-sm font-semibold hover:border-amber-400 dark:border-stone-700"
            >
              Get it for iPhone and iPad
            </a>
          ) : null}
        </div>

        {androidReady ? (
          <p className="text-sm text-stone-500">
            Android will ask whether to allow installing this, because it didn&rsquo;t come
            from the Play Store. Say yes to that one file. Open it, type{" "}
            <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">
              {church.slug}
            </code>
            , and sign in once.
          </p>
        ) : null}

        {testFlight ? (
          <p className="text-sm text-stone-500">
            The iPhone version comes through TestFlight, Apple&rsquo;s way of handing out
            an app before it&rsquo;s in the App Store. Install TestFlight first, then open
            that link.
          </p>
        ) : (
          <p className="text-sm text-stone-500">
            The iPhone version isn&rsquo;t being handed out yet. Anything with a browser
            works in the meantime.
          </p>
        )}

        <p className="text-sm text-stone-600 dark:text-stone-400">
          Or no app at all: open{" "}
          <code className="rounded bg-stone-100 px-1.5 py-0.5 text-sm dark:bg-stone-800">
            {church.slug}.churchviewer.com/present/today
          </code>{" "}
          on a phone, a tablet or a laptop and you have the same run sheet. Tap a box to
          put it up, Next to move, Start to play the recording.
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
