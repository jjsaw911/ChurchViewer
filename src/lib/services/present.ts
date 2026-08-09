import { resolveAttachment, type Attachment } from "@/lib/media/attachment";
import { effectiveSlides } from "@/lib/services/slides";
import { layoutPlan } from "@/lib/services/timeline";
import { playbackUrl } from "@/lib/storage";
import { youtubeVideoId } from "@/lib/youtube";
import type { PlanItemRow } from "@/lib/services/plan";
import type { SlidePayload } from "@/lib/songs/types";

/**
 * One activity, ready to be presented.
 *
 * The run sheet, the output screen and the stage display all work from this
 * same list — the times already worked out, the slides already resolved, and
 * the recording already turned into something a player can open. Anything that
 * needs the database has happened by the time this reaches a browser.
 */
export type PresentItem = {
  id: string;
  title: string;
  kind: string;
  /** 1 for a song inside the worship set — drawn indented, same as the plan. */
  depth: number;
  startsAt: string;
  endsAt: string;
  owner: string;
  notes: string;
  minutes: number;
  slides: SlidePayload[];
  songSlug: string | null;
  mediaUrl: string | null;
  /**
   * The file attached to this activity, ready to show. A picture with no text
   * slides is itself what goes on the screen — that's how most announcements
   * and most bumpers actually arrive.
   */
  attachment: Attachment | null;
  /** Set when there's a recording this item's slides are timed against. */
  videoId: string | null;
  audioUrl: string | null;
  timingOffsetMs: number;
  /**
   * Whether the slides can follow the recording on their own. False as soon as
   * the activity carries slides of its own: those are typed for this service
   * and advanced by hand, and no recording knows when they should turn.
   */
  followable: boolean;
};

export async function presentItems(
  rows: PlanItemRow[],
  serviceStartsAt: string,
  /** Resolving audio means signing bucket URLs; the output screen never plays. */
  withMedia = true,
): Promise<PresentItem[]> {
  const plan = layoutPlan(rows, serviceStartsAt);

  return Promise.all(
    plan.flat.map(async (entry) => {
      const item = entry.item;
      const usesSongSlides = item.slides.length === 0 && item.songSlides.length > 0;
      const videoId =
        withMedia && item.songSourceUrl ? youtubeVideoId(item.songSourceUrl) : null;
      const audioUrl = withMedia ? await playbackUrl(item.songAudioSrc) : null;

      return {
        id: item.id,
        title: item.title,
        kind: item.kind,
        depth: entry.depth,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        owner: item.owner,
        notes: item.notes,
        minutes: Math.round(entry.endMinutes - entry.startMinutes),
        slides: effectiveSlides(item),
        songSlug: item.songSlug,
        mediaUrl: item.mediaUrl,
        // Always resolved, even where the recording isn't: a picture is content
        // for the screen, not something only the operator plays.
        attachment: await resolveAttachment(item.mediaUrl),
        videoId,
        audioUrl,
        timingOffsetMs: item.songTimingOffsetMs ?? 0,
        followable: usesSongSlides && Boolean(videoId || audioUrl),
      } satisfies PresentItem;
    }),
  );
}
