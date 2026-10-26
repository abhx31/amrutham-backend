CREATE TABLE "payment_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"payload_hash" text NOT NULL,
	"payment_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "doctors" ADD COLUMN "consultation_fee_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "initiated_by" uuid;--> statement-breakpoint
UPDATE "payments"
SET "initiated_by" = "consultations"."patient_id"
FROM "consultations"
WHERE "payments"."consultation_id" = "consultations"."id";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "initiated_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_initiated_by_users_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_provider_reference_unique" ON "payments" USING btree ("provider_reference");
