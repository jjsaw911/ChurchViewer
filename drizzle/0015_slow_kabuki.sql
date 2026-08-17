ALTER TABLE "live_states" ADD COLUMN "playing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "live_states" ADD COLUMN "armed_item_id" uuid;--> statement-breakpoint
ALTER TABLE "live_states" ADD CONSTRAINT "live_states_armed_item_id_service_items_id_fk" FOREIGN KEY ("armed_item_id") REFERENCES "public"."service_items"("id") ON DELETE set null ON UPDATE no action;