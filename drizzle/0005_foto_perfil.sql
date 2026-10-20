CREATE TABLE "fotos_perfil" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"datos" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "foto_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fotos_perfil" ADD CONSTRAINT "fotos_perfil_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;