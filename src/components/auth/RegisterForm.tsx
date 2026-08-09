"use client";

import { useActionState, useState } from "react";
import { registerAction, type FormState } from "@/lib/auth/actions";
import { slugify } from "@/lib/tenant";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

type Props = {
  /** When someone is already signed in we only need the church details. */
  needsAccount: boolean;
  rootDomain: string;
};

export default function RegisterForm({ needsAccount, rootDomain }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  const [churchName, setChurchName] = useState("");
  const [slug, setSlug] = useState("");
  // Until it's edited by hand, the address just follows the church name.
  const [slugTouched, setSlugTouched] = useState(false);
  const address = slugTouched ? slugify(slug) : slugify(churchName);

  const errorFor = (name: string) =>
    state.field === name ? (
      <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
    ) : null;

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="churchName" className="text-sm font-medium">
          Church name
        </label>
        <input
          id="churchName"
          name="churchName"
          value={churchName}
          onChange={(event) => setChurchName(event.target.value)}
          placeholder="Grace Chapel"
          required
          className={field}
        />
        {errorFor("churchName")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="slug" className="text-sm font-medium">
          Web address
        </label>
        <div className="flex items-center gap-1 text-sm">
          <input
            id="slug"
            name="slug"
            value={address}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder="grace-chapel"
            className={`${field} max-w-56`}
          />
          <span className="text-stone-500">.{rootDomain}</span>
        </div>
        {errorFor("slug")}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="tagline" className="text-sm font-medium">
          Tagline <span className="font-normal text-stone-500">(optional)</span>
        </label>
        <input
          id="tagline"
          name="tagline"
          placeholder="Sunday services from Grace Chapel"
          defaultValue={state.values?.tagline ?? ""}
          key={`tagline-${state.values?.tagline ?? ""}`}
          className={field}
        />
      </div>

      {needsAccount ? (
        <div className="space-y-5 border-t border-stone-200 pt-5 dark:border-stone-800">
          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={state.values?.name ?? ""}
              key={`name-${state.values?.name ?? ""}`}
              className={field}
            />
            {errorFor("name")}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue={state.values?.email ?? ""}
              key={`email-${state.values?.email ?? ""}`}
              className={field}
            />
            {errorFor("email")}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={10}
              className={field}
            />
            <p className="text-xs text-stone-500">At least 10 characters.</p>
            {errorFor("password")}
          </div>
        </div>
      ) : null}

      {state.error && !state.field ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create the site"}
      </button>
    </form>
  );
}
