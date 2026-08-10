import {
  findExistingMediaAction,
  registerMediaAction,
  type MediaItem,
} from "@/lib/media/actions";

export type UploadResult = {
  item: MediaItem;
  /** True when nothing was uploaded because the church already had this file. */
  reused: boolean;
};

/**
 * Put a file in the bucket from the browser, then list it in the library.
 *
 * Unless it's already there. Recordings live in one folder on somebody's
 * machine and get dragged in again by mistake — the same video twice is a
 * hundred and fifty wasted megabytes, a second song saying the same thing, and
 * a transcription bill for words already transcribed. So the first thing this
 * does is ask, which costs one small request.
 *
 * Shared because three places upload: the library, a media field, and dropping
 * a recording onto the songs page.
 */
export async function uploadToLibrary(
  tenant: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const contentType = file.type || "application/octet-stream";

  const existing = await findExistingMediaAction({
    tenant,
    filename: file.name,
    bytes: file.size,
  });
  if (existing) return { item: existing, reused: true };

  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant, filename: file.name, contentType }),
  });
  const data = (await response.json()) as {
    uploadUrl?: string;
    location?: string;
    error?: string;
  };
  if (!response.ok || !data.uploadUrl || !data.location) {
    throw new Error(data.error ?? "Couldn't start the upload.");
  }

  // XHR rather than fetch — it's still the only way to get progress on a PUT,
  // and a service video is long enough that a silent wait looks like a hang.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", data.uploadUrl!);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.send(file);
  });

  const registered = await registerMediaAction({
    tenant,
    location: data.location,
    filename: file.name,
    contentType,
    bytes: file.size,
  });
  if (!registered.ok) throw new Error(registered.error);

  return { item: registered.item, reused: false };
}
