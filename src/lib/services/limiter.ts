"use client";

/**
 * A ceiling on how loud anything can arrive.
 *
 * Recordings are not mastered to match each other. One song comes off a phone
 * recording of a rehearsal and the next off a record, and between them there
 * can be eight or ten decibels — which, at the volume the quiet one needed, is
 * a wall of sound landing on a room mid-worship. Nobody is standing at the
 * computer to catch it, and by the time they get there it has happened.
 *
 * So everything goes through a limiter on the way out: transparent below the
 * threshold, and above it a ratio steep enough that pushing harder buys almost
 * nothing. The operator's volume stays exactly where they set it — this only
 * takes the peaks off the top.
 *
 * Cross-origin audio must be fetched with CORS or the browser silences the
 * whole graph, so the element is marked `anonymous` before it is given a
 * source. The bucket serves `access-control-allow-origin: *` on media.
 *
 * If any of this fails — no Web Audio, a context that will not start, a source
 * that has already been claimed — the element plays on its own, unlimited but
 * audible. Silence is the one outcome worth ruling out.
 */
export function throughLimiter(element: HTMLAudioElement): (() => void) | null {
  const Context = window.AudioContext;
  if (!Context) return null;

  try {
    const context = new Context();
    const source = context.createMediaElementSource(element);

    const limiter = context.createDynamicsCompressor();
    // Just under the top, so ordinary material passes untouched.
    limiter.threshold.value = -6;
    // No soft knee: this is a lid, not a colour.
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    // Fast enough to catch the first hit of a chorus, slow enough on the way
    // back that it doesn't breathe audibly under a sustained note.
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    source.connect(limiter);
    limiter.connect(context.destination);

    // A context created before anybody has touched the window starts suspended;
    // resuming is refused until they have. The Mac app is allowed outright.
    void context.resume().catch(() => undefined);

    return () => void context.close().catch(() => undefined);
  } catch {
    // Unlimited, and playing. See above.
    return null;
  }
}
