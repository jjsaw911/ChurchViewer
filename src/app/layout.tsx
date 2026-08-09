import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ChurchViewer",
    template: "%s · ChurchViewer",
  },
  description: "Watch and listen to services, sermons, and series.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Church<span className="text-amber-700 dark:text-amber-500">Viewer</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm font-medium">
              <Link href="/" className="hover:text-amber-700 dark:hover:text-amber-500">
                Library
              </Link>
              <Link href="/series" className="hover:text-amber-700 dark:hover:text-amber-500">
                Series
              </Link>
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>

        <footer className="border-t border-stone-200 py-6 dark:border-stone-800">
          <div className="mx-auto max-w-6xl px-6 text-sm text-stone-500">
            ChurchViewer &middot; recorded services, on demand.
          </div>
        </footer>
      </body>
    </html>
  );
}
