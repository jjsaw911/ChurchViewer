import type { SlidePayload } from "@/lib/songs/types";

/**
 * Slides that belong to an activity rather than to a recording.
 *
 * A song's slides are timed against its audio — that's what `lib/songs/slides`
 * builds. Announcements, a welcome, a reading have no recording behind them:
 * they go up when the operator says so. They still use the same `SlidePayload`
 * shape so the presenter, the run sheet and the output screen only ever deal
 * with one kind of slide; the times are nominal, spaced far enough apart to
 * keep them in a stable order.
 */
const NOMINAL_GAP_MS = 5000;

/** Somewhere slides can be copied from — a library song, or a past activity. */
export type SlideSource = {
  /** `song:<id>` or `item:<id>` — what `importItemSlidesAction` expects. */
  value: string;
  label: string;
  group: "Songs" | "Other services";
};

/** Trim the text, drop anything empty, and put the timings back in step. */
export function normaliseSlides(slides: SlidePayload[]): SlidePayload[] {
  return slides
    .map((slide) => ({
      ...slide,
      lines: slide.lines.map((line) => line.trim()).filter(Boolean),
      label: slide.label?.trim() || undefined,
    }))
    .filter((slide) => slide.lines.length > 0)
    .map((slide, index) => ({
      ...slide,
      id: `slide-${index + 1}`,
      atMs: index * NOMINAL_GAP_MS,
      endMs: (index + 1) * NOMINAL_GAP_MS,
    }));
}

/**
 * Turn pasted text into slides: a blank line starts a new slide, every other
 * line is a line on it.
 *
 * That's the shape text already arrives in — an announcements list, a hymn
 * copied out of a document, a reading pasted from a Bible site — so the import
 * is "paste it and check it" rather than "retype it one box at a time".
 */
export function slidesFromText(text: string): SlidePayload[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);

  return normaliseSlides(
    blocks.map((lines, index) => ({
      id: `slide-${index + 1}`,
      lines,
      atMs: 0,
      endMs: 0,
    })),
  );
}

/**
 * What actually goes on screen for an activity.
 *
 * Slides typed onto the item win. Otherwise a song item shows the linked song's
 * slides, so a set list needs no copying — fix the song once and every service
 * that uses it is fixed.
 */
export function effectiveSlides(item: {
  slides: SlidePayload[];
  songSlides?: SlidePayload[] | null;
}): SlidePayload[] {
  if (item.slides.length > 0) return item.slides;
  return item.songSlides ?? [];
}
