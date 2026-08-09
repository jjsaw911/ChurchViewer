import type { TranscribedWord, TranscriptPayload } from "@/lib/songs/types";

/**
 * The church's own OpenAI account does the work. Called through plain `fetch`
 * rather than the SDK — it's two endpoints, and one fewer dependency to keep
 * current on the VM.
 */
const API_BASE = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";

/** Whisper is the model that still returns word-level timestamps. */
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL ?? "whisper-1";
const TIDY_MODEL = process.env.OPENAI_TIDY_MODEL ?? "gpt-4o-mini";

export const isOpenAiConfigured = () => Boolean(process.env.OPENAI_API_KEY);

function apiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set — add it before transcribing.");
  return key;
}

/**
 * Transcribe a recording into timed words.
 *
 * Whisper's `verbose_json` with word granularity is what makes automatic slide
 * timing possible at all: without per-word times we'd only know the lyrics, not
 * when to put each line on screen.
 */
export async function transcribeAudio(input: {
  audio: Blob;
  filename: string;
  /** Nudges the model toward the right proper nouns; never the lyrics themselves. */
  prompt?: string;
  signal?: AbortSignal;
}): Promise<TranscriptPayload> {
  const form = new FormData();
  form.append("file", input.audio, input.filename);
  form.append("model", TRANSCRIBE_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  if (input.prompt) form.append("prompt", input.prompt);

  const response = await fetch(`${API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey()}` },
    body: form,
    signal: input.signal,
  });

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed (${response.status}): ${await errorText(response)}`);
  }

  const data = (await response.json()) as {
    text?: string;
    language?: string;
    words?: { word: string; start: number; end: number }[];
    segments?: { text: string; start: number; end: number }[];
  };

  return {
    text: data.text ?? "",
    words: normaliseWords(data),
    model: TRANSCRIBE_MODEL,
    transcribedAt: new Date().toISOString(),
    language: data.language,
  };
}

/**
 * Fall back to segments when the model returns no word timings — coarser, but a
 * slide every few seconds still beats no timing at all.
 */
function normaliseWords(data: {
  words?: { word: string; start: number; end: number }[];
  segments?: { text: string; start: number; end: number }[];
}): TranscribedWord[] {
  if (data.words?.length) {
    return data.words.map((word) => ({
      word: word.word,
      start: word.start,
      end: word.end,
    }));
  }

  return (data.segments ?? []).flatMap((segment) => {
    const pieces = segment.text.trim().split(/\s+/).filter(Boolean);
    if (pieces.length === 0) return [];
    const span = Math.max(0.001, segment.end - segment.start) / pieces.length;
    return pieces.map((piece, index) => ({
      word: piece,
      start: segment.start + index * span,
      end: segment.start + (index + 1) * span,
    }));
  });
}

/**
 * Optional clean-up pass: punctuation, capitalisation, and section labels on
 * text the church already has. It reshapes the transcript it's given — it is
 * never asked to supply lyrics of its own.
 */
export async function tidySlides(input: {
  title: string;
  slides: { lines: string[] }[];
  signal?: AbortSignal;
}): Promise<{ lines: string[]; label?: string }[]> {
  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      "content-type": "application/json",
    },
    signal: input.signal,
    body: JSON.stringify({
      model: TIDY_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You format worship slides. You are given a transcript the user already holds, " +
            "already split into slides. Fix capitalisation, punctuation and obvious " +
            "mis-hearings, and label sections (Verse 1, Chorus, Bridge) where the repetition " +
            "makes it clear. Never add, invent or extend any words that are not in the input. " +
            'Reply as JSON: {"slides":[{"lines":["..."],"label":"Chorus"}]} with exactly as ' +
            "many slides as you were given, in the same order.",
        },
        {
          role: "user",
          content: JSON.stringify({ title: input.title, slides: input.slides }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI tidy pass failed (${response.status}): ${await errorText(response)}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty tidy response.");

  const parsed = JSON.parse(content) as { slides?: { lines?: string[]; label?: string }[] };
  const slides = parsed.slides ?? [];

  // A short or malformed reply must not silently drop verses.
  if (slides.length !== input.slides.length) {
    throw new Error(
      `Tidy pass returned ${slides.length} slides for ${input.slides.length} — leaving the originals alone.`,
    );
  }

  return slides.map((slide, index) => ({
    lines: slide.lines?.length ? slide.lines : input.slides[index].lines,
    label: slide.label?.trim() || undefined,
  }));
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
