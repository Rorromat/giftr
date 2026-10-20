CREATE TABLE "group_gift_members" (
	"gift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"monto" integer,
	"pagado" boolean DEFAULT false NOT NULL,
	"pagado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_gift_members_gift_id_user_id_pk" PRIMARY KEY("gift_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "group_gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"organizer_user_id" uuid NOT NULL,
	"estado" text DEFAULT 'abierto' NOT NULL,
	"monto_total" integer,
	"comprado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_gifts_claim_id_unique" UNIQUE("claim_id")
);
--> statement-breakpoint
ALTER TABLE "group_gift_members" ADD CONSTRAINT "group_gift_members_gift_id_group_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."group_gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gift_members" ADD CONSTRAINT "group_gift_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gifts" ADD CONSTRAINT "group_gifts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gifts" ADD CONSTRAINT "group_gifts_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gifts" ADD CONSTRAINT "group_gifts_organizer_user_id_users_id_fk" FOREIGN KEY ("organizer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_gift_members_user_id_idx" ON "group_gift_members" USING btree ("user_id");