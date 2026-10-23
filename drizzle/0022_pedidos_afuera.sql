CREATE TABLE "pedidos_afuera" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pedidos_afuera" ADD CONSTRAINT "pedidos_afuera_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pedidos_afuera_user_id_created_at_idx" ON "pedidos_afuera" USING btree ("user_id","created_at");