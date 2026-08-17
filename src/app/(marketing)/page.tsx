import Link from "next/link";
import { env } from "@/lib/env";

const features = [
  {
    title: "Your own address",
    body: "Every church gets its own site — yourchurch.churchviewer.com — with its own library, series, and branding.",
  },
  {
    title: "Video and audio",
    body: "Upload the recording or paste a link. The player remembers where each listener stopped and offers to pick it back up.",
  },
  {
    title: "Findable",
    body: "Search across titles, speakers, and passages. Group messages into series so a whole study stays together.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-20">
      <section className="mx-auto max-w-2xl space-y-6 text-center">
        <h1 className="text-4xl font-semibold text-balance sm:text-5xl">
          A home for your church&rsquo;s sermons
        </h1>
        <p className="text-lg text-stone-600 dark:text-stone-400">
          Register your church, upload the recordings, and hand your congregation one link. No
          plugins, no wrestling with a website.
        </p>
        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <Link
            href="/register"
            className="rounded-lg bg-amber-700 px-6 py-3 font-semibold text-white hover:bg-amber-800"
          >
            Register your church
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-stone-300 px-6 py-3 font-semibold hover:border-amber-400 dark:border-stone-700"
          >
            Log in
          </Link>
        </div>
        <p className="text-sm text-stone-500">
          Your site lives at <span className="font-medium">yourchurch.{env.rootDomain}</span>
        </p>
      </section>

      <section className="grid gap-8 sm:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="space-y-2">
            <h2 className="font-semibold">{feature.title}</h2>
            <p className="text-sm text-stone-600 dark:text-stone-400">{feature.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
