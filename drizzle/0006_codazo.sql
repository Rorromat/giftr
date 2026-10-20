CREATE TABLE "codazos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"para_user_id" uuid NOT NULL,
	"de_user_id" uuid,
	"de_guest_id" uuid,
	"de_nombre" text NOT NULL,
	"visto" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"clave" text PRIMARY KEY NOT NULL,
	"valor" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subs_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "codazos" ADD CONSTRAINT "codazos_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codazos" ADD CONSTRAINT "codazos_para_user_id_users_id_fk" FOREIGN KEY ("para_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codazos" ADD CONSTRAINT "codazos_de_user_id_users_id_fk" FOREIGN KEY ("de_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codazos" ADD CONSTRAINT "codazos_de_guest_id_guest_identities_id_fk" FOREIGN KEY ("de_guest_id") REFERENCES "public"."guest_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subs" ADD CONSTRAINT "push_subs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codazos_para_user_id_idx" ON "codazos" USING btree ("para_user_id");--> statement-breakpoint
CREATE INDEX "push_subs_user_id_idx" ON "push_subs" USING btree ("user_id");