import type { SlidePayload, TranscriptPayload } from "@/lib/songs/types";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const mediaKindEnum = pgEnum("media_kind", ["video", "audio"]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "editor"]);

/**
 * A person with a login. `passwordHash` is null for Google-only accounts and
 * `googleSub` is null for password-only ones; an account can carry both once
 * the same verified email signs in each way.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Always stored lower-cased — the uniqueness rule depends on it. */
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    uniqueIndex("users_google_sub_key").on(t.googleSub),
  ],
);

/**
 * Login sessions. We store only a SHA-256 of the cookie value, so a leaked
 * database still doesn't hand anyone a usable session.
 */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

/** A registered church — one tenant, reachable at `<slug>.churchviewer.com`. */
export const churches = pgTable(
  "churches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    tagline: text("tagline").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("churches_slug_key").on(t.slug)],
);

/** Who can administer which church. */
export const memberships = pgTable(
  "memberships",
  {
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.churchId, t.userId] }),
    index("memberships_user_id_idx").on(t.userId),
  ],
);

export const series = pgTable(
  "series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /** See `src/lib/storage.ts` for the `gcs:` / `https:` location format. */
    artworkSrc: text("artwork_src"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("series_church_slug_key").on(t.churchId, t.slug)],
);

export const sermons = pgTable(
  "sermons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    speaker: text("speaker").notNull(),
    seriesId: uuid("series_id").references(() => series.id, { onDelete: "set null" }),
    preachedOn: date("preached_on").notNull(),
    scripture: text("scripture").notNull().default(""),
    description: text("description").notNull().default(""),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    mediaKind: mediaKindEnum("media_kind").notNull().default("video"),
    /** Location strings — `gcs:<object-key>` or an external `https://` URL. */
    mediaSrc: text("media_src").notNull(),
    posterSrc: text("poster_src"),
    captionsSrc: text("captions_src"),
    published: boolean("published").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sermons_church_slug_key").on(t.churchId, t.slug),
    index("sermons_church_date_idx").on(t.churchId, t.preachedOn),
  ],
);

/**
 * A worship song, its recording, and the timed slides built from it.
 *
 * `sourceUrl` is the YouTube link used for playback and slide sync.
 * `audioSrc` is the file we transcribe — see `src/lib/storage.ts` for the
 * location format. They're separate because the church may legitimately hold
 * the audio while pointing playback at a video.
 */
export const songStatusEnum = pgEnum("song_status", [
  "draft",
  "transcribing",
  "ready",
  "failed",
]);

export const songs = pgTable(
  "songs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    author: text("author").notNull().default(""),
    /** CCLI song number, for the church's own reporting. */
    ccliNumber: text("ccli_number").notNull().default(""),
    sourceUrl: text("source_url"),
    audioSrc: text("audio_src"),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    status: songStatusEnum("status").notNull().default("draft"),
    /** Populated by transcription; kept so slides can be rebuilt without re-paying. */
    transcript: jsonb("transcript").$type<TranscriptPayload | null>(),
    /** What actually goes on screen, with the time each one appears. */
    slides: jsonb("slides").$type<SlidePayload[]>().notNull().default([]),
    /** Seconds to shift every slide by, for lining up a stubborn recording. */
    timingOffsetMs: integer("timing_offset_ms").notNull().default(0),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("songs_church_slug_key").on(t.churchId, t.slug)],
);

/** One Sunday (or midweek, or wedding) — an ordered run sheet with times. */
export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    churchId: uuid("church_id")
      .notNull()
      .references(() => churches.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    heldOn: date("held_on").notNull(),
    /** Local wall-clock start, `HH:MM` — the running order counts from here. */
    startsAt: text("starts_at").notNull().default("10:00"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("services_church_slug_key").on(t.churchId, t.slug),
    index("services_church_date_idx").on(t.churchId, t.heldOn),
  ],
);

export const serviceItemKindEnum = pgEnum("service_item_kind", [
  "song",
  "scripture",
  "prayer",
  "sermon",
  "offering",
  "announcements",
  "communion",
  "other",
]);

export const serviceItems = pgTable(
  "service_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    /** Order within the service; gaps are fine, only the sort matters. */
    position: integer("position").notNull(),
    kind: serviceItemKindEnum("kind").notNull().default("other"),
    title: text("title").notNull(),
    /** How long it's expected to take — what builds the timeline. */
    durationSeconds: integer("duration_seconds").notNull().default(300),
    notes: text("notes").notNull().default(""),
    /** Set when this item is one of the church's songs. */
    songId: uuid("song_id").references(() => songs.id, { onDelete: "set null" }),
    /** Set when this item is a recorded message already in the library. */
    sermonId: uuid("sermon_id").references(() => sermons.id, { onDelete: "set null" }),
    /** Who's doing it — "Worship team", "Pastor Alina". */
    owner: text("owner").notNull().default(""),
  },
  (t) => [index("service_items_service_position_idx").on(t.serviceId, t.position)],
);
