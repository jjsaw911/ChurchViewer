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

/** What the planner needs from a row to work out where it sits on the clock. */
export type PlanInput = {
  id: string;
  parentId: string | null;
  durationSeconds: number;
  /** A start pinned by hand, `HH:MM`, or null to follow the previous item. */
  startsAt: string | null;
};

export type PlanEntry<T extends PlanInput> = {
  item: T;
  /** 0 for the running order itself, 1 for something inside an activity. */
  depth: number;
  /** Minutes past midnight — fractional when a duration isn't whole minutes. */
  startMinutes: number;
  endMinutes: number;
  startsAt: string;
  endsAt: string;
  /** A pinned time that lands before the item before it has finished. */
  overlapsPrevious: boolean;
  children: PlanEntry<T>[];
};

export type Plan<T extends PlanInput> = {
  /** The running order as a tree — top-level activities, each with its own. */
  tree: PlanEntry<T>[];
  /** The same entries in the order they appear down the page. */
  flat: PlanEntry<T>[];
  startMinutes: number;
  endMinutes: number;
};

/** One level deep. A running order that nests further stops being readable. */
const MAX_DEPTH = 1;

/**
 * Lay the running order out against the clock.
 *
 * Two things decide where an item starts. Most of them simply follow the one
 * before, which is what makes a plan useful: stretch the sermon and everything
 * after it moves. An item with `startsAt` set is pinned to that time instead —
 * the announcements really do start at 9:00 whatever ran over before them — and
 * the items after it flow on from there.
 *
 * An activity with things inside it (the worship set and its songs) takes its
 * length from them rather than from its own `durationSeconds`; the songs are
 * the truth about how long the set runs.
 */
export function layoutPlan<T extends PlanInput>(items: T[], serviceStartsAt: string): Plan<T> {
  const startMinutes = parseTimeOfDay(serviceStartsAt) ?? 0;

  const topLevelIds = new Set(items.filter((item) => !item.parentId).map((item) => item.id));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];
  for (const item of items) {
    // An item whose parent isn't a top-level activity (a stale id, or a nesting
    // deeper than the planner allows) is shown at the top level rather than
    // silently dropped off the plan.
    if (item.parentId && topLevelIds.has(item.parentId) && item.parentId !== item.id) {
      const siblings = childrenOf.get(item.parentId) ?? [];
      siblings.push(item);
      childrenOf.set(item.parentId, siblings);
    } else {
      roots.push(item);
    }
  }

  const flat: PlanEntry<T>[] = [];

  /** Lay out one level and return the minute the last of them finishes. */
  const layoutLevel = (level: T[], from: number, depth: number): PlanEntry<T>[] => {
    let cursor = from;

    return level.map((item) => {
      const pinned = item.startsAt ? parseTimeOfDay(item.startsAt) : null;
      const start = pinned ?? cursor;
      const kids = depth < MAX_DEPTH ? (childrenOf.get(item.id) ?? []) : [];

      const entry: PlanEntry<T> = {
        item,
        depth,
        startMinutes: start,
        endMinutes: start,
        startsAt: formatTimeOfDay(start),
        endsAt: formatTimeOfDay(start),
        overlapsPrevious: pinned !== null && pinned < cursor,
        children: [],
      };
      // Pushed before the children so the flat list reads down the page.
      flat.push(entry);

      entry.children = layoutLevel(kids, start, depth + 1);
      const lastChild = entry.children[entry.children.length - 1];
      entry.endMinutes = lastChild
        ? Math.max(start, lastChild.endMinutes)
        : start + item.durationSeconds / 60;
      entry.endsAt = formatTimeOfDay(entry.endMinutes);

      cursor = entry.endMinutes;
      return entry;
    });
  };

  const tree = layoutLevel(roots, startMinutes, 0);
  const last = tree[tree.length - 1];

  return {
    tree,
    flat,
    startMinutes,
    endMinutes: last ? Math.max(startMinutes, last.endMinutes) : startMinutes,
  };
}

/**
 * The ticks the planner draws, in minutes past midnight.
 *
 * Always runs past the end of the plan, because the point of the ruler is to
 * have somewhere to click for the thing that doesn't exist yet.
 */
export function timeSlots(
  startMinutes: number,
  endMinutes: number,
  stepMinutes = 15,
  minimumSpanMinutes = 90,
): number[] {
  const step = Math.max(1, stepMinutes);
  const first = Math.floor(startMinutes / step) * step;
  const last = Math.max(endMinutes + step, first + minimumSpanMinutes);

  const slots: number[] = [];
  for (let minute = first; minute <= last; minute += step) slots.push(minute);
  return slots;
}

/** `540` -> `"09:00"` — the form value a pinned start is stored as. */
export function toClockValue(totalMinutes: number): string {
  const wrapped = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

/**
 * Today, as services are dated.
 *
 * UTC, which is what the server runs on and what `held_on` is compared
 * against. It rolls over during Saturday evening in the Americas, and that is
 * the harmless direction to be wrong in: a screen switched on the night before
 * comes up on tomorrow's plan rather than yesterday's.
 */
export function todayForServices(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
