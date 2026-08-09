"use client";

import { useActionState, useState } from "react";
import MediaField from "@/components/admin/MediaField";
import { saveSermonAction, type ActionState } from "@/lib/admin/actions";
import { toClock } from "@/lib/format";
import { slugify } from "@/lib/tenant";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export type SermonFormValues = {
  slug: string;
  title: string;
  speaker: string;
  seriesId: string | null;
  preachedOn: string;
  scripture: string;
  description: string;
  durationSeconds: number;
  mediaKind: "video" | "audio";
  mediaSrc: string;
  posterSrc: string | null;
  captionsSrc: string | null;
  published: boolean;
};

type Props = {
  tenant: string;
  seriesOptions: { id: string; title: string }[];
  uploadsEnabled: boolean;
  /** Absent when adding a new message. */
  sermon?: SermonFormValues;
};

export default function SermonForm({ tenant, seriesOptions, uploadsEnabled, sermon }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSermonAction, {});

  // React resets the form once the action resolves, so on a validation error the
  // defaults have to come from what was just submitted, not the stored record.
  const echoed = state.values;
  const initial = (name: string, fallback: string) => echoed?.[name] ?? fallback;
  // Changing the key remounts the inputs so the new defaults actually apply.
  const formKey = echoed ? JSON.stringify(echoed).length + String(state.error).length : 0;
  const [title, setTitle] = useState(sermon?.title ?? "");
  const [slug, setSlug] = useState(sermon?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(sermon));
  const address = slugTouched ? slug : slugify(title);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenant" value={tenant} />
      {sermon ? <input type="hidden" name="originalSlug" value={sermon.slug} /> : null}

      <div className="grid gap-6 sm:grid-cols-2" key={`fields-${formKey}`}>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="slug" className="text-sm font-medium">
            Web address
          </label>
          <input
            id="slug"
            name="slug"
            value={address}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            className={field}
          />
          <p className="text-xs text-stone-500">/sermons/{address || "…"}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="preachedOn" className="text-sm font-medium">
            Date preached
          </label>
          <input
            id="preachedOn"
            name="preachedOn"
            type="date"
            defaultValue={initial("preachedOn", sermon?.preachedOn ?? "")}
            required
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="speaker" className="text-sm font-medium">
            Speaker
          </label>
          <input
            id="speaker"
            name="speaker"
            defaultValue={initial("speaker", sermon?.speaker ?? "")}
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="seriesId" className="text-sm font-medium">
            Series
          </label>
          <select
            id="seriesId"
            name="seriesId"
            defaultValue={initial("seriesId", sermon?.seriesId ?? "")}
            className={field}
          >
            <option value="">Standalone message</option>
            {seriesOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.title}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="scripture" className="text-sm font-medium">
            Passage
          </label>
          <input
            id="scripture"
            name="scripture"
            defaultValue={initial("scripture", sermon?.scripture ?? "")}
            placeholder="Matthew 7:24–27"
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="duration" className="text-sm font-medium">
            Length
          </label>
          <input
            id="duration"
            name="duration"
            defaultValue={initial("duration", sermon ? toClock(sermon.durationSeconds) : "")}
            placeholder="36:36"
            className={field}
          />
          <p className="text-xs text-stone-500">mm:ss, h:mm:ss, or minutes.</p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={initial("description", sermon?.description ?? "")}
            className={field}
          />
        </div>
      </div>

      <fieldset className="space-y-4 border-t border-stone-200 pt-6 dark:border-stone-800" key={`media-${formKey}`}>
        <legend className="text-sm font-semibold">Recording</legend>

        <div className="space-y-1.5">
          <label htmlFor="mediaKind" className="text-sm font-medium">
            Type
          </label>
          <select
            id="mediaKind"
            name="mediaKind"
            defaultValue={initial("mediaKind", sermon?.mediaKind ?? "video")}
            className={`${field} max-w-40`}
          >
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
        </div>

        <MediaField
          name="mediaSrc"
          label="Recording"
          tenant={tenant}
          defaultValue={initial("mediaSrc", sermon?.mediaSrc ?? "")}
          accept="video/*,audio/*"
          uploadsEnabled={uploadsEnabled}
          required
        />
        <MediaField
          name="posterSrc"
          label="Thumbnail"
          tenant={tenant}
          defaultValue={initial("posterSrc", sermon?.posterSrc ?? "")}
          accept="image/*"
          uploadsEnabled={uploadsEnabled}
          hint="Shown on the library grid and before playback starts."
        />
        <MediaField
          name="captionsSrc"
          label="Captions"
          tenant={tenant}
          defaultValue={initial("captionsSrc", sermon?.captionsSrc ?? "")}
          accept=".vtt,text/vtt"
          uploadsEnabled={uploadsEnabled}
          hint="A WebVTT file, if you have one."
        />
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={echoed ? echoed.published !== undefined : (sermon?.published ?? true)}
          className="h-4 w-4"
        />
        Publish — visible to everyone on your site
      </label>

      {state.error ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? "Saving…" : sermon ? "Save changes" : "Add the message"}
      </button>
    </form>
  );
}
