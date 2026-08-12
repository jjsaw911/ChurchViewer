export type MediaKind = "audio" | "video" | "image" | "captions" | "other";

/**
 * What sort of thing this is, from whatever the browser told us and, failing
 * that, the name. Content types are missing often enough — a drag from a file
 * server, an external link someone pasted — that the extension has to be a
 * fallback rather than a nicety.
 *
 * Kept in a file of its own, with no database behind it, because the question
 * "is this a video?" comes up in places that have no business opening a
 * connection to answer it — including the background resolver, which is asked
 * once per activity while a page renders.
 */
export function kindFor(contentType: string, filename: string): MediaKind {
  const type = contentType.toLowerCase();
  if (type === "text/vtt" || type === "text/srt") return "captions";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("image/")) return "image";

  const extension = filename.toLowerCase().split(".").pop() ?? "";
  if (["mp3", "m4a", "wav", "aac", "ogg", "flac"].includes(extension)) return "audio";
  if (["mp4", "mov", "m4v", "webm", "avi", "mkv"].includes(extension)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(extension)) return "image";
  if (["vtt", "srt"].includes(extension)) return "captions";
  return "other";
}
