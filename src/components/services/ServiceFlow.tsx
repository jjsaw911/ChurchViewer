"use client";

import { Fragment, useState } from "react";
import {
  addServiceItemAction,
  deleteServiceItemAction,
  moveServiceItemAction,
  updateServiceItemAction,
} from "@/lib/services/actions";

/**
 * The running order as a chain of boxes with an arrow between each pair.
 *
 * Vertical rather than left-to-right: a Sunday order runs to a dozen items or
 * more, and a horizontal chain would either scroll off the screen or shrink
 * each box past the point of being readable. Down the page it reads like the
 * service actually runs, and works on the phone someone is holding on stage.
 */

export type FlowItem = {
  id: string;
  title: string;
  kind: string;
  durationSeconds: number;
  owner: string;
  notes: string;
  songId: string | null;
  songSlug: string | null;
  mediaUrl: string | null;
  /** Wall-clock time this item starts, already computed against the service. */
  startsAt: string;
};

export const KINDS = [
  "song",
  "scripture",
  "prayer",
  "sermon",
  "offering",
  "announcements",
  "communion",
  "other",
] as const;

/** A colour per kind, so the shape of a service is legible at a glance. */
const KIND_STYLE: Record<string, string> = {
  song: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  scripture: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  prayer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  sermon: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  offering: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  announcements: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  communion: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  other: "bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200",
};

const field =
  "rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-amber-500 focus:outline-none dark:border-stone-700 dark:bg-stone-900";

type Shared = {
  tenant: string;
  serviceId: string;
  songOptions: { id: string; title: string }[];
};

