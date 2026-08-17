CREATE TABLE "live_states" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid,
	"slide_index" integer DEFAULT 0 NOT NULL,
	"blank" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "live_states" ADD CONSTRAINT "live_states_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_states" ADD CONSTRAINT "live_states_item_id_service_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."service_items"("id") ON DELETE set null ON UPDATE no action;