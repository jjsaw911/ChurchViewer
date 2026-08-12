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
  /**
   * Whether the display should be playing the current item's recording.
   *
   * An instruction to the machine at the projector, where the sound system is,
   * rather than a description of what the operator's phone is doing.
   */
  playing: boolean;
  /**
   * What is lined up next: chosen, visible to the operator, not on the screen.
   *
   * A service moves item to item, and the moment between them is when somebody
   * needs to see what is coming without the room seeing it yet.
   */
  armedItemId: string | null;
  /**
   * How loud the recordings play, 0 to 100.
   *
   * Set from the remote and obeyed by the machine at the projector, because the
   * person who can hear that it is too loud is standing in the room rather than
   * at the computer. Below it sits a limiter the operator never sees, so the
   * one song mastered eight decibels hotter than the rest cannot arrive at
   * eight decibels louder.
   */
  volume: number;
};

export const IDLE_STATE: LiveState = {
  itemId: null,
  slideIndex: 0,
  blank: false,
  playing: false,
  armedItemId: null,
  volume: 85,
};

/** Volume as the audio elements want it. */
export const asGain = (volume: number) => Math.min(100, Math.max(0, volume)) / 100;

/**
 * What the machine at the projector is actually doing, as opposed to what it
 * was told to do.
 *
 * `playing` in the live state is an instruction — it is true the moment
 * somebody presses Start, whether or not there is a machine listening, whether
 * or not that machine has the recording, whether or not its browser refused to
 * make a noise. The remote showing "Stop" on the strength of that is the remote
 * telling somebody a song is running when the room is silent.
 *
 * This is the other direction: a position that moves, sent while the audio is
 * genuinely moving. A number going up is proof. Nothing else is.
 */
export type Playback = {
  /** Seconds into the recording. */
  position: number;
  /** Its full length, or 0 before that is known. */
  duration: number;
};

/** Who is talking. A service has one display and any number of controllers. */
export type DeviceRole = "display" | "stage" | "control";

/**
 * Who is actually connected right now, counted by role.
 *
 * The point of this is a light somebody can look at. Between the iPad in a
 * hand and the Mac at the projector there is a network, a login and a browser
 * window that may or may not still be open, and none of that is visible from
 * either end — so pressing Next and seeing nothing happen looks exactly like
 * the app being broken. A dot that was already red says which half to go and
 * look at, before the service rather than during it.
 */
export type Presence = {
  /** Machines showing the congregation's screen. */
  display: number;
  /** Confidence monitors facing the platform. */
  stage: number;
  /** Remotes and run sheets — anybody driving. */
  control: number;
};

export const NOBODY: Presence = { display: 0, stage: 0, control: 0 };

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
  | { type: "planChanged"; serviceId: string }
  /** Somebody joined or left. Sent to everyone, including the one who did. */
  | { type: "presence"; presence: Presence; serviceId: string }
  /** The projector, saying where it has actually got to. Not persisted. */
  | { type: "playback"; playback: Playback; serviceId: string };

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
