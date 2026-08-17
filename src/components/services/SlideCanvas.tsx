"use client";

import type { SlidePayload } from "@/lib/songs/types";

/**
 * The words on a slide, at the same size relative to the screen wherever they
 * are drawn.
 *
 * Every measurement here is a percentage of the box it sits in — `cqw` is one
 * hundredth of the container's width — so the projector and the little preview
 * beside the plan are the same picture at two sizes. That matters for one
 * reason: a line that wraps on the wall has to wrap in the preview, or the
 * preview is worse than useless. It says "that fits" on Thursday and the room
 * reads two thirds of a sentence on Sunday.
 *
 * The container itself declares `container-type: size`, which is what these
 * units are measured against.
 */
export default function SlideCanvas({ slide }: { slide: SlidePayload }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center text-center"
      style={{ gap: "3cqh", paddingInline: "6cqw" }}
    >
      {slide.label ? (
        <p
          className="font-semibold text-white/40 uppercase"
          style={{ fontSize: "1.5cqw", letterSpacing: "0.3em" }}
        >
          {slide.label}
        </p>
      ) : null}

      {slide.lines.map((line, index) => (
        <p
          key={index}
          className="font-semibold text-balance text-white"
          style={{ fontSize: "4.6cqw", lineHeight: 1.15 }}
        >
          {line}
        </p>
      ))}
    </div>
  );
}
