"use client";

import { useRef, type ReactNode } from "react";
import { useStoredNumber } from "@/lib/ui/stored";

const MIN_PANEL = 260;
const MAX_PANEL = 640;

/**
 * Two columns with a divider you can drag.
 *
 * How wide the running order wants to be depends on the plan and the screen —
 * a long set of songs with owners and notes wants room; a short order next to a
 * dropbox for the week's video doesn't. Rather than guess, the divider moves,
 * and where it's put is remembered.
 *
 * Below `lg` the two stack and the divider goes away: there isn't width to
 * divide on a phone, and the run sheet is a thing people open on one.
 */
export default function SplitPane({
  children,
  panel,
  storageKey,
  defaultPanelWidth = 340,
}: {
  children: ReactNode;
  panel: ReactNode;
  storageKey: string;
  defaultPanelWidth?: number;
}) {
  const [width, setWidth] = useStoredNumber(storageKey, defaultPanelWidth);
  const frame = useRef<HTMLDivElement>(null);

  const clamp = (value: number) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, value));

  const beginDrag = (event: React.PointerEvent) => {
    event.preventDefault();
    const right = frame.current?.getBoundingClientRect().right ?? 0;

    const onMove = (move: PointerEvent) => setWidth(clamp(right - move.clientX));
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div ref={frame} className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-0">
      <div className="min-w-0 flex-1">{children}</div>

      <div
        onPointerDown={beginDrag}
        onDoubleClick={() => setWidth(defaultPanelWidth)}
        title="Drag to change the width — double-click to reset"
        role="separator"
        aria-orientation="vertical"
        className="group hidden w-4 shrink-0 cursor-col-resize items-center justify-center self-stretch lg:flex"
      >
        <span className="h-16 w-1 rounded-full bg-stone-200 transition group-hover:bg-amber-500 dark:bg-stone-700" />
      </div>

      {/* The width lands as a custom property so it only applies once the two
          are side by side; stacked, the panel is simply full width. */}
      <aside
        style={{ ["--panel-width" as string]: `${width}px` }}
        className="w-full shrink-0 lg:w-[var(--panel-width)]"
      >
        {panel}
      </aside>
    </div>
  );
}
