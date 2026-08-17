/**
 * The ChurchViewer mark: a screen with a church standing in it.
 *
 * Drawn rather than an image file, so it stays sharp at 16 pixels in a browser
 * tab and at 200 on the marketing page, and so the tile keeps its own dark
 * background whichever theme the page is in — the mark is dark-on-dark by
 * design, and the glow is what gives it its shape.
 */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 128 128" aria-hidden className={className}>
      <defs>
        <linearGradient id="cv-frame" x1="14" y1="96" x2="114" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4F7BFB" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
        <radialGradient id="cv-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6C8BFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6C8BFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="128" height="128" rx="28" fill="#0E1117" />
      <ellipse cx="64" cy="74" rx="46" ry="26" fill="url(#cv-glow)" />
      <path
        d="M38 96 H26 A12 12 0 0 1 14 84 V44 A12 12 0 0 1 26 32 H102 A12 12 0 0 1 114 44 V84 A12 12 0 0 1 102 96 H90"
        fill="none"
        stroke="url(#cv-frame)"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="60" y="38" width="8" height="24" rx="1.5" fill="#232B3E" />
      <rect x="53" y="45" width="22" height="7" rx="1.5" fill="#232B3E" />
      <path d="M64 54 L86 72 V96 H42 V72 Z" fill="#232B3E" />
      <path d="M57 96 V82 a7 7 0 0 1 14 0 V96 Z" fill="url(#cv-frame)" />
    </svg>
  );
}

/** Mark and name together, as they appear in a header. */
export default function Logo({
  className = "",
  markClassName = "h-9 w-9",
  showTagline = false,
}: {
  className?: string;
  markClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <span className="leading-tight">
        <span className="block text-lg font-semibold tracking-tight">
          church
          <span className="bg-gradient-to-r from-[#4F7BFB] to-[#A855F7] bg-clip-text text-transparent">
            viewer
          </span>
        </span>
        {showTagline ? (
          <span className="block text-[0.6rem] tracking-[0.2em] text-stone-500 uppercase">
            Present worship. Inspire people.
          </span>
        ) : null}
      </span>
    </span>
  );
}
