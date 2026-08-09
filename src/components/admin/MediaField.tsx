"use client";

import { useRef, useState } from "react";
import MediaPicker from "@/components/media/MediaPicker";
import { registerMediaAction } from "@/lib/media/actions";
import type { MediaKind } from "@/lib/media/service";

const field =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

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
}: Props) {
  const [location, setLocation] = useState(defaultValue ?? "");
  const [chosen, setChosen] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const isUpload = location.startsWith("gcs:");

  async function upload(file: File) {
    setError(null);
    setProgress(0);
    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenant,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
        }),
      });
      const data = (await response.json()) as {
        uploadUrl?: string;
        location?: string;
        error?: string;
      };
      if (!response.ok || !data.uploadUrl || !data.location) {
        throw new Error(data.error ?? "Couldn't start the upload.");
      }

      // XHR rather than fetch — it's still the only way to get progress on a PUT.
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", data.uploadUrl!);
        xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve()
            : reject(new Error(`Upload failed (${xhr.status})`));
        xhr.onerror = () => reject(new Error("Upload failed."));
        xhr.send(file);
      });

      setLocation(data.location);
      setChosen(file.name);

      // The bytes are safe either way; failing to list them is worth a line of
      // explanation, not throwing away a finished upload.
      const registered = await registerMediaAction({
        tenant,
        location: data.location,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        bytes: file.size,
      });
      if (!registered.ok) setError("Uploaded, but it didn't reach the media library.");
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

      {isUpload ? (
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
        <div className="flex flex-wrap items-center gap-3 pt-1">
          {uploadsEnabled ? (
            <>
              <input
                ref={fileInput}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={progress !== null}
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-amber-400 disabled:opacity-60 dark:border-stone-700"
              >
                {progress === null ? "Upload a file" : `Uploading… ${progress}%`}
              </button>
            </>
          ) : null}

          <button
            type="button"
            onClick={() => setPicking(true)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:border-amber-400 dark:border-stone-700"
          >
            Choose from the library
          </button>
          <span className="text-xs text-stone-500">or paste a link above</span>
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

      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
