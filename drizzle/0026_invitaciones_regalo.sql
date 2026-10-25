CREATE TABLE "invitaciones_regalo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_id" uuid NOT NULL,
	"de_user_id" uuid NOT NULL,
	"para_user_id" uuid NOT NULL,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"respondida_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitaciones_regalo" ADD CONSTRAINT "invitaciones_regalo_gift_id_group_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."group_gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_regalo" ADD CONSTRAINT "invitaciones_regalo_de_user_id_users_id_fk" FOREIGN KEY ("de_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitaciones_regalo" ADD CONSTRAINT "invitaciones_regalo_para_user_id_users_id_fk" FOREIGN KEY ("para_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invitaciones_regalo_par_idx" ON "invitaciones_regalo" USING btree ("gift_id","para_user_id");--> statement-breakpoint
CREATE INDEX "invitaciones_regalo_para_user_id_idx" ON "invitaciones_regalo" USING btree ("para_user_id");