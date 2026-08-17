import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Supporting ChurchViewer",
  description: "What the server costs, and why nothing is asked of a church that can't spare it.",
};

/**
 * What it costs to run, said plainly.
 *
 * Figures are the published rates for what's actually running — one small VM,
 * its disks, an address, and a bucket — not a guess at a business. They're kept
 * here rather than in a spreadsheet nobody sees, because a request for money is
 * only fair if the person reading it can check the arithmetic.
 */
const LINES: { item: string; detail: string; monthly: string }[] = [
  {
    item: "The server",
    detail: "One small virtual machine (2 shared cores, 4GB) running the site and the worker",
    monthly: "~$17",
  },
  {
    item: "Its disks",
    detail: "10GB for the system, 100GB of working room for pulling audio out of video",
    monthly: "~$11",
  },
  { item: "The address", detail: "A fixed internet address for the domain to point at", monthly: "~$3" },
  { item: "The domain", detail: "churchviewer.com, paid yearly", monthly: "~$1" },
  {
    item: "Files",
    detail: "Recordings, slides and pictures. Pennies per church until it's years of video",
    monthly: "a few cents",
  },
  {
    item: "Transcription",
    detail: "Turning a recording into lyric slides, about half a cent a minute of audio",
    monthly: "~50¢ per busy church",
  },
];

export default function SupportPage() {
  const donate = env.donateUrl;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight">Keeping the lights on</h1>
        <p className="text-lg text-stone-600 dark:text-stone-400">
          ChurchViewer is free to use. There is no paid tier, no feature held back, and no plan to
          add either. It&apos;s run by one person who pays for the server.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What it costs to run</h2>
        <p className="text-stone-600 dark:text-stone-400">
          One server carries every church on it. These are the published rates for what&apos;s
          actually running, so the total barely moves whether there are two churches or twenty.
        </p>

        <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-stone-800">
          <table className="w-full min-w-lg text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-100 text-xs tracking-wide text-stone-600 uppercase dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
              <tr>
                <th className="px-4 py-3 font-medium">What</th>
                <th className="px-4 py-3 font-medium">Why</th>
                <th className="px-4 py-3 text-right font-medium">A month</th>
              </tr>
            </thead>
            <tbody>
              {LINES.map((line) => (
                <tr key={line.item} className="border-b border-stone-100 last:border-0 dark:border-stone-800/60">
                  <td className="px-4 py-3 font-medium">{line.item}</td>
                  <td className="px-4 py-3 text-stone-600 dark:text-stone-400">{line.detail}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{line.monthly}</td>
                </tr>
              ))}
              <tr className="bg-stone-50 font-semibold dark:bg-stone-900/60">
                <td className="px-4 py-3" colSpan={2}>
                  About
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">$32–35 a month</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-sm text-stone-500">
          Roughly $400 a year, paid by one person, whether anyone contributes or not.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">What we ask</h2>
        <p className="text-stone-600 dark:text-stone-400">
          <strong className="font-semibold">$5 a month, if your church can spare it.</strong> Seven
          churches at that covers the whole bill. It isn&apos;t a fee and it buys nothing — the
          software is the same either way.
        </p>

        {donate ? (
          <a
            href={donate}
            className="inline-block rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
          >
            Chip in
          </a>
        ) : (
          <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700">
            A donation link hasn&apos;t been set up yet. Ask whoever runs this server how best to
            help.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-stone-200 p-6 dark:border-stone-800">
        <h2 className="text-xl font-semibold">And if you can&apos;t, don&apos;t</h2>
        <p className="text-stone-600 dark:text-stone-400">
          Plenty of churches are one bad year from closing the doors — including the one this was
          built for. If money is tight, use it, put it on the projector on Sunday, and give nothing.
          Nothing is switched off, nothing is nagged about, and nobody is told.
        </p>
        <p className="text-stone-600 dark:text-stone-400">
          If it helps your church and you can&apos;t pay, that is the software doing its job.
        </p>
      </section>

      <section className="space-y-3 border-t border-stone-200 pt-8 dark:border-stone-800">
        <h2 className="text-xl font-semibold">Other ways to help</h2>
        <ul className="list-disc space-y-2 pl-5 text-stone-600 dark:text-stone-400">
          <li>Tell another church it exists.</li>
          <li>Say what broke, or what was confusing. That&apos;s worth more than five dollars.</li>
          <li>Send back a fix to the wording on a screen. Nobody proofreads their own slides.</li>
        </ul>
        <p className="pt-2 text-sm text-stone-500">
          <Link href="/" className="font-medium text-amber-700 hover:underline dark:text-amber-500">
            Back to the front page
          </Link>
        </p>
      </section>
    </div>
  );
}
