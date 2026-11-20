CREATE TABLE "telegram_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"telegram_user_id" text NOT NULL,
	"phone_number" text,
	"username" text,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"encrypted_session" text NOT NULL,
	"session_iv" text NOT NULL,
	"session_auth_tag" text NOT NULL,
	"device_fingerprint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "telegram_accounts" ADD CONSTRAINT "telegram_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_telegram_accounts_user_tg" ON "telegram_accounts" USING btree ("user_id","telegram_user_id");--> statement-breakpoint
CREATE INDEX "idx_telegram_accounts_user" ON "telegram_accounts" USING btree ("user_id");