"use client";

import { useActionState, useState } from "react";
import {
  deleteBoardPostAction,
  postToBoardAction,
  type BoardState,
} from "@/lib/board/actions";
import type { BoardReply, BoardThread } from "@/lib/board/service";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/** "3 hours ago" beats a timestamp for anything written this week. */
function when(at: string): string {
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)} days ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function Post({
  post,
  tenant,
  canDelete,
}: {
  post: BoardReply;
  tenant: string;
  canDelete: boolean;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-stone-500">
        <span className="font-medium text-stone-700 dark:text-stone-300">
          {post.authorName}
        </span>{" "}
        · {when(post.at)}
        {canDelete ? (
          <>
            {" · "}
            <form action={deleteBoardPostAction} className="inline">
              <input type="hidden" name="tenant" value={tenant} />
              <input type="hidden" name="id" value={post.id} />
              <button type="submit" className="hover:text-red-600 dark:hover:text-red-400">
                delete
              </button>
            </form>
          </>
        ) : null}
      </p>
      <p className="text-sm whitespace-pre-wrap text-stone-800 dark:text-stone-200">
        {post.body}
      </p>
    </div>
  );
}

/**
 * The noticeboard: say something, and reply to what somebody else said.
 *
 * No titles, no categories, no tags. A church has one conversation at a time
 * and about eleven people in it, and every box that isn't the message is a box
 * that makes somebody use the group chat instead.
 */
export default function ChurchBoard({
  tenant,
  churchName,
  threads,
  viewerId,
  isOwner,
}: {
  tenant: string;
  churchName: string;
  threads: BoardThread[];
  viewerId: string;
  isOwner: boolean;
}) {
  const [state, post, pending] = useActionState<BoardState, FormData>(postToBoardAction, {});
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const mine = (post: BoardReply) => post.authorId === viewerId || isOwner;

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Noticeboard</h1>
        <p className="text-sm text-stone-500">
          For everyone with an account at {churchName} — who&rsquo;s on next Sunday, what
          the band needs, who has the keys. Nobody outside the church can read it.
        </p>
      </header>

      <form action={post} className="space-y-2">
        <input type="hidden" name="tenant" value={tenant} />
        <textarea
          name="body"
          rows={3}
          required
          placeholder="Say something to the team…"
          className={field}
        />
        {state.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </form>

      {threads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500 dark:border-stone-700">
          Nothing yet. First one sets the tone.
        </p>
      ) : (
        <ul className="space-y-4">
          {threads.map((thread) => (
            <li
              key={thread.id}
              className="space-y-3 rounded-xl border border-stone-200 p-4 dark:border-stone-800"
            >
              <Post post={thread} tenant={tenant} canDelete={mine(thread)} />

              {thread.replies.length > 0 ? (
                <ul className="space-y-3 border-l-2 border-stone-200 pl-4 dark:border-stone-800">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <Post post={reply} tenant={tenant} canDelete={mine(reply)} />
                    </li>
                  ))}
                </ul>
              ) : null}

              {replyTo === thread.id ? (
                <form action={post} className="space-y-2">
                  <input type="hidden" name="tenant" value={tenant} />
                  <input type="hidden" name="parentId" value={thread.id} />
                  <textarea
                    name="body"
                    rows={2}
                    required
                    autoFocus
                    placeholder="Reply…"
                    className={field}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyTo(thread.id)}
                  className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-500"
                >
                  Reply
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
