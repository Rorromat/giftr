CREATE TABLE "recordatorios_enviados" (
	"user_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"clave" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordatorios_enviados_user_id_tipo_clave_pk" PRIMARY KEY("user_id","tipo","clave")
);
--> statement-breakpoint
ALTER TABLE "recordatorios_enviados" ADD CONSTRAINT "recordatorios_enviados_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;