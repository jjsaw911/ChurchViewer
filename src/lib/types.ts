export type MediaKind = "video" | "audio";

/** What a grid tile needs. Deliberately no media URL — see `SermonDetail`. */
export type SermonSummary = {
  slug: string;
  title: string;
  speaker: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  scripture: string;
  durationSeconds: number;
  mediaKind: MediaKind;
  posterUrl: string | null;
  seriesSlug: string | null;
  seriesTitle: string | null;
  published: boolean;
};

/**
 * A summary plus everything the player needs. Built separately because signing
 * a playback URL costs something, and a library page needs dozens of tiles.
 */
export type SermonDetail = SermonSummary & {
  description: string;
  media: {
    kind: MediaKind;
    src: string;
    poster: string | null;
    captions: string | null;
  };
};

export type SeriesSummary = {
  slug: string;
  title: string;
  description: string;
  artworkUrl: string | null;
  sermonCount: number;
};
