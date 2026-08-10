/**
 * What key a recording is in.
 *
 * Worked out from the audio rather than asked for, because the person adding a
 * song on a Thursday usually doesn't know, and the band on Sunday needs to.
 *
 * The method is the standard one: fold the spectrum down into twelve pitch
 * classes — how much of the recording is C, how much is C♯, and so on — and
 * compare that shape against the profiles Krumhansl and Kessler measured for
 * each of the twenty-four keys. The best match wins.
 *
 * It is a guess, and it says how sure it is. The usual mistake is picking the
 * relative minor over the major (they share all their notes), which is why the
 * confidence is the *gap* to the runner-up rather than how well the winner
 * scored: a song that fits two keys equally well is one nobody should trust it
 * on.
 */

/** Flats where a worship chart would use them: this is read by musicians. */
const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * How much each pitch class is used in a major and a minor key, averaged over
 * listeners in Krumhansl and Kessler's experiments. The tonic dominates, then
 * the fifth, then the third — which is what makes the shape recognisable.
 */
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export type DetectedKey = {
  /** "G", "Eb" — the tonic. */
  tonic: string;
  mode: "major" | "minor";
  /** What a musician would write at the top of a chart: "G" or "Em". */
  label: string;
  /** 0 to 1. How far clear of the next best key it came. */
  confidence: number;
};

/** Pearson correlation. Both arrays are twelve long and neither is constant. */
function correlate(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((total, value) => total + value, 0) / n;
  const meanB = b.reduce((total, value) => total + value, 0) / n;

  let top = 0;
  let leftSquares = 0;
  let rightSquares = 0;

  for (let i = 0; i < n; i++) {
    const left = a[i] - meanA;
    const right = b[i] - meanB;
    top += left * right;
    leftSquares += left * left;
    rightSquares += right * right;
  }

  const bottom = Math.sqrt(leftSquares * rightSquares);
  return bottom === 0 ? 0 : top / bottom;
}

/**
 * The best key for a twelve-value chroma vector, starting at C.
 *
 * Returns null for silence or anything else with no tonal shape at all, which
 * is the honest answer for a recording of somebody talking.
 */
export function keyFromChroma(chroma: number[]): DetectedKey | null {
  if (chroma.length !== 12) return null;

  const total = chroma.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;

  const scored: { tonic: number; mode: "major" | "minor"; score: number }[] = [];

  for (let tonic = 0; tonic < 12; tonic++) {
    // Rotate the recording's chroma so the candidate tonic sits at position 0,
    // then compare shapes.
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[(i + tonic) % 12]);
    scored.push({ tonic, mode: "major", score: correlate(rotated, MAJOR_PROFILE) });
    scored.push({ tonic, mode: "minor", score: correlate(rotated, MINOR_PROFILE) });
  }

  scored.sort((a, b) => b.score - a.score);
  const [best, runnerUp] = scored;
  if (best.score <= 0) return null;

  // The gap, scaled so that a comfortable win lands near 1 and a photo finish
  // near 0. 0.15 of correlation is about as clear as these ever get.
  const confidence = Math.max(0, Math.min(1, (best.score - runnerUp.score) / 0.15));

  return {
    tonic: NOTES[best.tonic],
    mode: best.mode,
    label: best.mode === "major" ? NOTES[best.tonic] : `${NOTES[best.tonic]}m`,
    confidence: Number(confidence.toFixed(2)),
  };
}

/** Which of the twelve notes a frequency is, or -1 if it's out of range. */
export function pitchClassOf(hertz: number): number {
  // A4 = 440Hz is pitch class 9 (A) in a table that starts at C.
  if (hertz < 55 || hertz > 5000) return -1;
  const semitonesFromA4 = 12 * Math.log2(hertz / 440);
  return (((Math.round(semitonesFromA4) + 9) % 12) + 12) % 12;
}

/**
 * In-place radix-2 FFT. Written out rather than pulled in: it's forty lines,
 * and a dependency on the worker is a thing somebody has to keep current on a
 * server nobody logs into.
 */
function fft(real: Float64Array, imaginary: Float64Array): void {
  const n = real.length;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;

    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }

  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);

    for (let i = 0; i < n; i += length) {
      let wReal = 1;
      let wImaginary = 0;

      for (let j = 0; j < length / 2; j++) {
        const evenReal = real[i + j];
        const evenImaginary = imaginary[i + j];
        const oddReal = real[i + j + length / 2] * wReal - imaginary[i + j + length / 2] * wImaginary;
        const oddImaginary =
          real[i + j + length / 2] * wImaginary + imaginary[i + j + length / 2] * wReal;

        real[i + j] = evenReal + oddReal;
        imaginary[i + j] = evenImaginary + oddImaginary;
        real[i + j + length / 2] = evenReal - oddReal;
        imaginary[i + j + length / 2] = evenImaginary - oddImaginary;

        const nextWReal = wReal * stepReal - wImaginary * stepImaginary;
        wImaginary = wReal * stepImaginary + wImaginary * stepReal;
        wReal = nextWReal;
      }
    }
  }
}

const WINDOW = 8192;
const HOP = 4096;

/**
 * Fold a recording down to twelve numbers.
 *
 * Only 80Hz to 2kHz is counted: below that is bass guitar and kick drum, which
 * smear across pitch classes, and above it is mostly cymbals and air.
 */
export function chromaFromSamples(samples: Float32Array, sampleRate: number): number[] {
  const chroma = new Array(12).fill(0);
  if (samples.length < WINDOW) return chroma;

  // Precomputed once: which pitch class each FFT bin lands in.
  const binPitchClass = new Int8Array(WINDOW / 2);
  for (let bin = 1; bin < WINDOW / 2; bin++) {
    const hertz = (bin * sampleRate) / WINDOW;
    binPitchClass[bin] = hertz >= 80 && hertz <= 2000 ? pitchClassOf(hertz) : -1;
  }

  const real = new Float64Array(WINDOW);
  const imaginary = new Float64Array(WINDOW);

  for (let start = 0; start + WINDOW <= samples.length; start += HOP) {
    for (let i = 0; i < WINDOW; i++) {
      // Hann window, so a note that doesn't line up with a bin doesn't spray
      // energy across every other one.
      const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (WINDOW - 1)));
      real[i] = samples[start + i] * hann;
      imaginary[i] = 0;
    }

    fft(real, imaginary);

    for (let bin = 1; bin < WINDOW / 2; bin++) {
      const pitchClass = binPitchClass[bin];
      if (pitchClass < 0) continue;
      chroma[pitchClass] += Math.hypot(real[bin], imaginary[bin]);
    }
  }

  return chroma;
}

/** The whole job, from samples to something to write on a chart. */
export function detectKey(samples: Float32Array, sampleRate: number): DetectedKey | null {
  return keyFromChroma(chromaFromSamples(samples, sampleRate));
}
