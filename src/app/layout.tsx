import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ChurchViewer",
    template: "%s · ChurchViewer",
  },
  description: "Give your church a home for its sermons — searchable, on demand.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
        {children}
      </body>
    </html>
  );
}
