/**
 * Where things sit in a running order.
 *
 * Kept apart from the database work so the arithmetic that decides an order can
 * be tested on its own — an off-by-one here silently reshuffles somebody's
 * Sunday, and that's not a thing you notice until you're standing on a stage.
 */

/**
 * The ids in order once a new item is inserted directly after `afterItemId`.
 *
 * An `afterItemId` that isn't in the list appends. That's the case where the
 * item was deleted in another tab between the page rendering and the click:
 * putting the new item last is wrong-ish but harmless and obvious, where
 * throwing would lose what the person just typed.
 *
 * Passing an empty `afterItemId` appends too, which is what the "add to the
 * end" button relies on.
 */
export function orderWithInsert(
  ids: readonly string[],
  afterItemId: string,
  newId: string,
): string[] {
  const next = [...ids];
  const at = afterItemId ? next.indexOf(afterItemId) : -1;
  const insertAt = at === -1 ? next.length : at + 1;
  next.splice(insertAt, 0, newId);
  return next;
}

/**
 * Swap an item one place up or down, returning the new order.
 *
 * A move off either end is a no-op rather than an error — the buttons are
 * disabled at the ends, but a double-click or a stale page can still send one.
 */
export function orderWithMove(
  ids: readonly string[],
  itemId: string,
  direction: "up" | "down",
): string[] {
  const next = [...ids];
  const at = next.indexOf(itemId);
  if (at === -1) return next;

  const target = direction === "up" ? at - 1 : at + 1;
  if (target < 0 || target >= next.length) return next;

  [next[at], next[target]] = [next[target], next[at]];
  return next;
}
