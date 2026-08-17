"use client";

import { useState } from "react";
import { colourCss, colourLocation, coloursIn } from "@/lib/media/colour";
import FileDrop from "@/components/media/FileDrop";
import MediaPicker from "@/components/media/MediaPicker";
import type { MediaKind } from "@/lib/media/service";
import { uploadToLibrary } from "@/lib/media/upload";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

/** Dark enough to read white words over, from the back of a room. */
const PRESETS = [
  { label: "Midnight", colours: ["#0b1220", "#1c2b4a"] },
  { label: "Deep blue", colours: ["#101820"] },
  { label: "Forest", colours: ["#0d1f17", "#1d3b2a"] },
  { label: "Plum", colours: ["#1b0f1f", "#3a1c3f"] },
  { label: "Charcoal", colours: ["#111111", "#2a2a2a"] },
] as const;

type Props = {
  name: string;
  label: string;
  tenant: string;
  /** Existing value — either an https:// link or a `gcs:` object location. */
  defaultValue?: string | null;
  accept?: string;
  uploadsEnabled: boolean;
  hint?: string;
  required?: boolean;
  /** Which part of the library to offer. Omit to offer all of it. */
  kinds?: MediaKind[];
  /**
   * Offer a plain colour as well as a file.
   *
   * Only where a background goes. Plenty of churches try a photograph, find
   * they can't read the words over it from the back, and want a deep colour and
   * nothing else — and making a 1920×1080 image of one in something else first
   * is a silly thing to ask of anybody.
   */
  colours?: boolean;
};

/**
 * One field, three ways to fill it: paste a URL, upload a file, or take one the
 * church already has.
 *
 * An upload goes straight to the bucket through a signed URL and is then
 * recorded in the media library — which is what makes the third way possible.
 * Before that, a file existed only as a string on whatever row happened to need
 * it, so using the same clip twice meant uploading it twice.
 */
export default function MediaField({
  name,
  label,
  tenant,
  defaultValue,
  accept,
  uploadsEnabled,
  hint,
  required,
  kinds,
  colours = false,
}: Props) {
  const [location, setLocation] = useState(defaultValue ?? "");
  const [chosen, setChosen] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const isUpload = location.startsWith("gcs:");
  const chosenColours = coloursIn(location);

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    try {
      const { item, reused } = await uploadToLibrary(tenant, file, setProgress);
      setLocation(item.location);
      setChosen(reused ? `${item.title} — already in the library` : item.title);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>

      <input type="hidden" name={name} value={location} />

      {colours && chosenColours.length > 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700">
          <span
            aria-hidden
            className="h-8 w-14 shrink-0 rounded border border-stone-300 dark:border-stone-700"
            style={{ background: colourCss(location) ?? undefined }}
          />
          <span className="flex-1 truncate text-stone-600 dark:text-stone-400">
            {chosenColours.length > 1 ? "Gradient" : "Colour"} · {chosenColours.join(" to ")}
          </span>
          <button
            type="button"
            onClick={() => setLocation("")}
            className="font-medium text-amber-700 hover:underline dark:text-amber-500"
          >
            Replace
          </button>
        </div>
      ) : isUpload ? (
        <div className="flex items-center gap-3 rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700">
          <span className="flex-1 truncate text-stone-600 dark:text-stone-400">
            {chosen ?? `Stored file · ${location.split("/").pop()}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setLocation("");
              setChosen(null);
            }}
            className="font-medium text-amber-700 hover:underline dark:text-amber-500"
          >
            Replace
          </button>
        </div>
      ) : (
        <input
          id={name}
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="https://…"
          required={required}
          className={field}
        />
      )}

      {!isUpload ? (
        <div className="space-y-2 pt-1">
          {uploadsEnabled ? (
            <FileDrop
              compact
              multiple={false}
              accept={accept}
              busy={progress !== null}
              onFiles={(files) => void upload(files[0])}
              label={
                progress === null ? "Drop a file here, or click to choose one" : `Uploading… ${progress}%`
              }
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
            >
              Choose from the library
            </button>
            <span className="text-xs text-stone-500">or paste a link above</span>
          </div>
        </div>
      ) : null}

      {picking ? (
        <MediaPicker
          tenant={tenant}
          kinds={kinds}
          title={label}
          onPick={(item) => {
            setLocation(item.location);
            setChosen(item.title);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}

      {colours ? (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-stone-500">Or a colour:</span>

          {/* A few that are dark enough to read white words over — which is the
              only thing that makes a background good, and the thing nobody
              checks until they are standing at the back of a room. */}
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              title={preset.label}
              aria-label={preset.label}
              onClick={() => setLocation(colourLocation(...preset.colours))}
              style={{ background: colourCss(colourLocation(...preset.colours)) ?? undefined }}
              className="h-7 w-9 rounded border border-stone-300 hover:ring-2 hover:ring-amber-400 dark:border-stone-700"
            />
          ))}

          <label className="flex items-center gap-1.5 text-xs text-stone-500">
            <span>Custom</span>
            <input
              type="color"
              value={chosenColours[0] ?? "#101820"}
              onChange={(event) => setLocation(colourLocation(event.target.value))}
              className="h-7 w-9 cursor-pointer rounded border border-stone-300 bg-transparent p-0.5 dark:border-stone-700"
            />
          </label>
        </div>
      ) : null}

      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
