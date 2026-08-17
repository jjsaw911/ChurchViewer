import { colourCss } from "@/lib/media/colour";
import { kindFor } from "@/lib/media/kind";
import { playbackUrl } from "@/lib/storage";

/**
 * What goes behind the words, resolved into something a browser can draw.
 *
 * Three kinds, because churches have three answers. A photograph, which is what
 * most of them upload. A loop — the moving backgrounds every other presentation
 * program has, and the reason people ask whether this one is "real" software.
 * And a colour, for the ones who tried a photograph, found they couldn't read
 * the words from the back, and want a deep blue and nothing else.
 *
 * The colour form itself lives next door in `colour.ts`, because the picker
 * that writes it runs in a browser and this file reaches the storage bucket.
 */
export type Background =
  | { kind: "image"; url: string }
  | { kind: "video"; url: string }
  | { kind: "colour"; css: string };

/**
 * Turn a stored location into the background itself.
 *
 * Signing a bucket URL costs a round trip, so a colour is answered without one
 * — which is most of the reason a church that only wants a colour should be
 * able to say so rather than uploading a picture of one.
 */
export async function resolveBackground(
  location: string | null | undefined,
): Promise<Background | null> {
  if (!location) return null;

  const css = colourCss(location);
  if (css) return { kind: "colour", css };

  const url = await playbackUrl(location);
  if (!url) return null;

  // The name is all there is to go on; there is no content type stored beside
  // it. That is exactly the case `kindFor` exists for.
  return { kind: kindFor("", location) === "video" ? "video" : "image", url };
}

export { colourCss, colourLocation, coloursIn, isColourBackground } from "@/lib/media/colour";
