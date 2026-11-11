ALTER TABLE "guest_identities" ADD COLUMN "anotado_en" uuid;--> statement-breakpoint
ALTER TABLE "guest_identities" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "nombres_solo_con_cuenta" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "guest_identities" ADD CONSTRAINT "guest_identities_anotado_en_lists_id_fk" FOREIGN KEY ("anotado_en") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_identities_anotado_en_idx" ON "guest_identities" USING btree ("anotado_en","created_at") WHERE "guest_identities"."anotado_en" is not null;