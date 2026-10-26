ALTER TABLE "lists" ADD COLUMN "para_user_id" uuid;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "creada_por" uuid;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_para_user_id_users_id_fk" FOREIGN KEY ("para_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_creada_por_users_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_para_user_id_idx" ON "lists" USING btree ("para_user_id") WHERE "lists"."para_user_id" is not null;