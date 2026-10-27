CREATE TABLE "avisos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"de_user_id" uuid,
	"titulo" text NOT NULL,
	"cuerpo" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avisos_vistos_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos" ADD CONSTRAINT "avisos_de_user_id_users_id_fk" FOREIGN KEY ("de_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "avisos_user_id_created_at_idx" ON "avisos" USING btree ("user_id","created_at");