CREATE TABLE "amistades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"de_user_id" uuid NOT NULL,
	"para_user_id" uuid,
	"para_email" text,
	"estado" text DEFAULT 'pendiente' NOT NULL,
	"oculta_at" timestamp with time zone,
	"respondida_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "usuario" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "amigo_token" text;--> statement-breakpoint
ALTER TABLE "amistades" ADD CONSTRAINT "amistades_de_user_id_users_id_fk" FOREIGN KEY ("de_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amistades" ADD CONSTRAINT "amistades_para_user_id_users_id_fk" FOREIGN KEY ("para_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "amistades_par_idx" ON "amistades" USING btree (least("de_user_id", "para_user_id"),greatest("de_user_id", "para_user_id")) WHERE "amistades"."para_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "amistades_mail_idx" ON "amistades" USING btree ("de_user_id","para_email") WHERE "amistades"."para_user_id" is null;--> statement-breakpoint
CREATE INDEX "amistades_para_user_id_idx" ON "amistades" USING btree ("para_user_id");--> statement-breakpoint
CREATE INDEX "amistades_de_user_id_created_at_idx" ON "amistades" USING btree ("de_user_id","created_at");--> statement-breakpoint
CREATE INDEX "amistades_para_email_idx" ON "amistades" USING btree ("para_email") WHERE "amistades"."para_user_id" is null;--> statement-breakpoint
CREATE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_usuario_unique" UNIQUE("usuario");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_amigo_token_unique" UNIQUE("amigo_token");--> statement-breakpoint
-- Un usuario para cada cuenta de antes, sacado del nombre ("Euge Mateus" → "euge.mateus", hasta 16 letras); si el nombre
-- se repite o es muy corto, con un pedazo del id ("euge.3fa2c1"), que no choca. Lo cambian en Perfil.
UPDATE "users" AS u SET "usuario" = c.usuario FROM (
	SELECT id, CASE WHEN count(*) OVER (PARTITION BY base) = 1 AND length(base) >= 3 THEN base
		ELSE rtrim(left(CASE WHEN length(base) >= 3 THEN base ELSE 'usuario' END, 12), '.') || '.' || left(replace(id::text, '-', ''), 6)
	END AS usuario
	FROM (
		SELECT id, trim(both '.' from left(trim(both '.' from regexp_replace(
			lower(translate("nombre", 'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç', 'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc')),
			'[^a-z0-9]+', '.', 'g')), 16)) AS base
		FROM "users" WHERE "usuario" IS NULL
	) b
) c WHERE u.id = c.id;
