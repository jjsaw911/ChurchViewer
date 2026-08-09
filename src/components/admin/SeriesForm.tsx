"use client";

import { useActionState, useState } from "react";
import MediaField from "@/components/admin/MediaField";
import { saveSeriesAction, type ActionState } from "@/lib/admin/actions";
import { slugify } from "@/lib/tenant";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

type Props = {
  tenant: string;
  uploadsEnabled: boolean;
};

export default function SeriesForm({ tenant, uploadsEnabled }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSeriesAction, {});
  const [title, setTitle] = useState("");

  return (
    <form action={action} className="space-y-4 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <input type="hidden" name="tenant" value={tenant} />
      <h2 className="font-semibold">New series</h2>

      <div className="space-y-1.5">
        <label htmlFor="series-title" className="text-sm font-medium">
          Title
        </label>
        <input
          id="series-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          className={field}
        />
        <p className="text-xs text-stone-500">/series/{slugify(title) || "…"}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="series-description" className="text-sm font-medium">
          Description
        </label>
        <textarea id="series-description" name="description" rows={3} className={field} />
      </div>

      <MediaField
        name="artworkSrc"
        label="Artwork"
        tenant={tenant}
        accept="image/*"
        kinds={["image"]}
        uploadsEnabled={uploadsEnabled}
      />

      {state.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Create series"}
      </button>
    </form>
  );
}
