import type { SlidePayload, TranscribedWord } from "@/lib/songs/types";

export type SlideOptions = {
  /** A pause at least this long ends the current line. */
  lineGapSeconds: number;
  /** A longer pause than this starts a new slide, whatever the line count. */
  slideGapSeconds: number;
  /** Wrap a line once it passes this many characters. */
  maxLineChars: number;
  /** How many lines fit on screen at once. */
  linesPerSlide: number;
};

export const DEFAULT_SLIDE_OPTIONS: SlideOptions = {
  lineGapSeconds: 0.55,
  slideGapSeconds: 1.8,
  maxLineChars: 42,
  linesPerSlide: 2,
};

type Line = {
  text: string;
  startMs: number;
  endMs: number;
  /** Silence before this line began — what decides where a slide breaks. */
  gapBeforeSeconds: number;
};

const toMs = (seconds: number) => Math.max(0, Math.round(seconds * 1000));

/**
 * Group timed words into sung lines. Singers breathe, and that pause is a far
 * better line break than any character count — length is only the fallback for
 * a long unbroken phrase.
 */
export function buildLines(
  words: TranscribedWord[],
  options: SlideOptions = DEFAULT_SLIDE_OPTIONS,
): Line[] {
  const lines: Line[] = [];
  let current: TranscribedWord[] = [];
  let gapBefore = 0;

  const flush = () => {
    if (current.length === 0) return;
    lines.push({
      text: current.map((word) => word.word.trim()).filter(Boolean).join(" "),
      startMs: toMs(current[0].start),
      endMs: toMs(current[current.length - 1].end),
      gapBeforeSeconds: gapBefore,
    });
    current = [];
  };

  for (const word of words) {
    if (!word.word.trim()) continue;

    if (current.length === 0) {
      const previous = lines[lines.length - 1];
      gapBefore = previous ? Math.max(0, word.start - previous.endMs / 1000) : 0;
      current.push(word);
      continue;
    }

    const previousWord = current[current.length - 1];
    const gap = word.start - previousWord.end;
    const lengthSoFar = current.reduce((total, w) => total + w.word.trim().length + 1, 0);

    if (gap >= options.lineGapSeconds || lengthSoFar >= options.maxLineChars) {
      flush();
      const previous = lines[lines.length - 1];
      gapBefore = previous ? Math.max(0, word.start - previous.endMs / 1000) : 0;
    }
    current.push(word);
  }
  flush();

  return lines;
}

/**
 * Pack lines onto slides. A long pause between lines means a new section, so it
 * forces a break even when the current slide has room — that's what keeps a
 * chorus from starting on the tail of a verse.
 */
export function buildSlides(
  words: TranscribedWord[],
  options: SlideOptions = DEFAULT_SLIDE_OPTIONS,
  /** Total recording length, so the last slide has somewhere to end. */
  totalDurationSeconds = 0,
): SlidePayload[] {
  const lines = buildLines(words, options);
  if (lines.length === 0) return [];

  const groups: Line[][] = [];
  for (const line of lines) {
    const currentGroup = groups[groups.length - 1];
    const sectionBreak = line.gapBeforeSeconds >= options.slideGapSeconds;

    if (!currentGroup || sectionBreak || currentGroup.length >= options.linesPerSlide) {
      groups.push([line]);
    } else {
      currentGroup.push(line);
    }
  }

  return groups.map((group, index) => {
    const next = groups[index + 1];
    const lastLine = group[group.length - 1];
    // Hold each slide until the next one is due, so there's never a blank screen.
    const endMs = next
      ? next[0].startMs
      : Math.max(lastLine.endMs, toMs(totalDurationSeconds));

    return {
      id: `slide-${index + 1}`,
      lines: group.map((line) => line.text),
      atMs: group[0].startMs,
      endMs,
    };
  });
}

/** Which slide belongs on screen at this point in the recording. */
export function slideAt(slides: SlidePayload[], positionMs: number, offsetMs = 0): number {
  const target = positionMs - offsetMs;
  let found = -1;
  for (let index = 0; index < slides.length; index++) {
    if (slides[index].atMs <= target) found = index;
    else break;
  }
  return found;
}

/** Re-flow edited text back onto slides, keeping each slide's timing. */
export function retimeSlides(slides: SlidePayload[], totalDurationMs: number): SlidePayload[] {
  return slides
    .slice()
    .sort((a, b) => a.atMs - b.atMs)
    .map((slide, index, sorted) => ({
      ...slide,
      id: `slide-${index + 1}`,
      endMs: sorted[index + 1] ? sorted[index + 1].atMs : Math.max(slide.endMs, totalDurationMs),
    }));
}
