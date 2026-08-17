"use client";

import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "@/lib/auth/actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export default function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    resetPasswordAction,
    {},
  );

  const errorFor = (name: string) =>
    state.field === name ? (
      <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
    ) : null;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          className={field}
        />
        <p className="text-xs text-stone-500">At least 10 characters.</p>
        {errorFor("password")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Confirm
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          className={field}
        />
        {errorFor("confirm")}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
