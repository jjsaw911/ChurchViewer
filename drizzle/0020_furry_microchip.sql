CREATE TABLE "church_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"church_id" uuid NOT NULL,
	"parent_id" uuid,
	"author_id" uuid,
	"author_name" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "church_posts" ADD CONSTRAINT "church_posts_church_id_churches_id_fk" FOREIGN KEY ("church_id") REFERENCES "public"."churches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "church_posts" ADD CONSTRAINT "church_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "church_posts_church_id_idx" ON "church_posts" USING btree ("church_id");--> statement-breakpoint
CREATE INDEX "church_posts_parent_id_idx" ON "church_posts" USING btree ("parent_id");