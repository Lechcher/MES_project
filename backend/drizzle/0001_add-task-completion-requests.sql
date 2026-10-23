CREATE TABLE `task_completion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`requested_by` text NOT NULL,
	`scope` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`declared_progress` integer,
	`planned_stage_count` integer,
	`state` text DEFAULT 'PEN' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	`decision_reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_task_completion_scope" CHECK(scope in ('MILESTONE', 'FULL_JOB')),
	CONSTRAINT "ck_task_completion_state" CHECK(state in ('PEN', 'APP', 'REJ')),
	CONSTRAINT "ck_task_completion_progress" CHECK(declared_progress is null or declared_progress between 0 and 100),
	CONSTRAINT "ck_task_completion_stages" CHECK(planned_stage_count is null or planned_stage_count > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_task_completion_task` ON `task_completion_requests` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_completion_state` ON `task_completion_requests` (`state`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_task_completion_pending` ON `task_completion_requests` (`task_id`) WHERE state = 'PEN';--> statement-breakpoint
ALTER TABLE `attachments` ADD `size_bytes` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `planned_stage_count` integer;