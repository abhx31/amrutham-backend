ALTER TABLE "profiles" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "address" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "emergency_contact" jsonb;