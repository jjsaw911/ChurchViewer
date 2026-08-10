"use client";

import { useActionState } from "react";
import { changeOwnPasswordAction, type FormState } from "@/lib/auth/actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/**
 * Choosing your own password.
 *
 * The current one is asked for unless somebody else set it — a person who was
 * handed a temporary password across a table on Sunday morning may well not
 * remember it two minutes later, and making them type it back proves nothing
 * that the session cookie hasn't already proved.
 */
export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changeOwnPasswordAction,
    {},
  );

  return (
    <form action={action} className="space-y-4">
      {!forced ? (
        <div className="space-y-1.5">
          <label htmlFor="current" className="text-sm font-medium">
            Your current password
          </label>
          <input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            className={field}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          New password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
        <p className="text-xs text-stone-500">At least 10 characters.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Type it again
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
      </div>

      {state.error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save my password"}
      </button>
    </form>
  );
}
