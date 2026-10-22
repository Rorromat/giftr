CREATE INDEX "claims_item_id_estado_idx" ON "claims" USING btree ("item_id","estado");--> statement-breakpoint
CREATE INDEX "claims_claimer_user_id_idx" ON "claims" USING btree ("claimer_user_id");--> statement-breakpoint
CREATE INDEX "claims_claimer_guest_id_idx" ON "claims" USING btree ("claimer_guest_id");--> statement-breakpoint
CREATE INDEX "claims_vencen_idx" ON "claims" USING btree ("expires_at") WHERE "claims"."estado" = 'reservado';--> statement-breakpoint
CREATE INDEX "codazos_list_id_created_at_idx" ON "codazos" USING btree ("list_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_item_id_created_at_idx" ON "comments" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "group_gifts_item_id_idx" ON "group_gifts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "group_gifts_organizer_user_id_idx" ON "group_gifts" USING btree ("organizer_user_id");--> statement-breakpoint
CREATE INDEX "items_list_id_created_at_idx" ON "items" USING btree ("list_id","created_at");--> statement-breakpoint
CREATE INDEX "list_follows_list_id_idx" ON "list_follows" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_guest_id_idx" ON "notifications" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX "notifications_item_id_idx" ON "notifications" USING btree ("item_id");