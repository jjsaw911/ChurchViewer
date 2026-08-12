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
 * So the sound goes out through a limiter: transparent below the threshold, and
 * above it a ratio steep enough that pushing harder buys almost nothing. The
 * operator's volume stays exactly where they set it; this only takes the peaks
 * off the top.
 *
 * The whole thing is conditional, and deliberately so. Handing an element to
 * Web Audio takes its sound off the speakers for good — from that moment it
 * comes out of the graph or it comes out nowhere. A context that will not start
 * is therefore not a missing limiter, it is a silent projector, so the source is
 * not created until the context is confirmed running. Where it never runs, the
 * recording plays unlimited, which is the whole point of the ordering: loud is
 * a problem, silent is a disaster.
 */
export function throughLimiter(element: HTMLAudioElement): () => void {
  const Context = window.AudioContext;
  if (!Context) return () => {};

  let context: AudioContext | null = null;
  let cancelled = false;

  void (async () => {
    try {
      const created = new Context();

      // Suspended until the window has been interacted with. Asking is free,
      // and in the Mac app it is granted outright.
      if (created.state !== "running") await created.resume().catch(() => undefined);

      // The one irreversible step, taken last and only on a live context.
      if (cancelled || created.state !== "running") {
        void created.close().catch(() => undefined);
        return;
      }

      const source = created.createMediaElementSource(element);
      const limiter = created.createDynamicsCompressor();
      // Just under the top, so ordinary material passes untouched.
      limiter.threshold.value = -6;
      // No soft knee: this is a lid, not a colour.
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      // Fast enough to catch the first hit of a chorus, slow enough coming back
      // that it doesn't breathe audibly under a sustained note.
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      source.connect(limiter);
      limiter.connect(created.destination);
      context = created;
    } catch {
      // Unlimited, and playing.
    }
  })();

  return () => {
    cancelled = true;
    void context?.close().catch(() => undefined);
  };
}
