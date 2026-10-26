DROP INDEX "consultations_slot_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "consultations_active_slot_unique" ON "consultations" USING btree ("slot_id") WHERE "consultations"."status" <> 'CANCELLED';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_active_consultation_unique" ON "payments" USING btree ("consultation_id") WHERE "payments"."status" in ('PENDING', 'SUCCEEDED');