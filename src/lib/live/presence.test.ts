/**
 * The roll-call behind the connection lights.
 *
 * It is only ever read as "is that end there?", so the ways it can be wrong are
 * the ways that matter: a device counted twice keeps a light green after the
 * machine has gone, and a departure counted twice puts a light out while the
 * machine is still connected. Both send somebody to check a cable that was
 * always fine.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { joinService, presenceOf, watchPresence } from "@/lib/live/presence";

test("nobody is connected to a service nothing has joined", () => {
  assert.deepEqual(presenceOf("empty-service"), { display: 0, stage: 0, control: 0 });
});

test("each device is counted under its own role", () => {
  const service = "counting";
  const leaves = [
    joinService(service, "display"),
    joinService(service, "control"),
    joinService(service, "control"),
    joinService(service, "stage"),
  ];

  assert.deepEqual(presenceOf(service), { display: 1, stage: 1, control: 2 });
  for (const leave of leaves) leave();
  assert.deepEqual(presenceOf(service), { display: 0, stage: 0, control: 0 });
});

test("leaving twice only removes one device", () => {
  const service = "double-abort";
  joinService(service, "display");
  const leave = joinService(service, "display");

  leave();
  leave();

  // The other projector window is still open, and its light must stay green.
  assert.equal(presenceOf(service).display, 1);
});

test("services are counted apart from each other", () => {
  const morning = joinService("morning", "display");
  joinService("evening", "control");

  assert.deepEqual(presenceOf("morning"), { display: 1, stage: 0, control: 0 });
  assert.deepEqual(presenceOf("evening"), { display: 0, stage: 0, control: 1 });
  morning();
});

test("watchers hear arrivals and departures as they happen", () => {
  const seen: number[] = [];
  const stop = watchPresence("watched", (presence) => seen.push(presence.display));

  const leave = joinService("watched", "display");
  leave();
  stop();

  // One connected, then none — which is exactly the light going green and out.
  assert.deepEqual(seen, [1, 0]);

  joinService("watched", "display");
  assert.deepEqual(seen, [1, 0], "an unsubscribed watcher hears nothing more");
});
