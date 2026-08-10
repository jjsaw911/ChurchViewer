"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * A place to put files: drop them on it, or click it and choose.
 *
 * Both, always. Dragging is what people reach for when the file is already on
 * screen in front of them, and a button is what they reach for when it isn't —
 * an upload control that only does one of the two is one somebody can't find.
 */
export default function FileDrop({
  onFiles,
  accept,
  multiple = true,
  busy = false,
  label,
  hint,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  busy?: boolean;
  label: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      onDragOver={(event) => {
        // Without preventDefault the browser navigates to the dropped file.
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
      disabled={busy}
      className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition disabled:opacity-70 ${
        compact ? "px-4 py-4" : "px-6 py-10"
      } ${
        over
          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          : "border-stone-300 hover:border-amber-400 hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-900"
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />

      <span className={`font-medium ${compact ? "text-sm" : "text-base"}`}>{label}</span>
      {hint ? <span className="text-xs text-stone-500">{hint}</span> : null}
    </button>
  );
}
