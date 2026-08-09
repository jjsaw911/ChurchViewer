import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-3xl font-semibold">We couldn&rsquo;t find that</h1>
      <p className="text-stone-600 dark:text-stone-400">
        The recording may have moved, or the link may be out of date.
      </p>
      <Link
        href="/"
        className="inline-block rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
      >
        Back to the library
      </Link>
    </div>
  );
}
