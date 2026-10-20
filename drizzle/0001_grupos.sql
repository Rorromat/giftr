CREATE TABLE "list_members" (
	"list_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "list_members_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "lists" ALTER COLUMN "owner_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "tipo" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "nombre" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "descripcion" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "invite_token" text;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_members" ADD CONSTRAINT "list_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_members_user_id_idx" ON "list_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_invite_token_unique" UNIQUE("invite_token");