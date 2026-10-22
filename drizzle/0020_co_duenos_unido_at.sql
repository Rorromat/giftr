ALTER TABLE "list_members" ADD COLUMN "unido_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Hasta acá volver a un grupo no existía en producción (al salir se borraba la fila), así que el alta es la vez que se sumó.
-- Con now() (el valor por defecto), todos los invitados de todos los grupos tendrían que volver a decir que la lista no es suya.
UPDATE "list_members" SET "unido_at" = "created_at";
