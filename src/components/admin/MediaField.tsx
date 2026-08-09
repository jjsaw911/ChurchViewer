"use client";

import { useRef, useState } from "react";

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
};

/**
 * One field, two ways to fill it: paste a URL, or upload a file straight to the
 * bucket via a signed URL and keep the resulting object location.
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
}: Props) {
  const [location, setLocation] = useState(defaultValue ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
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
            Uploaded file &middot; {location.split("/").pop()}
          </span>
          <button
            type="button"
            onClick={() => setLocation("")}
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

      {uploadsEnabled && !isUpload ? (
        <div className="flex items-center gap-3 pt-1">
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
          <span className="text-xs text-stone-500">or paste a link above</span>
        </div>
      ) : null}

      {hint ? <p className="text-xs text-stone-500">{hint}</p> : null}
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
