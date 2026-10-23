CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_account_user` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`module_code` text NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`is_secret` integer DEFAULT false NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_app_settings_module" CHECK(module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_app_settings_module_key` ON `app_settings` (`module_code`,`key`);--> statement-breakpoint
CREATE INDEX `idx_app_settings_module` ON `app_settings` (`module_code`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`url` text NOT NULL,
	`file_name` text,
	`mime_type` text,
	`uploaded_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_attachments_owner` ON `attachments` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`work_date` text NOT NULL,
	`check_in` integer,
	`check_out` integer,
	`is_late` integer DEFAULT false NOT NULL,
	`is_early_leave` integer DEFAULT false NOT NULL,
	`leave_code` text,
	`working_hours` real DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_attendance_leave_code" CHECK(leave_code is null or leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_attendance_hours" CHECK(working_hours >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attendance_user_date` ON `attendance_records` (`user_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_leave_code` ON `attendance_records` (`leave_code`);--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`department_type` text DEFAULT 'DEPARTMENT' NOT NULL,
	`parent_id` text,
	`manager_id` text,
	`auto_forking_enabled` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_departments_type" CHECK(department_type in ('DEPARTMENT', 'DIVISION')),
	CONSTRAINT "ck_departments_code" CHECK(length(trim(code)) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `departments_code_unique` ON `departments` (`code`);--> statement-breakpoint
CREATE INDEX `idx_departments_parent` ON `departments` (`parent_id`);--> statement-breakpoint
CREATE INDEX `idx_departments_manager` ON `departments` (`manager_id`);--> statement-breakpoint
CREATE INDEX `idx_departments_type` ON `departments` (`department_type`);--> statement-breakpoint
CREATE TABLE `export_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`format` text NOT NULL,
	`storage_path` text NOT NULL,
	`byte_size` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_export_artifacts_format" CHECK(format in ('PDF', 'XLSX', 'CSV'))
);
--> statement-breakpoint
CREATE INDEX `idx_export_artifacts_user` ON `export_artifacts` (`user_id`);--> statement-breakpoint
CREATE TABLE `kpi_monthly_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`total_tasks_assigned` integer DEFAULT 0 NOT NULL,
	`completed_on_time` integer DEFAULT 0 NOT NULL,
	`completed_urgent_on_time` integer DEFAULT 0 NOT NULL,
	`approved_first_time` integer DEFAULT 0 NOT NULL,
	`overdue_tasks` integer DEFAULT 0 NOT NULL,
	`rejected_tasks` integer DEFAULT 0 NOT NULL,
	`extension_requests_count` integer DEFAULT 0 NOT NULL,
	`attendance_rate` real DEFAULT 100 NOT NULL,
	`perfect_attendance_bonus` integer DEFAULT 0 NOT NULL,
	`unapproved_leave_count` integer DEFAULT 0 NOT NULL,
	`late_early_count` integer DEFAULT 0 NOT NULL,
	`total_kpi_score` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_kpi_summary_month" CHECK(period_month between 1 and 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_kpi_summary_user_period` ON `kpi_monthly_summaries` (`user_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_kpi_summary_period` ON `kpi_monthly_summaries` (`period_year`,`period_month`);--> statement-breakpoint
CREATE TABLE `kpi_point_rules` (
	`code` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`points` integer NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kpi_score_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_id` text,
	`rule_code` text NOT NULL,
	`points` integer NOT NULL,
	`period_year` integer NOT NULL,
	`period_month` integer NOT NULL,
	`occurred_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rule_code`) REFERENCES `kpi_point_rules`(`code`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "ck_kpi_events_period_month" CHECK(period_month between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX `idx_kpi_events_user_period` ON `kpi_score_events` (`user_id`,`period_year`,`period_month`);--> statement-breakpoint
CREATE INDEX `idx_kpi_events_rule` ON `kpi_score_events` (`rule_code`);--> statement-breakpoint
CREATE TABLE `leave_balance_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`leave_code` text NOT NULL,
	`entry_type` text NOT NULL,
	`delta_days` real NOT NULL,
	`period_year` integer NOT NULL,
	`reference_type` text,
	`reference_id` text,
	`note` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_leave_balance_code" CHECK(leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_leave_balance_entry_type" CHECK(entry_type in ('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'EXPIRY', 'CARRY_OVER'))
);
--> statement-breakpoint
CREATE INDEX `idx_leave_balance_user` ON `leave_balance_entries` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_leave_balance_code` ON `leave_balance_entries` (`leave_code`);--> statement-breakpoint
CREATE INDEX `idx_leave_balance_period` ON `leave_balance_entries` (`period_year`);--> statement-breakpoint
CREATE TABLE `leave_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`is_paid` integer DEFAULT false NOT NULL,
	`payroll_rule` text NOT NULL,
	`deducts_wage` integer DEFAULT false NOT NULL,
	`is_penalty` integer DEFAULT false NOT NULL,
	`is_balance_tracked` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_leave_codes_code" CHECK(code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_leave_codes_category" CHECK(category in ('PAID', 'UNPAID', 'INSURANCE', 'SPECIAL'))
);
--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`leave_code` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_days` real NOT NULL,
	`reason` text NOT NULL,
	`handover_user_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`handover_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_leave_requests_code" CHECK(leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_leave_requests_status" CHECK(status in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "ck_leave_requests_days" CHECK(total_days >= 0),
	CONSTRAINT "ck_leave_requests_dates" CHECK(end_date >= start_date)
);
--> statement-breakpoint
CREATE INDEX `idx_leave_requests_user` ON `leave_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_leave_requests_status` ON `leave_requests` (`status`);--> statement-breakpoint
CREATE INDEX `idx_leave_requests_code` ON `leave_requests` (`leave_code`);--> statement-breakpoint
CREATE TABLE `modules` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_modules_code" CHECK(code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text DEFAULT 'TELEGRAM' NOT NULL,
	`template` text,
	`recipient` text,
	`payload` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`related_type` text,
	`related_id` text,
	`error_message` text,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_notifications_status" CHECK(status in ('PENDING', 'SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_status` ON `notifications` (`status`);--> statement-breakpoint
CREATE INDEX `idx_notifications_related` ON `notifications` (`related_type`,`related_id`);--> statement-breakpoint
CREATE INDEX `idx_notifications_created` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE TABLE `overtime_records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`work_date` text NOT NULL,
	`hours` real NOT NULL,
	`is_approved` integer DEFAULT false NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_overtime_hours" CHECK(hours > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_overtime_user_date` ON `overtime_records` (`user_id`,`work_date`);--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`module_code` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_permissions_module" CHECK(module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permissions_code_unique` ON `permissions` (`code`);--> statement-breakpoint
CREATE INDEX `idx_permissions_module` ON `permissions` (`module_code`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`department_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_code_unique` ON `projects` (`code`);--> statement-breakpoint
CREATE INDEX `idx_projects_department` ON `projects` (`department_id`);--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	`granted_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_role_permissions` ON `role_permissions` (`role_id`,`permission_id`);--> statement-breakpoint
CREATE INDEX `idx_role_permissions_permission` ON `role_permissions` (`permission_id`);--> statement-breakpoint
CREATE TABLE `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_roles_code" CHECK(code in ('SUPER_ADMIN', 'TECH_LEAD', 'HR_MANAGER', 'DEPT_HEAD', 'EMPLOYEE'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roles_code_unique` ON `roles` (`code`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `idx_session_user` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `system_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`module_code` text,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`old_data` text,
	`new_data` text,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_audit_module" CHECK(module_code is null or module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE INDEX `idx_audit_user` ON `system_audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_resource` ON `system_audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `idx_audit_created` ON `system_audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_module` ON `system_audit_logs` (`module_code`);--> statement-breakpoint
CREATE INDEX `idx_audit_module_created` ON `system_audit_logs` (`module_code`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_progress_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`previous_percentage` integer DEFAULT 0 NOT NULL,
	`new_percentage` integer NOT NULL,
	`log_comment` text,
	`is_verified_by_manager` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ck_task_progress_range" CHECK(previous_percentage between 0 and 100 and new_percentage between 0 and 100)
);
--> statement-breakpoint
CREATE INDEX `idx_task_progress_task` ON `task_progress_logs` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_progress_user` ON `task_progress_logs` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`request_type` text NOT NULL,
	`requested_deadline` integer,
	`reason` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewed_by` text,
	`review_comment` text,
	`reviewed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_task_requests_type" CHECK(request_type in ('EXTENSION', 'LATE_EXPLANATION')),
	CONSTRAINT "ck_task_requests_status" CHECK(status in ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE INDEX `idx_task_requests_task` ON `task_requests` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_requests_status` ON `task_requests` (`status`);--> statement-breakpoint
CREATE TABLE `task_state_transitions` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`actor_id` text,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_task_transitions_to" CHECK(to_state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')),
	CONSTRAINT "ck_task_transitions_from" CHECK(from_state is null or from_state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE'))
);
--> statement-breakpoint
CREATE INDEX `idx_task_transitions_task` ON `task_state_transitions` (`task_id`);--> statement-breakpoint
CREATE INDEX `idx_task_transitions_state` ON `task_state_transitions` (`to_state`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`task_code` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`project_id` text,
	`task_type` text DEFAULT 'DAILY' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`state` text DEFAULT 'REQ' NOT NULL,
	`created_by` text,
	`assigned_to` text,
	`department_id` text,
	`start_date` integer,
	`end_date` integer,
	`extended_deadline` integer,
	`progress_percentage` integer DEFAULT 0 NOT NULL,
	`is_urgent_hourly` integer DEFAULT false NOT NULL,
	`is_extension_requested` integer DEFAULT false NOT NULL,
	`is_overdue` integer DEFAULT false NOT NULL,
	`is_late_submission` integer DEFAULT false NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`reviewed_by` text,
	`reviewed_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_to`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "ck_tasks_state" CHECK(state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')),
	CONSTRAINT "ck_tasks_task_type" CHECK(task_type in ('HOURLY', 'DAILY', 'MULTI_DAY')),
	CONSTRAINT "ck_tasks_priority" CHECK(priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
	CONSTRAINT "ck_tasks_progress" CHECK(progress_percentage between 0 and 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_task_code_unique` ON `tasks` (`task_code`);--> statement-breakpoint
CREATE INDEX `idx_tasks_project` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_state` ON `tasks` (`state`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assigned` ON `tasks` (`assigned_to`);--> statement-breakpoint
CREATE INDEX `idx_tasks_created_by` ON `tasks` (`created_by`);--> statement-breakpoint
CREATE INDEX `idx_tasks_department` ON `tasks` (`department_id`);--> statement-breakpoint
CREATE INDEX `idx_tasks_end_date` ON `tasks` (`end_date`);--> statement-breakpoint
CREATE TABLE `telegram_webhook_config` (
	`id` text PRIMARY KEY NOT NULL,
	`bot_token` text,
	`alert_group_chat_id` text,
	`webhook_url` text,
	`is_enabled` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ticket_states` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`description` text,
	`is_terminal` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	CONSTRAINT "ck_ticket_states_code" CHECK(code in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE'))
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`assigned_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_roles` ON `user_roles` (`user_id`,`role_id`);--> statement-breakpoint
CREATE INDEX `idx_user_roles_role` ON `user_roles` (`role_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`user_code` text NOT NULL,
	`department_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_user_code_unique` ON `user` (`user_code`);--> statement-breakpoint
CREATE INDEX `idx_users_department` ON `user` (`department_id`);--> statement-breakpoint
CREATE INDEX `idx_users_active` ON `user` (`is_active`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);