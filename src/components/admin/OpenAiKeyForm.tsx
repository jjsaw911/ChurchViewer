"use client";

import { useActionState } from "react";
import {
  clearOpenAiKeyAction,
  saveOpenAiKeyAction,
  type PlatformState,
} from "@/lib/admin/platform-actions";

/**
 * Where the OpenAI key gets set.
 *
 * The box is a password field and the key is never sent back down — once it's
 * saved, all this page can tell you is that there is one and how it ends. If
 * you can't tell which key is in there from the last four characters, replace
 * it; that's cheaper than a screen that could leak it.
 */
export default function OpenAiKeyForm({
  /** Last four characters of the stored key, or null when there isn't one. */
  hint,
  /** True when the server's environment sets the key, which wins over this. */
  fromEnvironment,
}: {
  hint: string | null;
  fromEnvironment: boolean;
}) {
  const [saveState, save, saving] = useActionState<PlatformState, FormData>(
    saveOpenAiKeyAction,
    {},
  );
  const [clearState, clear, clearing] = useActionState<PlatformState, FormData>(
    clearOpenAiKeyAction,
    {},
  );
  const state = saveState.error || saveState.ok ? saveState : clearState;

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div>
        <h2 className="font-semibold">Transcription</h2>
        <p className="text-sm text-stone-500">
          The OpenAI key the platform transcribes with. Without one, recordings still get their
          audio pulled out of video — they just don&apos;t become slides.
        </p>
      </div>

      {fromEnvironment ? (
        <p className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm dark:border-stone-800 dark:bg-stone-900">
          A key is set in the server&apos;s environment, and that one wins. Remove
          <code className="mx-1 rounded bg-stone-200 px-1 dark:bg-stone-800">OPENAI_API_KEY</code>
          from <code className="rounded bg-stone-200 px-1 dark:bg-stone-800">.env.local</code> to
          manage it here instead.
        </p>
      ) : null}

      <form action={save} className="flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 space-y-1 text-xs">
          <span className="block font-medium">
            {hint ? "Replace the key" : "Paste the key"}
          </span>
          <input
            name="apiKey"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-…"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 font-mono text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save key"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-stone-500">
          {hint ? (
            <>
              Stored key ends <span className="font-mono">{hint}</span>
            </>
          ) : (
            "No key stored."
          )}
        </span>
        {hint ? (
          <form action={clear}>
            <button
              type="submit"
              disabled={clearing}
              className="font-medium text-red-700 hover:underline disabled:opacity-60 dark:text-red-400"
            >
              {clearing ? "Removing…" : "Remove it"}
            </button>
          </form>
        ) : null}
      </div>

      {state.scope === "openai" && state.error ? (
        <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
      ) : null}
      {state.scope === "openai" && state.ok ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.ok}</p>
      ) : null}

      <p className="text-xs text-stone-500">
        Kept on the server and used to call OpenAI. It is never sent back to this page, and the
        worker picks up a change on its next job — nothing needs restarting.
      </p>
    </section>
  );
}
