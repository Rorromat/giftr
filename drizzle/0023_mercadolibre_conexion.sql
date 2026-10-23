CREATE TABLE "mercadolibre_conexion" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"expira_at" timestamp with time zone,
	"ml_user_id" text,
	"conectado_por" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mercadolibre_conexion_una_sola" CHECK ("mercadolibre_conexion"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "mercadolibre_conexion" ADD CONSTRAINT "mercadolibre_conexion_conectado_por_users_id_fk" FOREIGN KEY ("conectado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;