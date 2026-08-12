/**
 * Backgrounds: a picture, a loop, or a colour, all in one column.
 *
 * The colour form shares the location string with real files, so the tests that
 * matter are the ones that keep them apart — a colour must never be handed to
 * the bucket, and a file must never be read as a colour.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { colourCss, colourLocation, coloursIn, isColourBackground } from "@/lib/media/colour";

test("one colour is itself; two make a gradient down the screen", () => {
  assert.equal(colourCss(colourLocation("#101820")), "#101820");
  assert.equal(
    colourCss(colourLocation("#0b1220", "#1c2b4a")),
    "linear-gradient(160deg, #0b1220, #1c2b4a)",
  );
});

test("a stored file is not a colour", () => {
  assert.equal(isColourBackground("gcs:churches/citychurch/sunrise.jpg"), false);
  assert.equal(colourCss("gcs:churches/citychurch/sunrise.jpg"), null);
  assert.equal(colourCss("https://example.com/loop.mp4"), null);
});

test("anything that isn't a hex colour is dropped rather than drawn", () => {
  // The value reaches the browser as CSS, so nothing else may pass through it.
  assert.deepEqual(coloursIn("color:red"), []);
  assert.deepEqual(coloursIn("color:url(javascript:alert(1))"), []);
  assert.deepEqual(coloursIn("color:#fff"), []);
  assert.deepEqual(coloursIn("color:#101820,#2b3a55"), ["#101820", "#2b3a55"]);
  assert.equal(colourCss("color:red"), null);
});
