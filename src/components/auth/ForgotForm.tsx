"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type FormState } from "@/lib/auth/actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export default function ForgotForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    requestPasswordResetAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          autoFocus
          className={field}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      {state.values?.sent ? (
        <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
          {state.values.sent}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-700 px-5 py-3 text-base font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send me a link"}
      </button>
    </form>
  );
}
