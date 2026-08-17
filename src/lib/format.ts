export function formatDuration(totalSeconds: number): string {
  if (!totalSeconds) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

export function formatDate(isoDate: string): string {
  // Parse as UTC so the rendered date can't drift a day by server timezone.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** `2196` -> `36:36`, for duration inputs in the admin forms. */
export function toClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Accepts `36:36`, `1:05:00`, or a plain number of minutes. */
export function parseClock(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  if (!trimmed.includes(":")) return Math.round(Number(trimmed) * 60) || 0;

  const parts = trimmed.split(":").map((part) => Number(part) || 0);
  return parts.reduce((total, part) => total * 60 + part, 0);
}
