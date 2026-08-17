ALTER TYPE "public"."song_status" ADD VALUE 'queued' BEFORE 'transcribing';--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "transcribe_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "songs" ADD COLUMN "tidy_requested" boolean DEFAULT true NOT NULL;