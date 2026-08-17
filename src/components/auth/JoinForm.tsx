"use client";

import { useActionState } from "react";
import { joinChurchAction, type FormState } from "@/lib/auth/actions";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/**
 * Email, password, in. Sized for a thumb, because this is opened on a phone
 * from a text message roughly always.
 */
export default function JoinForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinChurchAction, {});

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

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
          defaultValue={state.values?.email ?? ""}
          className={field}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Choose a password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          className={field}
        />
      </div>

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-700 px-5 py-3 text-base font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Setting you up…" : "Join"}
      </button>
    </form>
  );
}
