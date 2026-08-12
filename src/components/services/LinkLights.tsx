"use client";

import type { Presence } from "@/lib/live/protocol";

/**
 * A light per device, so nobody has to guess whether the link is up.
 *
 * Green is connected. Red is not — deliberately not grey, because the whole
 * job of this is to be noticed from across a room while there is still time to
 * do something about it. Sunday morning goes wrong quietly: somebody presses
 * Next, nothing moves on the screen, and there is no way to tell whether the
 * problem is the remote, the network, or the Mac at the back that never woke
 * up. This says which.
 */
function Light({ on, label, detail }: { on: boolean; label: string; detail: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={detail}>
      <span
        aria-hidden
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          on ? "bg-emerald-500" : "bg-red-500"
        }`}
      />
      <span className={on ? "text-stone-600 dark:text-stone-400" : "text-red-700 dark:text-red-400"}>
        {label}
      </span>
      <span className="sr-only">{detail}</span>
    </span>
  );
}

/**
 * What the operator needs to know about: the screen the room sees, and the
 * stage monitor if this church has one. Not the remotes — the remote is the
 * thing they are holding, and a light telling them it is switched on is a
 * light that is always green and therefore says nothing.
 */
export function OperatorLights({ presence }: { presence: Presence }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Light
        on={presence.display > 0}
        label={presence.display > 1 ? `Screen (${presence.display})` : "Screen"}
        detail={
          presence.display > 0
            ? "The screen the room sees is connected."
            : "No screen connected — open the display on the church computer."
        }
      />
      {presence.stage > 0 ? (
        <Light on label="Stage" detail="The stage monitor is connected." />
      ) : null}
    </span>
  );
}

/**
 * The other direction, for whoever is standing at the church computer: is
 * anything actually driving this? Only shown while the screen is empty, so it
 * can never appear in front of a congregation.
 */
export function DisplayLights({ presence }: { presence: Presence }) {
  return (
    <span className="inline-flex items-center gap-4 text-xs">
      <Light
        on={presence.control > 0}
        label={presence.control > 1 ? `Remote (${presence.control})` : "Remote"}
        detail={
          presence.control > 0
            ? "A remote is connected and can drive this screen."
            : "No remote connected yet."
        }
      />
    </span>
  );
}
