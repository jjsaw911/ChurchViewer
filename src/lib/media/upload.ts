import { registerMediaAction, type MediaItem } from "@/lib/media/actions";

/**
 * Put a file in the bucket from the browser, then list it in the library.
 *
 * Shared because three places now do it — the library, a media field, and
 * dropping a recording onto the songs page — and the sequence matters: the
 * signed URL is minted by the server, the bytes go straight to storage without
 * passing through it, and only then does the app learn the file exists.
 */
export async function uploadToLibrary(
  tenant: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MediaItem> {
  const contentType = file.type || "application/octet-stream";

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

  return registered.item;
}
