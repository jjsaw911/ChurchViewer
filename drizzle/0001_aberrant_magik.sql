CREATE TYPE "public"."service_item_kind" AS ENUM('song', 'scripture', 'prayer', 'sermon', 'offering', 'announcements', 'communion', 'other');--> statement-breakpoint
CREATE TYPE "public"."song_status" AS ENUM('draft', 'transcribing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "service_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "service_item_kind" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"duration_seconds" integer DEFAULT 300 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"song_id" uuid,
	"sermon_id" uuid,
	"owner" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"held_on" date NOT NULL,
	"starts_at" text DEFAULT '10:00' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"ccli_number" text DEFAULT '' NOT NULL,
	"source_url" text,
	"audio_src" text,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"status" "song_status" DEFAULT 'draft' NOT NULL,
	"transcript" jsonb,
	"slides" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timing_offset_ms" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_sermon_id_sermons_id_fk" FOREIGN KEY ("sermon_id") REFERENCES "public"."sermons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "songs" ADD CONSTRAINT "songs_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_items_service_position_idx" ON "service_items" USING btree ("service_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "services_church_slug_key" ON "services" USING btree ("church_id","slug");--> statement-breakpoint
CREATE INDEX "services_church_date_idx" ON "services" USING btree ("church_id","held_on");--> statement-breakpoint
CREATE UNIQUE INDEX "songs_church_slug_key" ON "songs" USING btree ("church_id","slug");