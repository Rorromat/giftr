ALTER TABLE "claims" ADD COLUMN "revelado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "agradecido_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_gift_members" ADD COLUMN "revelado_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_gift_members" ADD COLUMN "agradecido_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "recibido_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "recibido_evento" date;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "post_evento_hecho" date;