CREATE TABLE "amigo_invisible_excluidos" (
	"amigo_invisible_id" uuid NOT NULL,
	"a" uuid NOT NULL,
	"b" uuid NOT NULL,
	CONSTRAINT "amigo_invisible_excluidos_amigo_invisible_id_a_b_pk" PRIMARY KEY("amigo_invisible_id","a","b")
);
--> statement-breakpoint
CREATE TABLE "amigo_invisible_gente" (
	"amigo_invisible_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"estado" text DEFAULT 'invitado' NOT NULL,
	"regala_a" uuid,
	"vio_at" timestamp with time zone,
	"revelado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amigo_invisible_gente_amigo_invisible_id_user_id_pk" PRIMARY KEY("amigo_invisible_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "amigo_invisible_preguntas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amigo_invisible_id" uuid NOT NULL,
	"de_user_id" uuid NOT NULL,
	"para_user_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"respuesta" text,
	"respondida_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amigos_invisibles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizador_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"presupuesto" integer,
	"fecha" date NOT NULL,
	"fecha_especial" text,
	"sorteado_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amigo_invisible_excluidos" ADD CONSTRAINT "amigo_invisible_excluidos_amigo_invisible_id_amigos_invisibles_id_fk" FOREIGN KEY ("amigo_invisible_id") REFERENCES "public"."amigos_invisibles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_excluidos" ADD CONSTRAINT "amigo_invisible_excluidos_a_users_id_fk" FOREIGN KEY ("a") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_excluidos" ADD CONSTRAINT "amigo_invisible_excluidos_b_users_id_fk" FOREIGN KEY ("b") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_gente" ADD CONSTRAINT "amigo_invisible_gente_amigo_invisible_id_amigos_invisibles_id_fk" FOREIGN KEY ("amigo_invisible_id") REFERENCES "public"."amigos_invisibles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_gente" ADD CONSTRAINT "amigo_invisible_gente_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_gente" ADD CONSTRAINT "amigo_invisible_gente_regala_a_users_id_fk" FOREIGN KEY ("regala_a") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_preguntas" ADD CONSTRAINT "amigo_invisible_preguntas_amigo_invisible_id_amigos_invisibles_id_fk" FOREIGN KEY ("amigo_invisible_id") REFERENCES "public"."amigos_invisibles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_preguntas" ADD CONSTRAINT "amigo_invisible_preguntas_de_user_id_users_id_fk" FOREIGN KEY ("de_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigo_invisible_preguntas" ADD CONSTRAINT "amigo_invisible_preguntas_para_user_id_users_id_fk" FOREIGN KEY ("para_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amigos_invisibles" ADD CONSTRAINT "amigos_invisibles_organizador_id_users_id_fk" FOREIGN KEY ("organizador_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amigo_invisible_gente_user_id_idx" ON "amigo_invisible_gente" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "amigo_invisible_preguntas_juego_idx" ON "amigo_invisible_preguntas" USING btree ("amigo_invisible_id","created_at");--> statement-breakpoint
CREATE INDEX "amigos_invisibles_organizador_id_idx" ON "amigos_invisibles" USING btree ("organizador_id");