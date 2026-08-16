"use client";

import { useActionState, useState } from "react";
import MediaField from "@/components/admin/MediaField";
import {
  disconnectAccountAction,
  publishPostAction,
  type SocialState,
} from "@/lib/social/actions";

type Account = {
  id: string;
  platform: "facebook" | "instagram";
  name: string;
  brokenReason: string | null;
};

type Post = {
  id: string;
  platform: string;
  accountName: string;
  message: string;
  status: string;
  error: string | null;
  at: string;
};

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/**
 * One post, going to the church's pages.
 *
 * Composer and history on one screen, because the question after pressing post
 * is always "did that actually go out" — and the answer belongs underneath the
 * button rather than on Facebook.
 */
export default function SocialComposer({
  tenant,
  churchName,
  accounts,
  configured,
  canConnect,
  uploadsEnabled,
  posts,
}: {
  tenant: string;
  churchName: string;
  accounts: Account[];
  configured: boolean;
  canConnect: boolean;
  uploadsEnabled: boolean;
  posts: Post[];
}) {
  const [state, action, pending] = useActionState<SocialState, FormData>(publishPostAction, {});
  const [chosen, setChosen] = useState<string[]>(accounts.map((account) => account.id));
  const [message, setMessage] = useState("");

  const instagramChosen = accounts.some(
    (account) => account.platform === "instagram" && chosen.includes(account.id),
  );

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">Social</h1>
        <p className="text-sm text-stone-500">
          Write it once and put it on {churchName}&rsquo;s pages. Nothing here posts on its
          own &mdash; somebody writes the words and presses the button.
        </p>
      </header>

      {!configured ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          Posting isn&rsquo;t switched on for ChurchViewer yet. It needs a Facebook app
          registered once for the whole site &mdash; ask whoever runs ChurchViewer.
        </p>
      ) : accounts.length === 0 ? (
        <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
          <h2 className="text-lg font-semibold">Connect a page</h2>
          <p className="text-sm text-stone-600 dark:text-stone-400">
            A Facebook Page, and the Instagram profile attached to it if there is one. A
            personal profile can&rsquo;t be posted to &mdash; Facebook only allows this for
            pages, which is what a church has anyway.
          </p>
          {canConnect ? (
            <a
              href={`/api/social/connect?tenant=${encodeURIComponent(tenant)}`}
              className="inline-block rounded-lg bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110"
            >
              Connect with Facebook
            </a>
          ) : (
            <p className="text-sm text-stone-500">An owner has to do this one.</p>
          )}
        </section>
      ) : (
        <form action={action} className="space-y-5">
          <input type="hidden" name="tenant" value={tenant} />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Where it goes</legend>
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const on = chosen.includes(account.id);
                return (
                  <label
                    key={account.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      on
                        ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
                        : "border-stone-300 dark:border-stone-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="accountIds"
                      value={account.id}
                      checked={on}
                      onChange={(event) =>
                        setChosen((current) =>
                          event.target.checked
                            ? [...current, account.id]
                            : current.filter((id) => id !== account.id),
                        )
                      }
                      className="accent-amber-700"
                    />
                    <span>{account.name}</span>
                    <span className="text-xs text-stone-500">
                      {account.platform === "instagram" ? "Instagram" : "Facebook"}
                    </span>
                  </label>
                );
              })}
            </div>

            {accounts.some((account) => account.brokenReason) ? (
              <p className="text-xs text-red-600 dark:text-red-400">
                {accounts
                  .filter((account) => account.brokenReason)
                  .map((account) => `${account.name}: ${account.brokenReason}`)
                  .join(" · ")}{" "}
                — reconnecting usually fixes it.
              </p>
            ) : null}
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">What it says</span>
            <textarea
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={5}
              placeholder={"Join us this Sunday at 10:30 — everyone welcome."}
              className={field}
            />
          </label>

          <MediaField
            name="mediaSrc"
            label="Picture"
            tenant={tenant}
            accept="image/*"
            kinds={["image"]}
            uploadsEnabled={uploadsEnabled}
            hint={
              instagramChosen
                ? "Instagram will not take a post without one. Facebook will."
                : "Optional on Facebook. Instagram won't post without one."
            }
          />

          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              Link <span className="font-normal text-stone-500">(Facebook only)</span>
            </span>
            <input name="linkUrl" placeholder="https://…" className={field} />
          </label>

          {state.error ? (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {state.error}
            </p>
          ) : null}
          {state.ok ? (
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
              {state.ok}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={pending || chosen.length === 0}
              className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {pending ? "Posting…" : "Post it"}
            </button>
            <span className="text-xs text-stone-500">
              This goes out immediately, to everyone who follows those pages.
            </span>
          </div>
        </form>
      )}

      {accounts.length > 0 && canConnect ? (
        <section className="space-y-2 border-t border-stone-200 pt-6 dark:border-stone-800">
          <h2 className="font-semibold">Connected pages</h2>
          <ul className="space-y-2">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {account.name}{" "}
                  <span className="text-stone-500">
                    · {account.platform === "instagram" ? "Instagram" : "Facebook"}
                  </span>
                </span>
                <form action={disconnectAccountAction}>
                  <input type="hidden" name="tenant" value={tenant} />
                  <input type="hidden" name="accountId" value={account.id} />
                  <button
                    type="submit"
                    className="text-stone-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    Disconnect
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <a
            href={`/api/social/connect?tenant=${encodeURIComponent(tenant)}`}
            className="inline-block text-sm text-amber-700 underline underline-offset-2 dark:text-amber-500"
          >
            Connect another, or reconnect
          </a>
        </section>
      ) : null}

      {posts.length > 0 ? (
        <section className="space-y-3 border-t border-stone-200 pt-6 dark:border-stone-800">
          <h2 className="font-semibold">What has gone out</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
            {posts.map((post) => (
              <li key={post.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <span
                    className={
                      post.status === "posted"
                        ? "font-medium text-emerald-700 dark:text-emerald-500"
                        : "font-medium text-red-600 dark:text-red-400"
                    }
                  >
                    {post.status === "posted" ? "Posted" : "Failed"}
                  </span>
                  <span>· {post.accountName}</span>
                  <span>· {new Date(post.at).toLocaleString()}</span>
                </div>
                <p className="line-clamp-2 text-stone-700 dark:text-stone-300">
                  {post.message || "(picture only)"}
                </p>
                {post.error ? (
                  <p className="text-xs text-red-600 dark:text-red-400">{post.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
