import { resolveAttachment, type Attachment } from "@/lib/media/attachment";
import { resolveBackground, type Background } from "@/lib/media/background";
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
  /** The key the recording turned out to be in, for whoever is playing. */
  musicalKey: string | null;
  mediaUrl: string | null;
  /**
   * The file attached to this activity, ready to show. A picture with no text
   * slides is itself what goes on the screen — that's how most announcements
   * and most bumpers actually arrive.
   */
  attachment: Attachment | null;
  /**
   * What goes behind the words on the projector: this activity's own
   * background, then the song's, then the service's, then nothing — which the
   * screen draws as black. A picture, a loop, or a colour.
   */
  background: Background | null;
  /** Set when there's a recording this item's slides are timed against. */
  videoId: string | null;
  audioUrl: string | null;
  timingOffsetMs: number;
  /**
   * Whether the slides can follow the recording on their own. False as soon as
   * the activity carries slides of its own: those are typed for this service
   * and advanced by hand, and no recording knows when they should turn.
   *
   * It also needs a recording this machine can actually play — a file. A song
   * whose only source is a link somewhere else is not followable here, however
   * carefully its slides were timed.
   */
  followable: boolean;
  /**
   * Timed slides, but the only recording is a link off elsewhere. Worth saying
   * out loud on the run sheet: it looks identical to a followable song and
   * isn't, and the person finding that out at 10am should find it out now.
   */
  offsiteRecordingOnly: boolean;
};

export async function presentItems(
  rows: PlanItemRow[],
  serviceStartsAt: string,
  /** Resolving audio means signing bucket URLs; the output screen never plays. */
  withMedia = true,
  /** The service's own background, behind anything without one of its own. */
  serviceBackgroundSrc: string | null = null,
): Promise<PresentItem[]> {
  const plan = layoutPlan(rows, serviceStartsAt);
  const serviceBackground = await resolveBackground(serviceBackgroundSrc);

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
        musicalKey: item.songKey,
        mediaUrl: item.mediaUrl,
        // Always resolved, even where the recording isn't: a picture is content
        // for the screen, not something only the operator plays.
        attachment: await resolveAttachment(item.mediaUrl),
        // The activity's own, then the song's, then the service's, then black.
        // Most specific wins, which is the order somebody would say it out
        // loud: "this one has its own", "that song always looks like this",
        // "everything else matches the service".
        background:
          (await resolveBackground(item.backgroundSrc)) ??
          (await resolveBackground(item.songBackgroundSrc)) ??
          serviceBackground,
        videoId,
        audioUrl,
        timingOffsetMs: item.songTimingOffsetMs ?? 0,
        // The audio file, specifically. The display plays a file; a YouTube link
        // it cannot play, and slides that follow a recording nobody can start
        // are slides that never move.
        followable: usesSongSlides && Boolean(audioUrl),
        offsiteRecordingOnly: usesSongSlides && !audioUrl && Boolean(videoId),
      } satisfies PresentItem;
    }),
  );
}
