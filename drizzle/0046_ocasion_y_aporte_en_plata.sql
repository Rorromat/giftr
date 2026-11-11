ALTER TABLE "claims" ADD COLUMN "aporte_monto" integer;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "aporte_alias" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "aporte_meta" integer;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "ocasion" text DEFAULT 'otra' NOT NULL;--> statement-breakpoint
-- A mano (drizzle-kit no lo genera): las listas en común que ya eran un cumple quedan con esa ocasión; las demás, "otra"
-- (el valor por defecto de la columna).
UPDATE "lists" SET "ocasion" = 'cumple' WHERE "es_cumple" AND "tipo" = 'grupo';
