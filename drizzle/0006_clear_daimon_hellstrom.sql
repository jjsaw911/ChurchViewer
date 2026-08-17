ALTER TYPE "public"."service_item_kind" ADD VALUE 'worship' BEFORE 'other';--> statement-breakpoint
ALTER TABLE "service_items" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "service_items" ADD COLUMN "starts_at" text;--> statement-breakpoint
ALTER TABLE "service_items" ADD COLUMN "slides" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_items" ADD CONSTRAINT "service_items_parent_id_service_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."service_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_items_parent_idx" ON "service_items" USING btree ("parent_id");