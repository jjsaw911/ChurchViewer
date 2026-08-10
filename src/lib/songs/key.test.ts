/**
 * Key detection, checked on signals whose answer is known in advance: a pure
 * tone has one pitch class, and a chord built from three notes belongs to the
 * key those three notes belong to.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { chromaFromSamples, detectKey, keyFromChroma, pitchClassOf } from "@/lib/songs/key";

/** Sine tones summed together, as a recording of a chord would be. */
function tone(frequencies: number[], seconds: number, sampleRate = 22050): Float32Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    let value = 0;
    for (const frequency of frequencies) {
      value += Math.sin((2 * Math.PI * frequency * i) / sampleRate);
    }
    samples[i] = value / frequencies.length;
  }
  return samples;
}

test("a frequency lands on the note a musician would call it", () => {
  assert.equal(pitchClassOf(440), 9); // A
  assert.equal(pitchClassOf(261.63), 0); // middle C
  assert.equal(pitchClassOf(392), 7); // G
  // An octave up is the same note.
  assert.equal(pitchClassOf(880), pitchClassOf(440));
  // Out of the range worth analysing.
  assert.equal(pitchClassOf(20), -1);
});

test("a pure tone shows up as one pitch class and nothing else", () => {
  const chroma = chromaFromSamples(tone([440], 1), 22050);
  const loudest = chroma.indexOf(Math.max(...chroma));

  assert.equal(loudest, 9, "A440 should be an A");
  // The rest of the spectrum is leakage, not other notes.
  const total = chroma.reduce((sum, value) => sum + value, 0);
  assert.ok(chroma[9] / total > 0.5, "most of the energy belongs to that one note");
});

test("a C major chord is heard as C major", () => {
  // C4, E4, G4 — the three notes that define the key.
  const detected = detectKey(tone([261.63, 329.63, 392.0], 2), 22050);

  assert.ok(detected);
  assert.equal(detected.tonic, "C");
  assert.equal(detected.mode, "major");
  assert.equal(detected.label, "C");
});

test("a minor chord is heard as minor, not as its relative major", () => {
  // A3, C4, E4.
  const detected = detectKey(tone([220.0, 261.63, 329.63], 2), 22050);

  assert.ok(detected);
  assert.equal(detected.label, "Am");
});

test("a profile that fits two keys equally says so in the confidence", () => {
  // Every note used the same amount: no key fits better than any other.
  const flat = keyFromChroma(new Array(12).fill(1));
  assert.equal(flat, null, "a shapeless recording has no key worth naming");

  // The classic ambiguity: C major and A minor share all seven notes.
  const cMajorScale = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
  const scale = keyFromChroma(cMajorScale);
  assert.ok(scale);
  assert.ok(scale.confidence < 0.5, "a bare scale shouldn't be stated confidently");
});

test("silence has no key", () => {
  assert.equal(detectKey(new Float32Array(22050), 22050), null);
  assert.equal(keyFromChroma([]), null);
});
