ALTER TABLE "lists" ADD COLUMN "para_list_id" uuid;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_para_list_id_lists_id_fk" FOREIGN KEY ("para_list_id") REFERENCES "public"."lists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lists_para_list_id_idx" ON "lists" USING btree ("para_list_id") WHERE "lists"."para_list_id" is not null;