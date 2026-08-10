/**
 * What's on the screen, as a message.
 *
 * Three programs will need to agree about this: the web app, the Mac at the
 * church driving the projector, and the iPad in somebody's hand. They won't
 * share a language or a transport, so this file is the contract — the shapes
 * on the wire, in one place, versioned.
 *
 * The transport is deliberately not part of it. Today the browser moves this
 * through `localStorage`, which is why it only works between windows of one
 * browser. A local WebSocket between the iPad and the Mac, and a relay through
 * the server when they aren't on the same network, are both the same messages
 * carried differently.
 */

/**
 * Bumped when a change would confuse an older client. Adding an optional field
 * doesn't; renaming one, or changing what a field means, does.
 */
export const PROTOCOL_VERSION = 1;

/** What should be on the screen. The whole of it — there is no other state. */
export type LiveState = {
  /** The activity being shown, or null when nothing is. */
  itemId: string | null;
  slideIndex: number;
  /** A deliberate blank — the operator's "not this, not yet". */
  blank: boolean;
};

export const IDLE_STATE: LiveState = { itemId: null, slideIndex: 0, blank: false };

/** Who is talking. A service has one display and any number of controllers. */
export type DeviceRole = "display" | "control";

/**
 * What a controller sends.
 *
 * Intent, not state: "next slide" rather than "slide 7". Two people with two
 * iPads pressing next at the same moment should advance one slide, and a
 * message that says which slide it thinks is current can't express that.
 */
export type ControlMessage =
  | { type: "show"; itemId: string; slideIndex?: number }
  | { type: "step"; delta: number }
  | { type: "blank"; blank: boolean }
  | { type: "follow"; following: boolean }
  /** Asking the display to say where it's got to; answered with `state`. */
  | { type: "hello" };

/** What the display sends back, and what any controller renders from. */
export type DisplayMessage =
  | { type: "state"; state: LiveState; serviceId: string }
  /** The plan changed underneath everyone — refetch rather than patch. */
  | { type: "planChanged"; serviceId: string };

export type Envelope<T> = {
  version: number;
  /** Which service this is about; a church may run two at once. */
  serviceId: string;
  /** Milliseconds since the epoch, from the sender's clock. */
  sentAt: number;
  message: T;
};

export function envelope<T>(serviceId: string, message: T, sentAt: number): Envelope<T> {
  return { version: PROTOCOL_VERSION, serviceId, sentAt, message };
}

/**
 * Whether a received envelope is worth acting on.
 *
 * A newer major version is refused rather than half-understood: a display that
 * guesses at a message it doesn't know is a display that does something strange
 * in front of a congregation.
 */
export function isUnderstood(envelope: { version: number }): boolean {
  return envelope.version === PROTOCOL_VERSION;
}
