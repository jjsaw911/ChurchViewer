"use client";

import { useActionState } from "react";
import { sendDirectMessageAction, type MessageState } from "@/lib/dm/actions";
import type { DirectMessage } from "@/lib/dm/service";

/**
 * What was said, and a box to say more.
 *
 * Mine on the right, theirs on the left — the arrangement everybody already
 * knows from every phone, which is the point: nobody should have to work out
 * how to read this.
 */
export default function Conversation({
  tenant,
  toUserId,
  viewerId,
  messages,
}: {
  tenant: string;
  toUserId: string;
  viewerId: string;
  messages: DirectMessage[];
}) {
  const [state, send, pending] = useActionState<MessageState, FormData>(
    sendDirectMessageAction,
    {},
  );

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500 dark:border-stone-700">
          Nothing yet. Say something.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((message) => {
            const mine = message.fromUserId === viewerId;
            return (
              <li key={message.id} className={mine ? "flex justify-end" : "flex"}>
                <div
                  className={`max-w-[80%] space-y-1 rounded-2xl px-4 py-2 ${
                    mine
                      ? "bg-amber-700 text-white"
                      : "bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                  <p className={`text-[0.65rem] ${mine ? "text-white/70" : "text-stone-500"}`}>
                    {new Date(message.at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={send} className="space-y-2">
        <input type="hidden" name="tenant" value={tenant} />
        <input type="hidden" name="toUserId" value={toUserId} />
        <textarea
          name="body"
          rows={3}
          required
          placeholder="Write a message…"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900"
        />
        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