/** The compact form behind a "+" — enough to place an item, not to finish it. */
function AddItemForm({
  tenant,
  serviceId,
  songOptions,
  afterItemId,
  onDone,
}: Shared & { afterItemId?: string; onDone: () => void }) {
  const [kind, setKind] = useState("song");

  return (
    <form
      action={addServiceItemAction}
      onSubmit={onDone}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <input type="hidden" name="tenant" value={tenant} />
      <input type="hidden" name="serviceId" value={serviceId} />
      {afterItemId ? <input type="hidden" name="afterItemId" value={afterItemId} /> : null}

      <label className="space-y-1 text-xs">
        <span className="block font-medium">Kind</span>
        <select
          name="kind"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          className={field}
        >
          {KINDS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-xs">
        <span className="block font-medium">Title</span>
        <input name="title" placeholder="Leave blank for a default" className={`${field} w-52`} />
      </label>

      {kind === "song" && songOptions.length > 0 ? (
        <label className="space-y-1 text-xs">
          <span className="block font-medium">Song</span>
          <select name="songId" className={field} defaultValue="">
            <option value="">—</option>
            {songOptions.map((song) => (
              <option key={song.id} value={song.id}>
                {song.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="space-y-1 text-xs">
        <span className="block font-medium">Minutes</span>
        <input
          name="durationMinutes"
          type="number"
          min={0}
          defaultValue={5}
          className={`${field} w-20`}
        />
      </label>

      <button
        type="submit"
        className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800"
      >
        Add
      </button>
      <button
        type="button"
        onClick={onDone}
        className="px-2 py-2 text-sm text-stone-500 hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}

/** The arrow between two boxes, carrying the insert point. */
function Connector({ shared, afterItemId }: { shared: Shared; afterItemId: string }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="py-2 pl-6">
        <AddItemForm {...shared} afterItemId={afterItemId} onDone={() => setOpen(false)} />
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 py-1 pl-6">
      {/* The arrow: a short stem and a chevron, drawn rather than an image so
          it inherits the text colour in both themes. */}
      <svg
        aria-hidden
        viewBox="0 0 12 34"
        className="h-8 w-3 shrink-0 text-stone-300 dark:text-stone-700"
      >
        <path d="M6 0 V26" stroke="currentColor" strokeWidth="2" fill="none" />
        <path d="M1.5 24 L6 32 L10.5 24" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-stone-300 px-2 py-0.5 text-xs text-stone-500 opacity-0 transition group-hover:opacity-100 focus:opacity-100 dark:border-stone-700"
      >
        + insert here
      </button>
    </div>
  );
}

function ItemBox({
  shared,
  item,
  index,
  count,
}: {
  shared: Shared;
  item: FlowItem;
  index: number;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const minutes = Math.round(item.durationSeconds / 60);

  return (
    <div className="rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <span className="w-16 font-mono text-sm text-amber-700 dark:text-amber-500">
          {item.startsAt}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            KIND_STYLE[item.kind] ?? KIND_STYLE.other
          }`}
        >
          {item.kind}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{item.title}</span>
        {item.owner ? (
          <span className="hidden text-sm text-stone-500 sm:inline">{item.owner}</span>
        ) : null}
        <span className="text-sm text-stone-500">{minutes}m</span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded-lg border border-stone-300 px-3 py-1 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {open ? "Close" : "Edit"}
        </button>
      </div>

      {item.songSlug || item.mediaUrl ? (
        <div className="flex flex-wrap gap-4 border-t border-stone-100 px-4 py-2 text-xs dark:border-stone-800">
          {item.songSlug ? (
            <a
              href={`/present/songs/${item.songSlug}`}
              className="font-medium text-amber-700 hover:underline dark:text-amber-500"
            >
              Present slides
            </a>
          ) : null}
          {item.mediaUrl ? (
            <a
              href={item.mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 hover:underline dark:text-amber-500"
            >
              Video
            </a>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="space-y-4 border-t border-stone-200 p-4 dark:border-stone-800">
          <form action={updateServiceItemAction} className="space-y-3">
            <input type="hidden" name="tenant" value={shared.tenant} />
            <input type="hidden" name="serviceId" value={shared.serviceId} />
            <input type="hidden" name="itemId" value={item.id} />

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs">
                <span className="block font-medium">Kind</span>
                <select name="kind" defaultValue={item.kind} className={field}>
                  {KINDS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="block font-medium">Title</span>
                <input name="title" defaultValue={item.title} className={`${field} w-56`} />
              </label>

              <label className="space-y-1 text-xs">
                <span className="block font-medium">Who</span>
                <input
                  name="owner"
                  defaultValue={item.owner}
                  placeholder="Worship team"
                  className={`${field} w-40`}
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="block font-medium">Minutes</span>
                <input
                  name="durationMinutes"
                  type="number"
                  min={0}
                  defaultValue={minutes}
                  className={`${field} w-20`}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs">
                <span className="block font-medium">Song</span>
                <select name="songId" defaultValue={item.songId ?? ""} className={field}>
                  <option value="">—</option>
                  {shared.songOptions.map((song) => (
                    <option key={song.id} value={song.id}>
                      {song.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex-1 space-y-1 text-xs">
                <span className="block font-medium">Video link</span>
                <input
                  name="mediaUrl"
                  defaultValue={item.mediaUrl ?? ""}
                  placeholder="https://… a clip to play at this point"
                  className={`${field} w-full min-w-56`}
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="block font-medium">Notes</span>
              <textarea
                name="notes"
                defaultValue={item.notes}
                rows={2}
                placeholder="Anything the person running this needs to know"
                className={`${field} w-full`}
              />
            </label>

            <button
              type="submit"
              className="rounded-lg bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800"
            >
              Save
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-4 border-t border-stone-200 pt-3 text-xs dark:border-stone-800">
            {[
              { direction: "up", label: "Move up", disabled: index === 0 },
              { direction: "down", label: "Move down", disabled: index === count - 1 },
            ].map((move) => (
              <form key={move.direction} action={moveServiceItemAction}>
                <input type="hidden" name="tenant" value={shared.tenant} />
                <input type="hidden" name="serviceId" value={shared.serviceId} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="direction" value={move.direction} />
                <button
                  type="submit"
                  disabled={move.disabled}
                  className="text-stone-500 hover:underline disabled:opacity-40"
                >
                  {move.label}
                </button>
              </form>
            ))}
            <form action={deleteServiceItemAction}>
              <input type="hidden" name="tenant" value={shared.tenant} />
              <input type="hidden" name="serviceId" value={shared.serviceId} />
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" className="text-red-700 hover:underline dark:text-red-400">
                Remove
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ServiceFlow({
  tenant,
  serviceId,
  items,
  songOptions,
}: {
  tenant: string;
  serviceId: string;
  items: FlowItem[];
  songOptions: { id: string; title: string }[];
}) {
  const shared: Shared = { tenant, serviceId, songOptions };
  const [addingAtEnd, setAddingAtEnd] = useState(false);

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-dashed border-stone-300 p-10 text-center text-sm text-stone-500 dark:border-stone-700">
          Nothing planned yet. Add the first thing that happens.
        </p>
        <AddItemForm {...shared} onDone={() => undefined} />
      </div>
    );
  }

  return (
    <div>
      {items.map((item, index) => (
        <Fragment key={item.id}>
          <ItemBox shared={shared} item={item} index={index} count={items.length} />
          {index < items.length - 1 ? (
            <Connector shared={shared} afterItemId={item.id} />
          ) : null}
        </Fragment>
      ))}

      {/* The tail of the chain: same arrow, then either the button or the form. */}
      <div className="flex items-center gap-3 py-1 pl-6">
        <svg
          aria-hidden
          viewBox="0 0 12 34"
          className="h-8 w-3 shrink-0 text-stone-300 dark:text-stone-700"
        >
          <path d="M6 0 V26" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M1.5 24 L6 32 L10.5 24" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
        {addingAtEnd ? null : (
          <button
            type="button"
            onClick={() => setAddingAtEnd(true)}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            + Add to the end
          </button>
        )}
      </div>

      {addingAtEnd ? (
        <div className="pl-6">
          <AddItemForm {...shared} onDone={() => setAddingAtEnd(false)} />
        </div>
      ) : null}
    </div>
  );
}
