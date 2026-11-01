CREATE TABLE `telegram_ai_models` (
	`model_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`fetched_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_telegram_ai_models_fetched` ON `telegram_ai_models` (`fetched_at`);--> statement-breakpoint
CREATE TABLE `telegram_ai_usage` (
	`user_id` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`query_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `telegram_bot_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`bot_token` text,
	`is_enabled` integer DEFAULT false NOT NULL,
	`ai_base_url` text,
	`ai_api_key` text,
	`ai_default_model` text,
	`push_alerts_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `telegram_link_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_telegram_link_codes_user` ON `telegram_link_codes` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_telegram_link_codes_expiry` ON `telegram_link_codes` (`expires_at`);--> statement-breakpoint
CREATE TABLE `telegram_links` (
	`id` text PRIMARY KEY NOT NULL,
	`telegram_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`telegram_chat_id` text NOT NULL,
	`telegram_username` text,
	`is_active` integer DEFAULT true NOT NULL,
	`last_seen_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_telegram_links_telegram_user` ON `telegram_links` (`telegram_user_id`);--> statement-breakpoint
CREATE INDEX `idx_telegram_links_user` ON `telegram_links` (`user_id`);--> statement-breakpoint
CREATE TABLE `telegram_user_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`selected_model` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
