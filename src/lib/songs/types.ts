/** One word as the transcription model heard it, in seconds from the start. */
export type TranscribedWord = {
  word: string;
  start: number;
  end: number;
};

export type TranscriptPayload = {
  /** Model's plain-text output, kept for reference and re-slicing. */
  text: string;
  words: TranscribedWord[];
  /** Which model produced it, so an upgrade is traceable. */
  model: string;
  transcribedAt: string;
  language?: string;
};

/**
 * A single screen. `atMs` is when it should go up, measured against the
 * recording; the slide stays until the next one's `atMs`.
 */
export type SlidePayload = {
  id: string;
  lines: string[];
  atMs: number;
  endMs: number;
  /** "Verse 1", "Chorus" — optional, for the operator's benefit. */
  label?: string;
};
