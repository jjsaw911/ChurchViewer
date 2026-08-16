"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import MediaField from "@/components/admin/MediaField";
import ActivitySlides from "@/components/services/ActivitySlides";
import ScreenPreview from "@/components/services/ScreenPreview";
import ScreenPreviewDialog from "@/components/services/ScreenPreviewDialog";
import {
  addServiceItemAction,
  deleteServiceItemAction,
  moveItemToAction,
  moveServiceItemAction,
  setItemDurationAction,
  updateServiceItemAction,
} from "@/lib/services/actions";
import { effectiveSlides, type SlideSource } from "@/lib/services/slides";
import type { Background } from "@/lib/media/background";
import type { Attachment } from "@/lib/media/attachment";
import {
  formatTimeOfDay,
  layoutPlan,
  timeSlots,
  toClockValue,
  type PlanEntry,
} from "@/lib/services/timeline";
import type { SlidePayload } from "@/lib/songs/types";

/**
 * The service as a clock you can click.
 *
 * The ruler runs down the left in quarter hours. Anything planned sits against
 * the time it happens; anything not planned yet is an empty quarter hour with a
 * "+" on it — which is the whole interaction: click 9:00, say what happens at
 * 9:00. An activity can hold others (the worship set holds its songs), and each
 * one carries the slides that go on the screen while it runs.
 */

const STEP_MINUTES = 15;

export type PlanItem = {
  id: string;
  parentId: string | null;
  title: string;
  kind: string;
  durationSeconds: number;
  /** A start pinned by hand, `HH:MM`, or null to follow the item before it. */
  startsAt: string | null;
  owner: string;
  notes: string;
  songId: string | null;
  songSlug: string | null;
  /** The linked song's slides — what shows when this item has none of its own. */
  songSlides: SlidePayload[];
  slides: SlidePayload[];
  mediaUrl: string | null;
  /** A background for this activity only, overriding the service's own. */
  backgroundSrc: string | null;
  /** The attached file, already resolved into something showable. */
  attachment: Attachment | null;
  /** The linked song's recording, so a row can be listened to where it sits. */
  songAudioUrl: string | null;
  /** What sits behind the words on the screen for this activity. */
  background: Background | null;
};

