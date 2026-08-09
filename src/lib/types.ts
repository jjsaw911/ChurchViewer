export type MediaKind = "video" | "audio";

export type Media = {
  kind: MediaKind;
  /** Direct URL to an mp4/m3u8/mp3 file, or a path under `public/`. */
  src: string;
  /** Still image shown before playback starts. */
  poster?: string;
  /** WebVTT captions track. */
  captions?: string;
};

export type Sermon = {
  slug: string;
  title: string;
  speaker: string;
  /** Slug of the series this belongs to, or null for a standalone message. */
  seriesSlug: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  scripture: string;
  description: string;
  durationSeconds: number;
  media: Media;
};

export type Series = {
  slug: string;
  title: string;
  description: string;
  artwork?: string;
};
