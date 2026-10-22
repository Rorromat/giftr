CREATE TABLE "group_gift_sacados" (
	"gift_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_gift_sacados_gift_id_user_id_pk" PRIMARY KEY("gift_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "group_gifts" ADD COLUMN "recordatorio_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_gift_sacados" ADD CONSTRAINT "group_gift_sacados_gift_id_group_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."group_gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_gift_sacados" ADD CONSTRAINT "group_gift_sacados_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;