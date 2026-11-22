CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp (3) with time zone,
	"refresh_token_expires_at" timestamp (3) with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"module_code" text NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"is_secret" boolean DEFAULT false NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_app_settings_module" CHECK (module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"url" text NOT NULL,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"uploaded_by" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"work_date" text NOT NULL,
	"check_in" timestamp (3) with time zone,
	"check_out" timestamp (3) with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"is_early_leave" boolean DEFAULT false NOT NULL,
	"leave_code" text,
	"working_hours" double precision DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_attendance_leave_code" CHECK (leave_code is null or leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_attendance_hours" CHECK (working_hours >= 0)
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"department_type" text DEFAULT 'DEPARTMENT' NOT NULL,
	"parent_id" text,
	"manager_id" text,
	"auto_forking_enabled" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code"),
	CONSTRAINT "ck_departments_type" CHECK (department_type in ('DEPARTMENT', 'DIVISION')),
	CONSTRAINT "ck_departments_code" CHECK (length(trim(code)) > 0)
);
--> statement-breakpoint
CREATE TABLE "export_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"format" text NOT NULL,
	"storage_path" text NOT NULL,
	"byte_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_export_artifacts_format" CHECK (format in ('PDF', 'XLSX', 'CSV'))
);
--> statement-breakpoint
CREATE TABLE "kpi_monthly_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"total_tasks_assigned" integer DEFAULT 0 NOT NULL,
	"completed_on_time" integer DEFAULT 0 NOT NULL,
	"completed_urgent_on_time" integer DEFAULT 0 NOT NULL,
	"approved_first_time" integer DEFAULT 0 NOT NULL,
	"overdue_tasks" integer DEFAULT 0 NOT NULL,
	"rejected_tasks" integer DEFAULT 0 NOT NULL,
	"extension_requests_count" integer DEFAULT 0 NOT NULL,
	"attendance_rate" double precision DEFAULT 100 NOT NULL,
	"perfect_attendance_bonus" integer DEFAULT 0 NOT NULL,
	"unapproved_leave_count" integer DEFAULT 0 NOT NULL,
	"late_early_count" integer DEFAULT 0 NOT NULL,
	"total_kpi_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_kpi_summary_month" CHECK (period_month between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "kpi_point_rules" (
	"code" text PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"points" integer NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_score_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"task_id" text,
	"rule_code" text NOT NULL,
	"points" integer NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"occurred_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"note" text,
	CONSTRAINT "ck_kpi_events_period_month" CHECK (period_month between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "leave_balance_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"leave_code" text NOT NULL,
	"entry_type" text NOT NULL,
	"delta_days" double precision NOT NULL,
	"period_year" integer NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"note" text,
	"created_by" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_leave_balance_code" CHECK (leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_leave_balance_entry_type" CHECK (entry_type in ('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'EXPIRY', 'CARRY_OVER'))
);
--> statement-breakpoint
CREATE TABLE "leave_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"is_paid" boolean DEFAULT false NOT NULL,
	"payroll_rule" text NOT NULL,
	"deducts_wage" boolean DEFAULT false NOT NULL,
	"is_penalty" boolean DEFAULT false NOT NULL,
	"is_balance_tracked" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_leave_codes_code" CHECK (code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_leave_codes_category" CHECK (category in ('PAID', 'UNPAID', 'INSURANCE', 'SPECIAL'))
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"leave_code" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"total_days" double precision NOT NULL,
	"reason" text NOT NULL,
	"handover_user_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"approved_by" text,
	"approved_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_leave_requests_code" CHECK (leave_code in ('AL', 'UAL', 'SL', 'USL', 'PL', 'ML', 'CL', 'EL', 'LWP', 'TOIL', 'VTO')),
	CONSTRAINT "ck_leave_requests_status" CHECK (status in ('PENDING', 'APPROVED', 'REJECTED')),
	CONSTRAINT "ck_leave_requests_days" CHECK (total_days >= 0),
	CONSTRAINT "ck_leave_requests_dates" CHECK (end_date >= start_date)
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_modules_code" CHECK (code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text DEFAULT 'TELEGRAM' NOT NULL,
	"template" text,
	"recipient" text,
	"payload" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"related_type" text,
	"related_id" text,
	"error_message" text,
	"sent_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_notifications_status" CHECK (status in ('PENDING', 'SENT', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "overtime_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"work_date" text NOT NULL,
	"hours" double precision NOT NULL,
	"is_approved" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp (3) with time zone,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_overtime_hours" CHECK (hours > 0)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"module_code" text NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code"),
	CONSTRAINT "ck_permissions_module" CHECK (module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"department_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"permission_id" text NOT NULL,
	"granted_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code"),
	CONSTRAINT "ck_roles_code" CHECK (code in ('SUPER_ADMIN', 'TECH_LEAD', 'HR_MANAGER', 'DEPT_HEAD', 'EMPLOYEE'))
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "system_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"module_code" text,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"old_data" text,
	"new_data" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_audit_module" CHECK (module_code is null or module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log'))
);
--> statement-breakpoint
CREATE TABLE "task_completion_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"scope" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"declared_progress" integer,
	"planned_stage_count" integer,
	"state" text DEFAULT 'PEN' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp (3) with time zone,
	"decision_reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_task_completion_scope" CHECK (scope in ('MILESTONE', 'FULL_JOB')),
	CONSTRAINT "ck_task_completion_state" CHECK (state in ('PEN', 'APP', 'REJ')),
	CONSTRAINT "ck_task_completion_progress" CHECK (declared_progress is null or declared_progress between 0 and 100),
	CONSTRAINT "ck_task_completion_stages" CHECK (planned_stage_count is null or planned_stage_count > 0)
);
--> statement-breakpoint
CREATE TABLE "task_progress_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"previous_percentage" integer DEFAULT 0 NOT NULL,
	"new_percentage" integer NOT NULL,
	"log_comment" text,
	"is_verified_by_manager" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_task_progress_range" CHECK (previous_percentage between 0 and 100 and new_percentage between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "task_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_type" text NOT NULL,
	"requested_deadline" timestamp (3) with time zone,
	"reason" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reviewed_by" text,
	"review_comment" text,
	"reviewed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_task_requests_type" CHECK (request_type in ('EXTENSION', 'LATE_EXPLANATION')),
	CONSTRAINT "ck_task_requests_status" CHECK (status in ('PENDING', 'APPROVED', 'REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "task_state_transitions" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"actor_id" text,
	"reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_task_transitions_to" CHECK (to_state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')),
	CONSTRAINT "ck_task_transitions_from" CHECK (from_state is null or from_state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"task_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_id" text,
	"task_type" text DEFAULT 'DAILY' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"state" text DEFAULT 'REQ' NOT NULL,
	"created_by" text,
	"assigned_to" text,
	"department_id" text,
	"start_date" timestamp (3) with time zone,
	"end_date" timestamp (3) with time zone,
	"extended_deadline" timestamp (3) with time zone,
	"progress_percentage" integer DEFAULT 0 NOT NULL,
	"planned_stage_count" integer,
	"is_urgent_hourly" boolean DEFAULT false NOT NULL,
	"is_extension_requested" boolean DEFAULT false NOT NULL,
	"is_overdue" boolean DEFAULT false NOT NULL,
	"is_late_submission" boolean DEFAULT false NOT NULL,
	"approved_by" text,
	"approved_at" timestamp (3) with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp (3) with time zone,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_task_code_unique" UNIQUE("task_code"),
	CONSTRAINT "ck_tasks_state" CHECK (state in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE')),
	CONSTRAINT "ck_tasks_task_type" CHECK (task_type in ('HOURLY', 'DAILY', 'MULTI_DAY')),
	CONSTRAINT "ck_tasks_priority" CHECK (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
	CONSTRAINT "ck_tasks_progress" CHECK (progress_percentage between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "telegram_ai_models" (
	"model_id" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"fetched_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_ai_usage" (
	"user_id" text PRIMARY KEY NOT NULL,
	"window_start" timestamp (3) with time zone NOT NULL,
	"query_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_bot_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_token" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"ai_base_url" text,
	"ai_api_key" text,
	"ai_default_model" text,
	"push_alerts_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"consumed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"id" text PRIMARY KEY NOT NULL,
	"telegram_user_id" text NOT NULL,
	"user_id" text NOT NULL,
	"telegram_chat_id" text NOT NULL,
	"telegram_username" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_user_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"selected_model" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_webhook_config" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_token" text,
	"alert_group_chat_id" text,
	"webhook_url" text,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_states" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"description" text,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ticket_states_code" CHECK (code in ('REQ', 'ACT', 'PEN', 'APP', 'REJ', 'CAN', 'OVERDUE'))
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"user_code" text NOT NULL,
	"department_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"deleted_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"role_id" text NOT NULL,
	"assigned_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone NOT NULL,
	"updated_at" timestamp (3) with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_artifacts" ADD CONSTRAINT "export_artifacts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_monthly_summaries" ADD CONSTRAINT "kpi_monthly_summaries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_score_events" ADD CONSTRAINT "kpi_score_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_score_events" ADD CONSTRAINT "kpi_score_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_score_events" ADD CONSTRAINT "kpi_score_events_rule_code_kpi_point_rules_code_fk" FOREIGN KEY ("rule_code") REFERENCES "public"."kpi_point_rules"("code") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_entries" ADD CONSTRAINT "leave_balance_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_entries" ADD CONSTRAINT "leave_balance_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_handover_user_id_user_id_fk" FOREIGN KEY ("handover_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overtime_records" ADD CONSTRAINT "overtime_records_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "system_audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion_requests" ADD CONSTRAINT "task_completion_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion_requests" ADD CONSTRAINT "task_completion_requests_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completion_requests" ADD CONSTRAINT "task_completion_requests_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress_logs" ADD CONSTRAINT "task_progress_logs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_progress_logs" ADD CONSTRAINT "task_progress_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_requests" ADD CONSTRAINT "task_requests_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_state_transitions" ADD CONSTRAINT "task_state_transitions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_state_transitions" ADD CONSTRAINT "task_state_transitions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_ai_usage" ADD CONSTRAINT "telegram_ai_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_user_prefs" ADD CONSTRAINT "telegram_user_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_user" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_app_settings_module_key" ON "app_settings" USING btree ("module_code","key");--> statement-breakpoint
CREATE INDEX "idx_app_settings_module" ON "app_settings" USING btree ("module_code");--> statement-breakpoint
CREATE INDEX "idx_attachments_owner" ON "attachments" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attendance_user_date" ON "attendance_records" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_attendance_leave_code" ON "attendance_records" USING btree ("leave_code");--> statement-breakpoint
CREATE INDEX "idx_departments_parent" ON "departments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_departments_manager" ON "departments" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "idx_departments_type" ON "departments" USING btree ("department_type");--> statement-breakpoint
CREATE INDEX "idx_export_artifacts_user" ON "export_artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_kpi_summary_user_period" ON "kpi_monthly_summaries" USING btree ("user_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "idx_kpi_summary_period" ON "kpi_monthly_summaries" USING btree ("period_year","period_month");--> statement-breakpoint
CREATE INDEX "idx_kpi_events_user_period" ON "kpi_score_events" USING btree ("user_id","period_year","period_month");--> statement-breakpoint
CREATE INDEX "idx_kpi_events_rule" ON "kpi_score_events" USING btree ("rule_code");--> statement-breakpoint
CREATE INDEX "idx_leave_balance_user" ON "leave_balance_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_leave_balance_code" ON "leave_balance_entries" USING btree ("leave_code");--> statement-breakpoint
CREATE INDEX "idx_leave_balance_period" ON "leave_balance_entries" USING btree ("period_year");--> statement-breakpoint
CREATE INDEX "idx_leave_requests_user" ON "leave_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_leave_requests_status" ON "leave_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_leave_requests_code" ON "leave_requests" USING btree ("leave_code");--> statement-breakpoint
CREATE INDEX "idx_notifications_status" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_notifications_related" ON "notifications" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "idx_notifications_created" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_overtime_user_date" ON "overtime_records" USING btree ("user_id","work_date");--> statement-breakpoint
CREATE INDEX "idx_permissions_module" ON "permissions" USING btree ("module_code");--> statement-breakpoint
CREATE INDEX "idx_projects_department" ON "projects" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_permissions" ON "role_permissions" USING btree ("role_id","permission_id");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_permission" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "idx_session_user" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "system_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_resource" ON "system_audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "system_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_module" ON "system_audit_logs" USING btree ("module_code");--> statement-breakpoint
CREATE INDEX "idx_audit_module_created" ON "system_audit_logs" USING btree ("module_code","created_at");--> statement-breakpoint
CREATE INDEX "idx_task_completion_task" ON "task_completion_requests" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_completion_state" ON "task_completion_requests" USING btree ("state");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_task_completion_pending" ON "task_completion_requests" USING btree ("task_id") WHERE state = 'PEN';--> statement-breakpoint
CREATE INDEX "idx_task_progress_task" ON "task_progress_logs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_progress_user" ON "task_progress_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_task_requests_task" ON "task_requests" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_requests_status" ON "task_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_task_transitions_task" ON "task_state_transitions" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_transitions_state" ON "task_state_transitions" USING btree ("to_state");--> statement-breakpoint
CREATE INDEX "idx_tasks_project" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_state" ON "tasks" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_tasks_assigned" ON "tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_tasks_created_by" ON "tasks" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_tasks_department" ON "tasks" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_end_date" ON "tasks" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX "idx_telegram_ai_models_fetched" ON "telegram_ai_models" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "idx_telegram_link_codes_user" ON "telegram_link_codes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_telegram_link_codes_expiry" ON "telegram_link_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_telegram_links_telegram_user" ON "telegram_links" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "idx_telegram_links_user" ON "telegram_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_users_department" ON "user" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_users_active" ON "user" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_roles" ON "user_roles" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "idx_user_roles_role" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier");