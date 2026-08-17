import { kindFor } from "@/lib/media/service";
import { playbackUrl } from "@/lib/storage";
import { youtubeVideoId } from "@/lib/youtube";

/**
 * A file attached to something, resolved into what a browser needs to show it.
 *
 * The database only ever stores a location — `gcs:` for a file we hold, or
 * somebody's URL. Turning that into a picture, a player or a YouTube frame is
 * the same job wherever it comes up: the planner drawing a thumbnail on a row,
 * the run sheet, the screen behind the band.
 */
export type Attachment = {
  kind: "image" | "audio" | "video" | "youtube" | "file";
  /** Playable or displayable now; signed if it came out of the bucket. */
  url: string | null;
  videoId: string | null;
  location: string;
};

export async function resolveAttachment(
  location: string | null | undefined,
): Promise<Attachment | null> {
  if (!location) return null;

  const videoId = youtubeVideoId(location);
  if (videoId) {
    return { kind: "youtube", url: location, videoId, location };
  }

  // No content type is stored alongside these, so the name is all there is —
  // which is exactly the case `kindFor` falls back to.
  const kind = kindFor("", location);
  const url = await playbackUrl(location);

  return {
    kind: kind === "captions" || kind === "other" ? "file" : kind,
    url,
    videoId: null,
    location,
  };
}
