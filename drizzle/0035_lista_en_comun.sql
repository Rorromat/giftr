ALTER TABLE "list_members" ADD COLUMN "parentesco" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "es_cumple" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "foto_url" text;--> statement-breakpoint
CREATE INDEX "lists_foto_deseo_idx" ON "lists" USING btree (lower(substring("foto_url" from '/foto/deseo/([0-9A-Fa-f-]{36})'))) WHERE "lists"."foto_url" is not null;