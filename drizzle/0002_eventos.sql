CREATE TABLE "list_follows" (
	"user_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_follows_user_id_list_id_pk" PRIMARY KEY("user_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "evento_fecha" date;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "evento_anual" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cumple_dia" smallint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "cumple_mes" smallint;--> statement-breakpoint
ALTER TABLE "list_follows" ADD CONSTRAINT "list_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_follows" ADD CONSTRAINT "list_follows_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;