ALTER TABLE "amigo_invisible_gente" ADD COLUMN "espera_sorteo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "amigo_invisible_gente" ADD COLUMN "salio_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "amigos_invisibles" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "amigos_invisibles" ADD COLUMN "altas_cerradas_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "amigos_invisibles" ADD CONSTRAINT "amigos_invisibles_invite_token_unique" UNIQUE("invite_token");