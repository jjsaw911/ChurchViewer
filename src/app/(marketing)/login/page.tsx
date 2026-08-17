import type { Metadata } from "next";
import Link from "next/link";
import GoogleButton from "@/components/auth/GoogleButton";
import LoginForm from "@/components/auth/LoginForm";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-8">
      <h1 className="text-3xl font-semibold">Log in</h1>

      {error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {typeof error === "string" ? error : "Something went wrong signing in."}
        </p>
      ) : null}

      {env.google.isConfigured ? (
        <div className="space-y-4">
          <GoogleButton />
          <div className="flex items-center gap-3 text-xs text-stone-500">
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
            or
            <span className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
          </div>
        </div>
      ) : null}

      <LoginForm next={typeof next === "string" ? next : undefined} />

      <p className="text-sm text-stone-600 dark:text-stone-400">
        New here?{" "}
        <Link
          href="/register"
          className="text-amber-700 underline underline-offset-2 dark:text-amber-500"
        >
          Register your church
        </Link>
      </p>
    </div>
  );
}
