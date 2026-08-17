/**
 * Pull the video id out of any of the shapes people paste: watch links, share
 * links, embeds, shorts, and live URLs.
 */
export function youtubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  // A bare id, pasted on its own.
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const isYouTube =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be";
  if (!isYouTube) return null;

  if (host === "youtu.be") {
    const id = parsed.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }

  const queryId = parsed.searchParams.get("v");
  if (queryId && /^[\w-]{11}$/.test(queryId)) return queryId;

  const match = /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(parsed.pathname);
  return match ? match[1] : null;
}

/** Privacy-preserving embed host — no cookies until playback starts. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}
