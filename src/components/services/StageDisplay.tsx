"use client";

import { useFullscreenKey } from "@/components/services/LiveOutput";
import { formatClock, useNow } from "@/lib/services/clock";
import { useLiveState } from "@/lib/services/live";
import type { PresentItem } from "@/lib/services/present";

/**
 * The screen facing the platform.
 *
 * Not a copy of the output: the point is what the person on stage can't see
 * from where they're standing — what's up now, what's coming next, their own
 * notes, and the time, which is the thing every service quietly runs out of.
 */
export default function StageDisplay({
  serviceId,
  serviceTitle,
  items,
}: {
  serviceId: string;
  serviceTitle: string;
  items: PresentItem[];
}) {
  const state = useLiveState(serviceId);
  useFullscreenKey();
  const now = useNow();

  const index = items.findIndex((item) => item.id === state.itemId);
  const item = index === -1 ? null : items[index];
  const slide = item?.slides[state.slideIndex] ?? null;

  // What's next is the next slide of this activity, or failing that the next
  // activity — the two questions anyone on a platform actually has.
  const nextSlide = item?.slides[state.slideIndex + 1] ?? null;
  const nextItem = index === -1 ? null : (items[index + 1] ?? null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-white/10 px-8 py-4">
        <div>
          <p className="text-lg font-semibold">{item?.title ?? serviceTitle}</p>
          <p className="text-sm text-white/40">
            {item
              ? [item.owner, `${item.startsAt} – ${item.endsAt}`].filter(Boolean).join(" · ")
              : "Nothing on screen"}
          </p>
        </div>
        <p className="font-mono text-3xl tabular-nums">{now === null ? "—:—" : formatClock(now)}</p>
      </header>

      <main className="flex flex-1 items-center justify-center px-10 py-8 text-center">
        {state.blank ? (
          <p className="text-3xl tracking-[0.3em] text-white/30 uppercase">Screen blank</p>
        ) : slide ? (
          <div className="space-y-4">
            {slide.label ? (
              <p className="text-xs font-semibold tracking-[0.3em] text-white/40 uppercase">
                {slide.label}
              </p>
            ) : null}
            {slide.lines.map((line, i) => (
              <p key={i} className="text-4xl leading-tight font-semibold text-balance lg:text-6xl">
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-2xl text-white/30">{serviceTitle}</p>
        )}
      </main>

      {item?.notes ? (
        <p className="border-t border-white/10 px-8 py-3 text-lg text-amber-300">{item.notes}</p>
      ) : null}

      <footer className="border-t border-white/10 px-8 py-4">
        <p className="text-xs tracking-[0.2em] text-white/30 uppercase">Next</p>
        {nextSlide ? (
          <p className="truncate text-xl text-white/70">{nextSlide.lines.join(" / ")}</p>
        ) : nextItem ? (
          <p className="truncate text-xl text-white/70">
            {nextItem.title}
            <span className="ml-3 text-base text-white/40">{nextItem.startsAt}</span>
          </p>
        ) : (
          <p className="text-xl text-white/30">End of the service</p>
        )}
      </footer>
    </div>
  );
}
