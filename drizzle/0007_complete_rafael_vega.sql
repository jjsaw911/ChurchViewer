CREATE TYPE "public"."media_asset_kind" AS ENUM('audio', 'video', 'image', 'captions', 'other');--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"location" text NOT NULL,
	"filename" text NOT NULL,
	"title" text NOT NULL,
	"content_type" text DEFAULT '' NOT NULL,
	"kind" "media_asset_kind" DEFAULT 'other' NOT NULL,
	"bytes" bigint,
	"notes" text DEFAULT '' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_church_location_key" ON "media_assets" USING btree ("church_id","location");--> statement-breakpoint
CREATE INDEX "media_assets_church_created_idx" ON "media_assets" USING btree ("church_id","created_at");--> statement-breakpoint
-- Backfill: every file already held in the bucket becomes a library entry, so
-- the media picker opens on what the church has rather than on nothing. Only
-- `gcs:` locations — a pasted external link isn't a file we hold.
WITH held AS (
	SELECT church_id, audio_src AS location, 'audio'::media_asset_kind AS kind
	FROM songs WHERE audio_src LIKE 'gcs:%'
	UNION ALL
	SELECT church_id, media_src,
		(CASE WHEN media_kind = 'audio' THEN 'audio' ELSE 'video' END)::media_asset_kind
	FROM sermons WHERE media_src LIKE 'gcs:%'
	UNION ALL
	SELECT church_id, poster_src, 'image'::media_asset_kind
	FROM sermons WHERE poster_src LIKE 'gcs:%'
	UNION ALL
	SELECT church_id, captions_src, 'captions'::media_asset_kind
	FROM sermons WHERE captions_src LIKE 'gcs:%'
	UNION ALL
	SELECT church_id, artwork_src, 'image'::media_asset_kind
	FROM series WHERE artwork_src LIKE 'gcs:%'
	UNION ALL
	SELECT s.church_id, i.media_url, 'video'::media_asset_kind
	FROM service_items i JOIN services s ON s.id = i.service_id
	WHERE i.media_url LIKE 'gcs:%'
), named AS (
	-- Object keys are `churches/<slug>/<uuid>-<original name>`; the uuid keeps
	-- them unguessable but nobody wants to read it in a list.
	SELECT DISTINCT ON (church_id, location) church_id, location, kind,
		regexp_replace(
			regexp_replace(location, '^.*/', ''),
			'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-', ''
		) AS filename
	FROM held
	ORDER BY church_id, location
)
INSERT INTO "media_assets" ("church_id", "location", "filename", "title", "kind")
SELECT church_id, location, filename,
	initcap(replace(regexp_replace(filename, '\.[^.]+$', ''), '-', ' ')), kind
FROM named
ON CONFLICT DO NOTHING;
