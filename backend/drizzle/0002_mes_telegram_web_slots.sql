ALTER TABLE "telegram_accounts" ADD COLUMN "web_slot" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_telegram_accounts_web_slot" ON "telegram_accounts" USING btree ("web_slot");--> statement-breakpoint
ALTER TABLE "telegram_accounts" ALTER COLUMN "encrypted_session" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_accounts" ALTER COLUMN "session_iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "telegram_accounts" ALTER COLUMN "session_auth_tag" DROP NOT NULL;--> statement-breakpoint
UPDATE "telegram_accounts" SET "encrypted_session" = NULL, "session_iv" = NULL, "session_auth_tag" = NULL;--> statement-breakpoint
UPDATE "telegram_accounts" SET "first_name" = '' WHERE "first_name" IS NULL;--> statement-breakpoint
ALTER TABLE "telegram_accounts" ALTER COLUMN "first_name" SET NOT NULL;