/**
 * A background that is a colour rather than a file.
 *
 * Stored in the same single column as everything else, as `color:#101820`, or
 * two of them for a gradient — which keeps the one-location-string model the
 * rest of the app relies on, while meaning a church that wants a deep blue
 * behind its words doesn't have to go and make a picture of one first.
 *
 * Kept apart from the resolver next door because the picker that writes these
 * runs in a browser, and the resolver reaches the storage bucket. Nothing that
 * signs a URL belongs in a page somebody has open on an iPad.
 */
const COLOUR_PREFIX = "color:";

export const isColourBackground = (location: string) => location.startsWith(COLOUR_PREFIX);

export const colourLocation = (...colours: string[]) =>
  `${COLOUR_PREFIX}${colours.join(",")}`;

/** The colours in a stored background, for putting back in the picker. */
export function coloursIn(location: string | null | undefined): string[] {
  if (!location || !isColourBackground(location)) return [];
  return location
    .slice(COLOUR_PREFIX.length)
    .split(",")
    .map((colour) => colour.trim())
    .filter((colour) => /^#[0-9a-f]{6}$/i.test(colour));
}

/**
 * The CSS for a stored colour, or null if it isn't one.
 *
 * Two colours become a gradient running down the screen — the shape that hides
 * a projector's uneven brightness, and the reason nobody makes a flat one.
 */
export function colourCss(location: string): string | null {
  const colours = coloursIn(location);
  if (colours.length === 0) return null;
  if (colours.length === 1) return colours[0];
  return `linear-gradient(160deg, ${colours.join(", ")})`;
}