export const KINDS = [
  "song",
  "worship",
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
  worship: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
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

/**
 * How far the bottom edge of a box travels for one minute.
 *
 * The ruler isn't drawn to scale — a service laid out at real proportions is
 * either a page nobody can see the end of, or boxes too short to read. So the
 * drag is a rate rather than a position: pull down, and the length goes up at a
 * pace that makes a five minute change an easy movement and a fifty minute one
 * deliberate.
 */
const PIXELS_PER_MINUTE = 5;

/** The same map without one key, or the same object when it wasn't in it. */
function forget(lengths: Record<string, number>, itemId: string): Record<string, number> {
  if (lengths[itemId] === undefined) return lengths;
  const next = { ...lengths };
  delete next[itemId];
  return next;
}

/** Where a dragged item is being let go: a level, and what it lands before. */
type DropTarget = { parentId: string | null; beforeItemId?: string | null };

type Drag = {
  /** The item currently under the cursor, or null when nothing is moving. */
  id: string | null;
  begin: (id: string) => void;
  end: () => void;
  drop: (target: DropTarget) => void;
};

type Resize = {
  /** The minutes being dragged onto an item right now, or null when idle. */
  pending: Record<string, number>;
  begin: (itemId: string, fromMinutes: number, fromY: number) => void;
  /** One minute at a time, for the buttons and for anyone on a keyboard. */
  step: (itemId: string, fromMinutes: number, delta: number) => void;
};

/** What the corner preview is currently showing. */
export type Focus = {
  itemId: string;
  title: string;
  slides: SlidePayload[];
  background: Background | null;
  picture: string | null;
  video: boolean;
};

type Shared = {
  tenant: string;
  serviceId: string;
  /** For the address of the output window this plan drives. */
  serviceSlug: string;
  /** Called as the pointer moves down the plan, to keep the corner in step. */
  focus: (focus: Focus) => void;
  /** The shape of the screen, so every preview is drawn as the room sees it. */
  screenAspect: string;
  /** Everything with something to show, in order, for a run-through. */
  plan: Focus[];
  songOptions: { id: string; title: string }[];
  slideSources: SlideSource[];
  uploadsEnabled: boolean;
  drag: Drag;
  resize: Resize;
};

/** Where a new activity goes: inside what, and between which two things. */
type Placement = {
  parentId?: string;
  afterItemId?: string;
  beforeItemId?: string;
  /** Prefilled clock time, from the slot that was clicked. */
  startsAt?: string;
};

function AddActivityForm({
  shared,
  placement,
  onDone,
}: {
  shared: Shared;
  placement: Placement;
  onDone: () => void;
}) {
  const nested = Boolean(placement.parentId);
  const [kind, setKind] = useState(nested ? "song" : "announcements");
  // Inside a worship set the song usually isn't in the library yet — that's the
  // moment someone has the mp3 in their hand.
  const [newSong, setNewSong] = useState(shared.songOptions.length === 0);

  return (
    <form
      action={addServiceItemAction}
      onSubmit={onDone}
      className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/30"
    >
      <input type="hidden" name="tenant" value={shared.tenant} />
      <input type="hidden" name="serviceId" value={shared.serviceId} />
      {placement.parentId ? (
        <input type="hidden" name="parentId" value={placement.parentId} />
      ) : null}
      {placement.afterItemId ? (
        <input type="hidden" name="afterItemId" value={placement.afterItemId} />
      ) : null}
      {placement.beforeItemId ? (
        <input type="hidden" name="beforeItemId" value={placement.beforeItemId} />
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs">
          <span className="block font-medium">Activity</span>
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
          <span className="block font-medium">Called</span>
          <input
            name="title"
            placeholder="Leave blank for a default"
            className={`${field} w-52`}
          />
        </label>

        <label className="space-y-1 text-xs">
          <span className="block font-medium">Starts</span>
          <input
            name="startsAt"
            defaultValue={placement.startsAt ?? ""}
            placeholder={nested ? "follows on" : "10:00"}
            className={`${field} w-24 font-mono`}
          />
        </label>

        <label className="space-y-1 text-xs">
          <span className="block font-medium">Minutes</span>
          <input
            name="durationMinutes"
            type="number"
            min={0}
            defaultValue={kind === "sermon" ? 30 : 5}
            key={kind}
            className={`${field} w-20`}
          />
        </label>
      </div>

      {kind === "song" ? (
        <div className="space-y-2 border-t border-amber-200 pt-3 dark:border-amber-900">
          {!newSong ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs">
                <span className="block font-medium">Song</span>
                <select name="songId" className={`${field} w-56`} defaultValue="">
                  <option value="">—</option>
                  {shared.songOptions.map((song) => (
                    <option key={song.id} value={song.id}>
                      {song.title}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setNewSong(true)}
                className="pb-2 text-xs font-medium text-amber-800 hover:underline dark:text-amber-400"
              >
                or add a new song
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-xs">
                  <span className="block font-medium">New song</span>
                  <input
                    name="newSongTitle"
                    placeholder="Cornerstone"
                    className={`${field} w-56`}
                  />
                </label>
                <label className="space-y-1 text-xs">
                  <span className="block font-medium">YouTube link (optional)</span>
                  <input
                    name="newSongSourceUrl"
                    placeholder="https://www.youtube.com/watch?v=…"
                    className={`${field} w-64`}
                  />
                </label>
                {shared.songOptions.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setNewSong(false)}
                    className="pb-2 text-xs font-medium text-amber-800 hover:underline dark:text-amber-400"
                  >
                    or pick one you have
                  </button>
                ) : null}
              </div>

              <MediaField
                name="newSongAudioSrc"
                label="Recording"
                tenant={shared.tenant}
                accept="audio/*,video/*"
                kinds={["audio", "video"]}
                uploadsEnabled={shared.uploadsEnabled}
                hint="Upload the mp3 and the lyrics are transcribed into slides in the background. Only recordings your church has the right to use."
              />
            </div>
          )}
        </div>
      ) : null}

      {kind === "worship" ? (
        <p className="text-xs text-stone-600 dark:text-stone-400">
          A block to hang songs off — add them inside it once it&apos;s here, and it takes its
          length from them.
        </p>
      ) : null}

      <div className="flex items-center gap-2">
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
      </div>
    </form>
  );
}

/** One empty quarter hour: the invitation to plan something at that time. */
function EmptySlot({
  shared,
  minutes,
  placement,
  showLabel,
  nextItemId,
}: {
  shared: Shared;
  minutes: number;
  placement: Placement;
  /** Kept visible while there's nothing planned — an empty page of faint plus
      signs tells someone nothing about what to do with it. */
  showLabel: boolean;
  /** The activity this gap sits above, so a drop knows what it lands before. */
  nextItemId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const dragging = Boolean(shared.drag.id);

  if (open) {
    return <AddActivityForm shared={shared} placement={placement} onDone={() => setOpen(false)} />;
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      onDragOver={(event) => {
        if (!dragging) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        if (!dragging) return;
        event.preventDefault();
        setOver(false);
        // Dropping on open clock puts it back on the running order itself,
        // which is the only way to get a song out of the worship set.
        shared.drag.drop({ parentId: null, beforeItemId: nextItemId });
      }}
      className={`group flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-left text-sm hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-500 ${
        over
          ? "border-amber-500 bg-amber-50/60 text-amber-700 dark:bg-amber-950/20"
          : "border-transparent text-stone-400"
      }`}
    >
      <span className="text-lg leading-none">{dragging ? "↳" : "+"}</span>
      <span
        className={`transition group-hover:opacity-100 group-focus:opacity-100 ${
          showLabel || dragging ? "" : "opacity-0"
        }`}
      >
        {dragging ? "Move it here" : `Add an activity at ${formatTimeOfDay(minutes)}`}
      </span>
    </button>
  );
}

/** The embedded player for whatever this activity carries. */
function AttachmentPlayer({ item }: { item: PlanItem }) {
  const attachment = item.attachment;

  if (attachment?.kind === "youtube" && attachment.videoId) {
    return (
      <iframe
        title={item.title}
        src={`https://www.youtube.com/embed/${attachment.videoId}`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full max-w-lg rounded-lg bg-black"
      />
    );
  }

  if (attachment?.kind === "image" && attachment.url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={attachment.url} alt="" className="max-h-64 rounded-lg" />;
  }

  if (attachment?.kind === "video" && attachment.url) {
    return (
      <video
        controls
        preload="metadata"
        src={attachment.url}
        className="max-h-64 w-full max-w-lg rounded-lg bg-black"
      />
    );
  }

  const audio = attachment?.kind === "audio" ? attachment.url : item.songAudioUrl;
  if (audio) return <audio controls preload="none" src={audio} className="w-full max-w-lg" />;

  if (attachment?.url) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-500"
      >
        Open the attached file
      </a>
    );
  }

  return <p className="text-xs text-stone-500">Nothing attached to this one yet.</p>;
}

function ActivityBlock({
  shared,
  entry,
  index,
  count,
}: {
  shared: Shared;
  entry: PlanEntry<PlanItem>;
  index: number;
  count: number;
}) {
  const [panel, setPanel] = useState<"none" | "edit" | "slides" | "media">("none");
  const [addingChild, setAddingChild] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [over, setOver] = useState<"before" | "inside" | null>(null);
  const item = entry.item;
  const minutes = Math.round(item.durationSeconds / 60);
  const runsFor = Math.round(entry.endMinutes - entry.startMinutes);
  const holdsOthers = entry.children.length > 0;
  const slides = effectiveSlides({ slides: item.slides, songSlides: item.songSlides });
  const ownSlides = item.slides.length > 0;
  const playable = Boolean(item.attachment ?? item.songAudioUrl);

  const dragging = shared.drag.id;
  const elsewhere = Boolean(dragging) && dragging !== item.id;

  const picture =
    slides.length === 0 && item.attachment?.kind === "image" ? item.attachment.url : null;
  const isVideo = item.attachment?.kind === "video" || item.attachment?.kind === "youtube";

  return (
    <div
      // The corner preview follows the pointer down the plan, so scanning the
      // order shows what the room sees at each point in it.
      onMouseEnter={() =>
        shared.focus({
          itemId: item.id,
          title: item.title,
          slides,
          background: item.background,
          picture,
          video: isVideo,
        })
      }
      // Dropping on a block puts the dragged item immediately above it, at that
      // block's own level — which is how a song gets dragged into the set it's
      // dropped onto, and back out onto the running order.
      onDragOver={(event) => {
        if (!elsewhere) return;
        event.preventDefault();
        event.stopPropagation();
        setOver("before");
      }}
      onDragLeave={() => setOver(null)}
      onDrop={(event) => {
        if (!elsewhere) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(null);
        shared.drag.drop({ parentId: item.parentId, beforeItemId: item.id });
      }}
      // A longer activity is a taller box, but only up to a point: at true
      // proportions the sermon would push everything after it off the screen.
      style={{ minHeight: 34 + Math.min(90, (holdsOthers ? runsFor : minutes) * 1.6) }}
      className={`flex flex-col rounded-xl border bg-white dark:bg-stone-900 ${
        over === "before"
          ? "border-amber-500 shadow-[0_-3px_0_0_theme(colors.amber.500)]"
          : "border-stone-200 dark:border-stone-800"
      } ${dragging === item.id ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <span
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", item.id);
            shared.drag.begin(item.id);
          }}
          onDragEnd={() => shared.drag.end()}
          title="Drag to move it"
          aria-hidden
          className="-my-1 cursor-grab px-1 text-stone-300 select-none hover:text-stone-500 active:cursor-grabbing dark:text-stone-600"
        >
          ⠿
        </span>
        <span className="w-20 shrink-0 font-mono text-sm text-amber-700 dark:text-amber-500">
          {entry.startsAt}
          {item.startsAt ? <span title="Pinned to this time"> ·</span> : null}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            KIND_STYLE[item.kind] ?? KIND_STYLE.other
          }`}
        >
          {item.kind}
        </span>
        {/* What the room will see, at the shape of the screen it goes on.
            Clicking it opens the same thing at a size somebody can read. */}
        <button type="button" onClick={() => setPreviewing(true)} title="See it full size">
          <ScreenPreview
            aspect={shared.screenAspect}
            slide={slides[0] ?? null}
            slideCount={slides.length}
            background={item.background}
            picture={
              slides.length === 0 && item.attachment?.kind === "image"
                ? item.attachment.url
                : null
            }
            video={item.attachment?.kind === "video" || item.attachment?.kind === "youtube"}
          />
        </button>

        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>

        {item.owner ? (
          <span className="hidden text-xs text-stone-500 sm:inline">{item.owner}</span>
        ) : null}
        {/* How long it runs, and the two buttons that change it. A grip on the
            bottom edge is quicker once you know it's there, but nobody finds a
            grip they haven't been told about. */}
        {holdsOthers ? (
          <span className="text-xs text-stone-500" title="As long as what's inside it">
            {runsFor}m
          </span>
        ) : (
          <span className="flex items-center rounded-lg border border-stone-200 dark:border-stone-700">
            <button
              type="button"
              onClick={() => shared.resize.step(item.id, minutes, -1)}
              disabled={minutes <= 0}
              aria-label={`Make ${item.title} a minute shorter`}
              className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"
            >
              −
            </button>
            <span
              className={`w-9 text-center text-xs tabular-nums ${
                shared.resize.pending[item.id] !== undefined
                  ? "font-semibold text-amber-700 dark:text-amber-500"
                  : "text-stone-500"
              }`}
            >
              {minutes}m
            </span>
            <button
              type="button"
              onClick={() => shared.resize.step(item.id, minutes, 1)}
              aria-label={`Make ${item.title} a minute longer`}
              className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              +
            </button>
          </span>
        )}

        {/* Audio opens a player in place, so checking the recording is the
            right one doesn't mean leaving the plan. Video is already shown
            below, so it needs no button. */}
        {playable && !isVideo ? (
          <button
            type="button"
            onClick={() => setPanel(panel === "media" ? "none" : "media")}
            title="Play it here"
            className="rounded border border-stone-300 px-1.5 py-0.5 text-xs hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            {panel === "media" ? "▾" : "▶"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => setPanel(panel === "slides" ? "none" : "slides")}
          className={`rounded border px-1.5 py-0.5 text-xs font-medium ${
            slides.length
              ? "border-amber-400 text-amber-800 dark:text-amber-400"
              : "border-stone-300 text-stone-500 dark:border-stone-700"
          }`}
        >
          {slides.length ? `${slides.length} slides` : "slides"}
          {slides.length && !ownSlides ? <span className="font-normal"> (song)</span> : null}
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
          className="rounded border border-stone-300 px-1.5 py-0.5 text-xs font-medium hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          {panel === "edit" ? "close" : "edit"}
        </button>
      </div>

      {entry.overlapsPrevious ? (
        <p className="border-t border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Pinned to {entry.startsAt}, but what&apos;s before it hasn&apos;t finished by then.
        </p>
      ) : null}

      {/* A clip attached to an activity plays inside that activity, not behind
          a button: it's part of what happens at this point in the service, and
          the person planning wants to see which clip it is. */}
      {isVideo ? (
        <div className="border-t border-stone-100 p-3 dark:border-stone-800">
          <AttachmentPlayer item={item} />
        </div>
      ) : null}

      {previewing ? (
        <ScreenPreviewDialog
          serviceId={shared.serviceId}
          serviceSlug={shared.serviceSlug}
          aspect={shared.screenAspect}
          plan={shared.plan}
          itemId={item.id}
          onClose={() => setPreviewing(false)}
        />
      ) : null}

      {panel === "media" ? (
        <div className="space-y-2 border-t border-stone-100 p-3 dark:border-stone-800">
          <AttachmentPlayer item={item} />
          <div className="flex flex-wrap gap-4 text-xs">
            {item.songSlug ? (
              <>
                <a
                  href={`/admin/songs/${item.songSlug}`}
                  className="font-medium text-amber-700 hover:underline dark:text-amber-500"
                >
                  Song page
                </a>
                <a
                  href={`/present/songs/${item.songSlug}`}
                  className="font-medium text-amber-700 hover:underline dark:text-amber-500"
                >
                  Present with the recording
                </a>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {panel === "slides" ? (
        <div className="border-t border-stone-200 p-3 dark:border-stone-800">
          <ActivitySlides
            tenant={shared.tenant}
            serviceId={shared.serviceId}
            itemId={item.id}
            initialSlides={item.slides}
            songSlides={item.songSlides}
            songSlug={item.songSlug}
            sources={shared.slideSources}
          />
        </div>
      ) : null}

      {panel === "edit" ? (
        <div className="space-y-3 border-t border-stone-200 p-3 dark:border-stone-800">
          <form action={updateServiceItemAction} className="space-y-3">
            <input type="hidden" name="tenant" value={shared.tenant} />
            <input type="hidden" name="serviceId" value={shared.serviceId} />
            <input type="hidden" name="itemId" value={item.id} />

            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs">
                <span className="block font-medium">Activity</span>
                <select name="kind" defaultValue={item.kind} className={field}>
                  {KINDS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs">
                <span className="block font-medium">Called</span>
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
                <span className="block font-medium">Starts</span>
                <input
                  name="startsAt"
                  defaultValue={item.startsAt ?? ""}
                  placeholder="follows on"
                  className={`${field} w-24 font-mono`}
                />
              </label>

              <label className="space-y-1 text-xs">
                <span className="block font-medium">Minutes</span>
                <input
                  name="durationMinutes"
                  type="number"
                  min={0}
                  defaultValue={minutes}
                  disabled={holdsOthers}
                  className={`${field} w-20 disabled:opacity-50`}
                />
              </label>
            </div>

            <p className="text-xs text-stone-500">
              Leave the start empty and it begins when the item before it ends.
              {holdsOthers ? " This one is as long as what's inside it." : ""}
            </p>

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

              <div className="min-w-56 flex-1 text-xs">
                <MediaField
                  key={item.mediaUrl ?? "none"}
                  name="mediaUrl"
                  label="Picture or clip"
                  tenant={shared.tenant}
                  defaultValue={item.mediaUrl}
                  uploadsEnabled={shared.uploadsEnabled}
                  kinds={["image", "video", "audio"]}
                  hint="Shows on this row, and goes on the screen when it's a picture and there are no slides."
                />
              </div>
            </div>

            <div className="text-xs">
              <MediaField
                key={item.backgroundSrc ?? "no-background"}
                name="backgroundSrc"
                label="Background for this activity"
                tenant={shared.tenant}
                defaultValue={item.backgroundSrc}
                accept="image/*,video/*"
                kinds={["image", "video"]}
                colours
                uploadsEnabled={shared.uploadsEnabled}
                hint="Behind the words for this one activity — a picture, a silent loop, or a colour. Empty uses the song's own, then the service's."
              />
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
                Remove{holdsOthers ? " (and what's inside it)" : ""}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {/* The bottom edge, to pull the activity longer or shorter. An activity
          that holds songs has no length of its own to drag. */}
      {!holdsOthers ? (
        <div
          onPointerDown={(event) => {
            event.preventDefault();
            shared.resize.begin(item.id, minutes, event.clientY);
          }}
          title="Drag to change how long it runs"
          className="group/resize mt-auto flex h-4 cursor-ns-resize items-center justify-center rounded-b-xl border-t border-stone-100 hover:bg-amber-50 dark:border-stone-800 dark:hover:bg-amber-950/30"
        >
          <span className="text-[0.6rem] tracking-widest text-stone-400 group-hover/resize:text-amber-700 dark:group-hover/resize:text-amber-500">
            ⇕ drag to change the length
          </span>
        </div>
      ) : null}

      {/* Everything inside this activity: the songs in the set, in order. */}
      {entry.depth === 0 ? (
        <div
          onDragOver={(event) => {
            if (!elsewhere) return;
            event.preventDefault();
            event.stopPropagation();
            setOver("inside");
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(event) => {
            if (!elsewhere) return;
            event.preventDefault();
            event.stopPropagation();
            setOver(null);
            shared.drag.drop({ parentId: item.id, beforeItemId: null });
          }}
          className={`space-y-2 border-t p-3 pl-8 ${
            over === "inside"
              ? "border-amber-500 bg-amber-50/60 dark:bg-amber-950/20"
              : "border-stone-100 dark:border-stone-800"
          }`}
        >
          {entry.children.map((child, childIndex) => (
            <ActivityBlock
              key={child.item.id}
              shared={shared}
              entry={child}
              index={childIndex}
              count={entry.children.length}
            />
          ))}

          {addingChild ? (
            <AddActivityForm
              shared={shared}
              placement={{
                parentId: item.id,
                afterItemId: entry.children[entry.children.length - 1]?.item.id,
              }}
              onDone={() => setAddingChild(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingChild(true)}
              className="text-xs font-medium text-stone-500 hover:text-amber-700 hover:underline dark:hover:text-amber-500"
            >
              + Add something inside {item.title}
              {elsewhere ? " — or drop it here" : ""}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function ServicePlanner({
  tenant,
  serviceId,
  serviceSlug,
  serviceStartsAt,
  items,
  songOptions,
  slideSources,
  uploadsEnabled,
  screenAspect,
}: {
  tenant: string;
  serviceId: string;
  serviceSlug: string;
  serviceStartsAt: string;
  items: PlanItem[];
  songOptions: { id: string; title: string }[];
  slideSources: SlideSource[];
  uploadsEnabled: boolean;
  /** The shape of the screen this service goes on, like "16:9". */
  screenAspect: string;
}) {
  const router = useRouter();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, number>>({});
  const [focused, setFocused] = useState<Focus | null>(null);
  const [showCorner, setShowCorner] = useState(true);
  /** Set while somebody is walking the whole service in the preview. */
  const [rehearsing, setRehearsing] = useState<string | null>(null);

  /**
   * What the corner shows before anybody has pointed at anything: the first
   * activity that actually puts something on the screen, which is what the
   * service opens with.
   */
  const asFocus = useCallback((item: PlanItem): Focus => {
    const slides = effectiveSlides(item);
    return {
      itemId: item.id,
      title: item.title,
      slides,
      background: item.background,
      picture:
        slides.length === 0 && item.attachment?.kind === "image"
          ? item.attachment.url
          : null,
      video: item.attachment?.kind === "video" || item.attachment?.kind === "youtube",
    };
  }, []);

  /**
   * The service as a run of screens.
   *
   * Only the ones that put something up: walking through a rehearsal should not
   * stop on the worship heading that exists to hold three songs, or on a prayer
   * with nothing written for it.
   */
  const runnable = useMemo<Focus[]>(
    () =>
      items
        .map(asFocus)
        .filter((entry) => entry.slides.length > 0 || entry.picture || entry.video),
    [asFocus, items],
  );

  const opening = useMemo<Focus | null>(() => {
    const first =
      items.find((item) => effectiveSlides(item).length > 0) ??
      items.find((item) => item.attachment?.kind === "image") ??
      items[0];
    return first ? asFocus(first) : null;
  }, [asFocus, items]);

  // Sticky: the last thing pointed at stays up, because a preview that clears
  // itself the moment the mouse moves away is one nobody can look at.
  const showing = focused ?? opening;
  const [, startTransition] = useTransition();

  /**
   * Pull the bottom of a box and the whole plan below it moves with you: the
   * lengths here are merged into the layout before it's worked out, so the
   * times on the ruler are the times you'd get if you let go now.
   */
  const beginResize = (itemId: string, fromMinutes: number, fromY: number) => {
    let minutes = fromMinutes;

    const onMove = (event: PointerEvent) => {
      const next = Math.max(
        0,
        Math.min(240, fromMinutes + Math.round((event.clientY - fromY) / PIXELS_PER_MINUTE)),
      );
      if (next === minutes) return;
      minutes = next;
      setPending((current) => ({ ...current, [itemId]: next }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (minutes === fromMinutes) {
        setPending((current) => forget(current, itemId));
        return;
      }

      startTransition(async () => {
        const result = await setItemDurationAction({ tenant, serviceId, itemId, minutes });
        if (!result.ok) setDropError(result.error ?? "That length didn't save.");
        router.refresh();
        // Held until the refreshed plan arrives, so the box doesn't snap back
        // to the old length for the moment in between.
        setPending((current) => forget(current, itemId));
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  /** The same change, one minute at a time, from a button. */
  const stepResize = (itemId: string, fromMinutes: number, delta: number) => {
    const minutes = Math.max(0, Math.min(240, fromMinutes + delta));
    if (minutes === fromMinutes) return;

    setPending((current) => ({ ...current, [itemId]: minutes }));
    startTransition(async () => {
      const result = await setItemDurationAction({ tenant, serviceId, itemId, minutes });
      if (!result.ok) setDropError(result.error ?? "That length didn't save.");
      router.refresh();
      setPending((current) => forget(current, itemId));
    });
  };

  const drag: Drag = {
    id: draggingId,
    begin: (id) => {
      setDraggingId(id);
      setDropError(null);
    },
    end: () => setDraggingId(null),
    drop: (target) => {
      const itemId = draggingId;
      setDraggingId(null);
      if (!itemId) return;

      startTransition(async () => {
        const result = await moveItemToAction({ tenant, serviceId, itemId, ...target });
        if (!result.ok) setDropError(result.error ?? "That didn't move.");
        router.refresh();
      });
    },
  };

  const shared: Shared = {
    tenant,
    serviceId,
    serviceSlug,
    plan: runnable,
    focus: setFocused,
    screenAspect,
    songOptions,
    slideSources,
    uploadsEnabled,
    drag,
    resize: { pending, begin: beginResize, step: stepResize },
  };

  const { rows, count } = useMemo(() => {
    const dragged = Object.keys(pending).length
      ? items.map((item) =>
          pending[item.id] === undefined
            ? item
            : { ...item, durationSeconds: pending[item.id] * 60 },
        )
      : items;

    const plan = layoutPlan(dragged, serviceStartsAt);
    const slots = timeSlots(plan.startMinutes, plan.endMinutes, STEP_MINUTES);
    const first = slots[0];
    const lastIndex = slots.length - 1;

    // Every activity is filed under a tick, clamped at both ends so one pinned
    // before the service starts, or dragged out past the ruler, still shows.
    // The index it carries is its place in the running order, which is what
    // decides whether it can still be moved up.
    const startingAt = new Map<number, { entry: PlanEntry<PlanItem>; index: number }[]>();
    plan.tree.forEach((entry, index) => {
      const slot = Math.min(
        lastIndex,
        Math.max(0, Math.floor((entry.startMinutes - first) / STEP_MINUTES)),
      );
      startingAt.set(slot, [...(startingAt.get(slot) ?? []), { entry, index }]);
    });

    return {
      count: plan.tree.length,
      rows: slots.map((minutes, slotIndex) => {
        const starting = startingAt.get(slotIndex) ?? [];
        // A tick the middle of a long sermon runs through isn't free to plan on.
        const covered = plan.tree.some(
          (entry) =>
            entry.startMinutes < minutes + STEP_MINUTES && entry.endMinutes > minutes,
        );

        // The new activity slots in after whatever is already running by then.
        const previous = [...plan.tree]
          .reverse()
          .find((entry) => entry.startMinutes <= minutes);

        // What a drop on this gap should land above: the next thing planned.
        const next = plan.tree.find((entry) => entry.startMinutes > minutes);

        return {
          minutes,
          starting,
          free: starting.length === 0 && !covered,
          nextItemId: next?.item.id ?? null,
          placement: {
            startsAt: toClockValue(minutes),
            ...(previous
              ? { afterItemId: previous.item.id }
              : plan.tree[0]
                ? { beforeItemId: plan.tree[0].item.id }
                : {}),
          } satisfies Placement,
        };
      }),
    };
  }, [items, pending, serviceStartsAt]);

  return (
    <div>
      {/* Pinned to the corner rather than in the flow: it answers "what is on
          the screen at this point" while you're looking somewhere else, which
          is the whole reason to have it. It stays on whatever it was last
          shown — a preview that vanishes the moment you move the mouse away
          is one you can't look at. */}
      {showing && showCorner ? (
        <aside className="fixed right-4 bottom-4 z-40 w-64 space-y-2 rounded-xl border border-stone-200 bg-white/95 p-2 shadow-lg backdrop-blur dark:border-stone-700 dark:bg-stone-900/95">
          <ScreenPreview
            size="full"
            aspect={screenAspect}
            slide={showing.slides[0] ?? null}
            slideCount={showing.slides.length}
            background={showing.background}
            picture={showing.picture}
            video={showing.video}
          />
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-medium">{showing.title}</p>
            <button
              type="button"
              onClick={() => setShowCorner(false)}
              title="Hide this"
              className="text-xs text-stone-500 hover:underline"
            >
              hide
            </button>
          </div>

          {/* Sitting at the projector on a Thursday, the useful thing is not
              one slide — it is the whole morning, in order, without any of it
              reaching the screen. */}
          {runnable.length > 0 ? (
            <button
              type="button"
              onClick={() => setRehearsing(runnable[0].itemId)}
              className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium hover:border-amber-400 dark:border-stone-700"
            >
              Run through the whole service
            </button>
          ) : null}
        </aside>
      ) : null}

      {!showCorner ? (
        <button
          type="button"
          onClick={() => setShowCorner(true)}
          className="fixed right-4 bottom-4 z-40 rounded-lg border border-stone-300 bg-white/95 px-3 py-1.5 text-xs font-medium shadow backdrop-blur dark:border-stone-700 dark:bg-stone-900/95"
        >
          Show the screen preview
        </button>
      ) : null}

      {rehearsing ? (
        <ScreenPreviewDialog
          serviceId={serviceId}
          serviceSlug={serviceSlug}
          aspect={screenAspect}
          plan={runnable}
          itemId={rehearsing}
          onClose={() => setRehearsing(null)}
        />
      ) : null}

      {dropError ? (
        <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {dropError}
        </p>
      ) : null}

      <div className="divide-y divide-stone-100 dark:divide-stone-800/60">
        {rows.map((row) => (
          <div key={row.minutes} className="flex gap-2 py-0.5">
            <span className="w-16 shrink-0 pt-3 text-right font-mono text-xs text-stone-400">
              {formatTimeOfDay(row.minutes)}
            </span>

            <div className="min-w-0 flex-1 space-y-2">
              {row.starting.map(({ entry, index }) => (
                <ActivityBlock
                  key={entry.item.id}
                  shared={shared}
                  entry={entry}
                  index={index}
                  count={count}
                />
              ))}

              {row.free ? (
                <EmptySlot
                  shared={shared}
                  minutes={row.minutes}
                  placement={row.placement}
                  showLabel={items.length === 0}
                  nextItemId={row.nextItemId}
                />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
