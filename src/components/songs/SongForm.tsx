"use client";

import { useActionState, useState } from "react";
import MediaField from "@/components/admin/MediaField";
import { saveSongAction, type SongState } from "@/lib/songs/actions";
import { toClock } from "@/lib/format";
import { slugify } from "@/lib/tenant";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

export type SongFormValues = {
  slug: string;
  title: string;
  author: string;
  ccliNumber: string;
  sourceUrl: string | null;
  audioSrc: string | null;
  videoSrc: string | null;
  durationSeconds: number;
};

export default function SongForm({
  tenant,
  uploadsEnabled,
  song,
}: {
  tenant: string;
  uploadsEnabled: boolean;
  song?: SongFormValues;
}) {
  const [state, action, pending] = useActionState<SongState, FormData>(saveSongAction, {});
  const [title, setTitle] = useState(song?.title ?? "");
  const echoed = state.values;
  const initial = (name: string, fallback: string) => echoed?.[name] ?? fallback;
  const formKey = echoed ? JSON.stringify(echoed).length : 0;

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="tenant" value={tenant} />
      {song ? <input type="hidden" name="originalSlug" value={song.slug} /> : null}

      <div className="grid gap-6 sm:grid-cols-2" key={`song-${formKey}`}>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="title" className="text-sm font-medium">
            Song title
          </label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className={field}
          />
          <p className="text-xs text-stone-500">/songs/{slugify(title) || "…"}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="author" className="text-sm font-medium">
            Writer <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <input
            id="author"
            name="author"
            defaultValue={initial("author", song?.author ?? "")}
            className={field}
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="ccliNumber" className="text-sm font-medium">
            CCLI number <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <input
            id="ccliNumber"
            name="ccliNumber"
            defaultValue={initial("ccliNumber", song?.ccliNumber ?? "")}
            className={field}
          />
          <p className="text-xs text-stone-500">For your own licence reporting.</p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="sourceUrl" className="text-sm font-medium">
            YouTube link
          </label>
          <input
            id="sourceUrl"
            name="sourceUrl"
            defaultValue={initial("sourceUrl", song?.sourceUrl ?? "")}
            placeholder="https://www.youtube.com/watch?v=…"
            className={field}
          />
          <p className="text-xs text-stone-500">
            Used to play the song and drive the slide timing.
          </p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="duration" className="text-sm font-medium">
            Length
          </label>
          <input
            id="duration"
            name="duration"
            defaultValue={initial("duration", song ? toClock(song.durationSeconds) : "")}
            placeholder="4:12"
            className={`${field} max-w-32`}
          />
        </div>
      </div>

      <fieldset className="space-y-5 border-t border-stone-200 pt-6 dark:border-stone-800">
        <legend className="text-sm font-semibold">The recording</legend>

        <MediaField
          name="videoSrc"
          label="Video file"
          tenant={tenant}
          defaultValue={initial("videoSrc", song?.videoSrc ?? "")}
          accept="video/*"
          kinds={["video"]}
          uploadsEnabled={uploadsEnabled}
          hint="A video your church holds — the service recording, the desk mix. The worker takes the audio out of it, which also gets it under the size the transcription API accepts. Not a YouTube link: use the field above for that."
        />

        <MediaField
          name="audioSrc"
          label="Audio file"
          tenant={tenant}
          defaultValue={initial("audioSrc", song?.audioSrc ?? "")}
          accept="audio/*"
          kinds={["audio"]}
          uploadsEnabled={uploadsEnabled}
          hint="What actually gets transcribed. Fill this in yourself, or leave it and let the video above become it."
        />
      </fieldset>

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
        {pending ? "Saving…" : song ? "Save song" : "Add the song"}
      </button>
    </form>
  );
}
