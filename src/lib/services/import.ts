import { normaliseSlides, slidesFromText } from "@/lib/services/slides";
import { readZip } from "@/lib/zip";
import type { SlidePayload } from "@/lib/songs/types";

/**
 * Slides out of a file somebody already made.
 *
 * The announcements exist. They were built in PowerPoint on a Tuesday, or typed
 * in Word, or pasted into a document — and asking whoever runs the service to
 * retype them into boxes is asking them to do the work twice, which is how a
 * church quietly goes back to using PowerPoint on the day.
 *
 * `.pptx` and `.docx` are zipped XML, so this reads them directly. A slide
 * becomes a slide, a paragraph becomes a line, and plain text falls back to the
 * rule the paste box already uses — a blank line starts a new one.
 *
 * Nothing about layout survives, on purpose: fonts, colours, boxes and clip art
 * are the parts that look wrong on somebody else's projector. The words are
 * what is worth keeping, and the background is chosen once for the service.
 */
export const IMPORTABLE = [".pptx", ".docx", ".txt", ".md", ".text"] as const;

export function isImportable(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMPORTABLE.some((extension) => lower.endsWith(extension));
}

export function slidesFromFile(filename: string, file: Buffer): SlidePayload[] {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pptx")) return slidesFromPptx(file);
  if (lower.endsWith(".docx")) return slidesFromDocx(file);
  return slidesFromText(file.toString("utf8"));
}

/** One slide per slide, one line per paragraph, in the order they were shown. */
export function slidesFromPptx(file: Buffer): SlidePayload[] {
  const slides = readZip(file)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
    // `slide10` sorts before `slide2` as text, and a service in the wrong order
    // is worse than no import at all.
    .sort((a, b) => slideNumber(a.name) - slideNumber(b.name))
    .map((entry) => paragraphs(entry.data.toString("utf8"), "a"));

  return normaliseSlides(
    slides
      .filter((lines) => lines.length > 0)
      .map((lines, index) => ({ id: `slide-${index + 1}`, lines, atMs: 0, endMs: 0 })),
  );
}

/**
 * A Word document has no slides, so the blank lines decide — the same rule as
 * the paste box, which is the one people already know.
 */
export function slidesFromDocx(file: Buffer): SlidePayload[] {
  const document = readZip(file).find((entry) => entry.name === "word/document.xml");
  if (!document) return [];

  const lines = paragraphs(document.data.toString("utf8"), "w", true);
  return slidesFromText(lines.join("\n"));
}

const slideNumber = (name: string) => Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);

/**
 * The text of each paragraph, in order.
 *
 * Both formats are the same shape: paragraphs holding runs holding text, with a
 * break element for a line inside one paragraph. Read with expressions rather
 * than a parser because the input is machine-written XML from one of two
 * programs — and a parser is a dependency with a security history, for this.
 */
function paragraphs(xml: string, namespace: "a" | "w", keepEmpty = false): string[] {
  // Both spellings: Word writes an empty paragraph as `<w:p/>`, and that empty
  // paragraph is exactly what separates one notice from the next.
  const blocks =
    xml.match(
      new RegExp(
        `<${namespace}:p(?:\\s[^>]*)?/>|<${namespace}:p(?:\\s[^>]*)?>[\\s\\S]*?</${namespace}:p>`,
        "g",
      ),
    ) ?? [];

  const lines: string[] = [];

  for (const block of blocks) {
    // A soft break inside a paragraph is a line of its own on the screen —
    // which is how most people type a two-line notice.
    for (const piece of block.split(new RegExp(`<${namespace}:br\\s*/?>`))) {
      const runs =
        piece.match(new RegExp(`<${namespace}:t[^>]*>([\\s\\S]*?)</${namespace}:t>`, "g")) ?? [];
      const text = runs
        .map((run) => decode(run.replace(new RegExp(`</?${namespace}:t[^>]*>`, "g"), "")))
        .join("")
        .trim();

      if (text || keepEmpty) lines.push(text);
    }
  }

  return lines;
}

/** The five entities XML actually requires, and numeric ones for the rest. */
function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
