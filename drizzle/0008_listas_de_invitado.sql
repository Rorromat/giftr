CREATE TABLE "listas_de_invitado" (
	"guest_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listas_de_invitado_guest_id_list_id_pk" PRIMARY KEY("guest_id","list_id")
);
--> statement-breakpoint
ALTER TABLE "listas_de_invitado" ADD CONSTRAINT "listas_de_invitado_guest_id_guest_identities_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listas_de_invitado" ADD CONSTRAINT "listas_de_invitado_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;