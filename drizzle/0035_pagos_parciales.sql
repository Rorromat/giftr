ALTER TABLE "group_gift_members" ADD COLUMN "pagado_monto" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "group_gift_members" ADD COLUMN "pagado_antes" integer;--> statement-breakpoint
-- lo saldado ya puso su parte entera (el encargado también: la puso él)
UPDATE "group_gift_members" SET "pagado_monto" = coalesce("monto", 0) WHERE "pagado";
