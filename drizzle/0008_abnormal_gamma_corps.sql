ALTER TYPE "public"."song_status" ADD VALUE 'extracting' BEFORE 'transcribing';--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "video_src" text;