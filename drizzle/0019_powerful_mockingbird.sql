CREATE TYPE "public"."social_platform" AS ENUM('facebook', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."social_post_status" AS ENUM('posted', 'failed');--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"access_token" text NOT NULL,
	"connected_by" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"broken_at" timestamp with time zone,
	"broken_reason" text
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"account_id" uuid,
	"platform" "social_platform" NOT NULL,
	"account_name" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"media_src" text,
	"link_url" text,
	"status" "social_post_status" NOT NULL,
	"external_id" text,
	"error" text,
	"posted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "social_accounts_church_id_idx" ON "social_accounts" USING btree ("church_id");--> statement-breakpoint
CREATE UNIQUE INDEX "social_accounts_church_platform_external" ON "social_accounts" USING btree ("church_id","platform","external_id");--> statement-breakpoint
CREATE INDEX "social_posts_church_id_idx" ON "social_posts" USING btree ("church_id");