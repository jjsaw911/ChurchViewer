export type TimelineInput = {
  id: string;
  title: string;
  durationSeconds: number;
};

export type TimelineEntry<T extends TimelineInput> = {
  item: T;
  /** Minutes from the service start. */
  offsetSeconds: number;
  /** Wall clock, `H:MM AM` — what the run sheet actually shows. */
  startsAt: string;
  endsAt: string;
};

/** `"10:00"` -> minutes past midnight. Returns null if it isn't a clock time. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/** Minutes past midnight -> `10:00 AM`. Wraps past midnight rather than breaking. */
export function formatTimeOfDay(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours24 = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  const suffix = hours24 < 12 ? "AM" : "PM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/**
 * Lay the running order out against the clock. Each item starts where the last
 * one finished, so changing one duration shifts everything after it — which is
 * the whole point of planning the service this way.
 */
export function buildTimeline<T extends TimelineInput>(
  items: T[],
  startsAt: string,
): TimelineEntry<T>[] {
  const startMinutes = parseTimeOfDay(startsAt) ?? 0;
  let offsetSeconds = 0;

  return items.map((item) => {
    const entry: TimelineEntry<T> = {
      item,
      offsetSeconds,
      startsAt: formatTimeOfDay(startMinutes + offsetSeconds / 60),
      endsAt: formatTimeOfDay(startMinutes + (offsetSeconds + item.durationSeconds) / 60),
    };
    offsetSeconds += item.durationSeconds;
    return entry;
  });
}

export function totalRuntimeSeconds(items: { durationSeconds: number }[]): number {
  return items.reduce((total, item) => total + item.durationSeconds, 0);
}
