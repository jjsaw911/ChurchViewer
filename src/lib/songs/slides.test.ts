/**
 * The slide builder and service timeline, which decide what the congregation
 * sees and when. Both are pure, so they can be checked without OpenAI.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { buildLines, buildSlides, slideAt, retimeSlides } from "@/lib/songs/slides";
import { buildTimeline, formatTimeOfDay, parseTimeOfDay, totalRuntimeSeconds } from "@/lib/services/timeline";
import { youtubeVideoId } from "@/lib/youtube";
import type { TranscribedWord } from "@/lib/songs/types";

/** Words at a steady pace, with an explicit gap before any word listed in `gaps`. */
function words(spec: { word: string; gapBefore?: number }[]): TranscribedWord[] {
  let clock = 0;
  return spec.map(({ word, gapBefore = 0 }) => {
    clock += gapBefore;
    const start = clock;
    clock += 0.3;
    return { word, start, end: clock };
  });
}

test("a breath between phrases starts a new line", () => {
  const lines = buildLines(
    words([
      { word: "we" },
      { word: "gather" },
      { word: "here" },
      { word: "to", gapBefore: 0.9 },
      { word: "sing" },
    ]),
  );
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "we gather here");
  assert.equal(lines[1].text, "to sing");
});

test("an unbroken phrase still wraps once it gets too long", () => {
  const many = Array.from({ length: 20 }, () => ({ word: "hallelujah" }));
  const lines = buildLines(words(many));
  assert.ok(lines.length > 1, "expected a long phrase to be split");
  for (const line of lines) {
    assert.ok(line.text.length <= 60, `line too long to read: ${line.text}`);
  }
});

test("a long pause forces a new slide even when the current one has room", () => {
  const slides = buildSlides(
    words([
      { word: "verse" },
      { word: "one" },
      { word: "chorus", gapBefore: 3 },
      { word: "starts" },
    ]),
    { lineGapSeconds: 0.55, slideGapSeconds: 1.8, maxLineChars: 42, linesPerSlide: 2 },
  );
  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0].lines, ["verse one"]);
  assert.deepEqual(slides[1].lines, ["chorus starts"]);
});

test("each slide holds until the next one is due, so the screen is never blank", () => {
  const slides = buildSlides(
    words([{ word: "one" }, { word: "two", gapBefore: 3 }, { word: "three", gapBefore: 3 }]),
    { lineGapSeconds: 0.55, slideGapSeconds: 1.8, maxLineChars: 42, linesPerSlide: 1 },
    30,
  );
  assert.equal(slides.length, 3);
  for (let i = 0; i < slides.length - 1; i++) {
    assert.equal(slides[i].endMs, slides[i + 1].atMs, "gap between slides");
  }
  assert.equal(slides.at(-1)!.endMs, 30_000, "last slide should run to the end of the recording");
});

test("no words means no slides, rather than an empty one", () => {
  assert.deepEqual(buildSlides([]), []);
});

test("slideAt finds the slide on screen, and honours the nudge", () => {
  const slides = [
    { id: "a", lines: ["a"], atMs: 0, endMs: 5000 },
    { id: "b", lines: ["b"], atMs: 5000, endMs: 10000 },
    { id: "c", lines: ["c"], atMs: 10000, endMs: 15000 },
  ];
  assert.equal(slideAt(slides, 0), 0);
  assert.equal(slideAt(slides, 4999), 0);
  assert.equal(slideAt(slides, 5000), 1);
  assert.equal(slideAt(slides, 99999), 2);
  // A positive offset holds each slide back.
  assert.equal(slideAt(slides, 5100, 500), 0);
  assert.equal(slideAt(slides, 5600, 500), 1);
});

test("retiming after an edit re-sorts and closes the gaps", () => {
  const retimed = retimeSlides(
    [
      { id: "x", lines: ["second"], atMs: 8000, endMs: 9000 },
      { id: "y", lines: ["first"], atMs: 1000, endMs: 2000 },
    ],
    20000,
  );
  assert.deepEqual(retimed.map((s) => s.lines[0]), ["first", "second"]);
  assert.equal(retimed[0].endMs, 8000);
  assert.equal(retimed[1].endMs, 20000);
});

test("the running order lays items against the clock", () => {
  const items = [
    { id: "1", title: "Welcome", durationSeconds: 300 },
    { id: "2", title: "Songs", durationSeconds: 900 },
    { id: "3", title: "Message", durationSeconds: 1800 },
  ];
  const timeline = buildTimeline(items, "10:00");
  assert.deepEqual(timeline.map((entry) => entry.startsAt), ["10:00 AM", "10:05 AM", "10:20 AM"]);
  assert.equal(timeline.at(-1)!.endsAt, "10:50 AM");
  assert.equal(totalRuntimeSeconds(items), 3000);
});

test("a service that runs past noon or midnight still reads correctly", () => {
  assert.equal(formatTimeOfDay(0), "12:00 AM");
  assert.equal(formatTimeOfDay(12 * 60), "12:00 PM");
  assert.equal(formatTimeOfDay(23 * 60 + 30), "11:30 PM");
  assert.equal(formatTimeOfDay(24 * 60 + 15), "12:15 AM");
  assert.equal(parseTimeOfDay("18:30"), 18 * 60 + 30);
  assert.equal(parseTimeOfDay("25:00"), null);
  assert.equal(parseTimeOfDay("half ten"), null);
});

test("YouTube links are recognised in every shape people paste", () => {
  const id = "dQw4w9WgXcQ";
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?t=42`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://music.youtube.com/watch?v=${id}&list=abc`,
    `youtube.com/watch?v=${id}`,
    id,
  ]) {
    assert.equal(youtubeVideoId(url), id, url);
  }
  assert.equal(youtubeVideoId("https://vimeo.com/12345"), null);
  assert.equal(youtubeVideoId("https://youtube.com.evil.test/watch?v=" + id), null);
  assert.equal(youtubeVideoId(""), null);
});
