/**
 * The arithmetic that decides when each part of a service happens, and the
 * text-to-slides import. Both are pure, and both are wrong in ways nobody
 * notices until they're standing on a stage.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  orderWithDrop,
  orderWithInsert,
  orderWithInsertBefore,
  orderWithMove,
} from "@/lib/services/ordering";
import { normaliseSlides, slidesFromText } from "@/lib/services/slides";
import { layoutPlan, timeSlots, toClockValue } from "@/lib/services/timeline";

type Row = {
  id: string;
  parentId: string | null;
  durationSeconds: number;
  startsAt: string | null;
};

const item = (id: string, minutes: number, extra: Partial<Row> = {}): Row => ({
  id,
  parentId: null,
  durationSeconds: minutes * 60,
  startsAt: null,
  ...extra,
});

test("items with no pinned time run one after another from the start", () => {
  const plan = layoutPlan([item("a", 15), item("b", 30)], "09:00");

  assert.deepEqual(
    plan.tree.map((entry) => entry.startsAt),
    ["9:00 AM", "9:15 AM"],
  );
  assert.equal(plan.endMinutes, 9 * 60 + 45);
});

test("a pinned time holds, and what follows flows on from it", () => {
  const plan = layoutPlan(
    [item("a", 5), item("b", 20, { startsAt: "09:15" }), item("c", 10)],
    "09:00",
  );

  assert.deepEqual(
    plan.tree.map((entry) => entry.startsAt),
    ["9:00 AM", "9:15 AM", "9:35 AM"],
  );
  // The gap between the first two is left alone rather than closed up.
  assert.equal(plan.tree[1].overlapsPrevious, false);
});

test("a pin that lands before the item before it has finished is flagged", () => {
  const plan = layoutPlan([item("a", 30), item("b", 10, { startsAt: "09:15" })], "09:00");

  assert.equal(plan.tree[1].overlapsPrevious, true);
  assert.equal(plan.tree[1].startsAt, "9:15 AM");
});

test("an activity takes its length from what's inside it", () => {
  const plan = layoutPlan(
    [
      item("worship", 5, { startsAt: "09:15" }),
      item("song-1", 6, { parentId: "worship" }),
      item("song-2", 4, { parentId: "worship" }),
      item("after", 10),
    ],
    "09:00",
  );

  const worship = plan.tree[0];
  assert.equal(worship.children.length, 2);
  // Its own five minutes are ignored — the songs are what actually runs.
  assert.equal(worship.endsAt, "9:25 AM");
  assert.deepEqual(
    worship.children.map((child) => child.startsAt),
    ["9:15 AM", "9:21 AM"],
  );
  assert.equal(plan.tree[1].startsAt, "9:25 AM");
});

test("a song inside the set can be pinned too", () => {
  const plan = layoutPlan(
    [
      item("worship", 5),
      item("song-1", 6, { parentId: "worship" }),
      item("song-2", 4, { parentId: "worship", startsAt: "09:30" }),
    ],
    "09:00",
  );

  assert.equal(plan.tree[0].children[1].startsAt, "9:30 AM");
  assert.equal(plan.tree[0].endsAt, "9:34 AM");
});

test("an item whose parent has gone is planned at the top level, not lost", () => {
  const plan = layoutPlan([item("a", 10), item("orphan", 5, { parentId: "deleted" })], "09:00");

  assert.equal(plan.tree.length, 2);
  assert.equal(plan.flat.length, 2);
});

test("the flat order reads down the page: an activity, then what's inside it", () => {
  const plan = layoutPlan(
    [item("worship", 5), item("song-1", 6, { parentId: "worship" }), item("after", 5)],
    "09:00",
  );

  assert.deepEqual(
    plan.flat.map((entry) => entry.item.id),
    ["worship", "song-1", "after"],
  );
  assert.deepEqual(
    plan.flat.map((entry) => entry.depth),
    [0, 1, 0],
  );
});

test("the ruler always runs past the end, so there's somewhere to click", () => {
  const slots = timeSlots(9 * 60, 9 * 60 + 100, 15);

  assert.equal(slots[0], 9 * 60);
  assert.ok(slots[slots.length - 1] > 9 * 60 + 100);
  assert.equal(toClockValue(slots[1]), "09:15");
});

test("an empty service still offers a stretch of clock to plan on", () => {
  const slots = timeSlots(10 * 60, 10 * 60, 15);
  assert.ok(slots.length >= 6);
});

test("pasted text becomes one slide per blank line", () => {
  const slides = slidesFromText(
    "Men's breakfast, Saturday 8am\nIn the hall\n\n\nBaptism class starts the 21st\n",
  );

  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0].lines, ["Men's breakfast, Saturday 8am", "In the hall"]);
  assert.deepEqual(slides[1].lines, ["Baptism class starts the 21st"]);
  // Times are nominal but have to stay in order for the presenter.
  assert.ok(slides[1].atMs > slides[0].atMs);
});

test("saving drops empty slides and renumbers the rest", () => {
  const slides = normaliseSlides([
    { id: "x", lines: ["  Welcome  "], atMs: 0, endMs: 0, label: " Title " },
    { id: "y", lines: ["", "   "], atMs: 0, endMs: 0 },
    { id: "z", lines: ["Second"], atMs: 0, endMs: 0 },
  ]);

  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0].lines, ["Welcome"]);
  assert.equal(slides[0].label, "Title");
  assert.deepEqual(
    slides.map((slide) => slide.id),
    ["slide-1", "slide-2"],
  );
});

test("a new item can be placed after, before, or at the end", () => {
  assert.deepEqual(orderWithInsert(["a", "b"], "a", "new"), ["a", "new", "b"]);
  assert.deepEqual(orderWithInsertBefore(["a", "b"], "a", "new"), ["new", "a", "b"]);
  assert.deepEqual(orderWithInsertBefore(["a", "b"], "", "new"), ["a", "b", "new"]);
  assert.deepEqual(orderWithMove(["a", "b"], "b", "up"), ["b", "a"]);
});

test("dragging an item lands it where it was dropped", () => {
  assert.deepEqual(orderWithDrop(["a", "b", "c"], "c", "b"), ["a", "c", "b"]);
  assert.deepEqual(orderWithDrop(["a", "b", "c"], "a", null), ["b", "c", "a"]);
});

test("dropping an item in the gap it already sits in leaves the order alone", () => {
  assert.deepEqual(orderWithDrop(["a", "b", "c"], "b", "b"), ["a", "b", "c"]);
  assert.deepEqual(orderWithDrop(["a", "b", "c"], "c", "c"), ["a", "b", "c"]);
});

test("dragging into a level it wasn't on puts it in the right place there", () => {
  // The worship set's songs, with a song dragged in from the running order.
  assert.deepEqual(orderWithDrop(["song-1", "song-2"], "reading", "song-2"), [
    "song-1",
    "reading",
    "song-2",
  ]);
});
