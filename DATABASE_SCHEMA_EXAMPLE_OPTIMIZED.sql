-- =============================================================================
-- SYSTEM DATABASE SCHEMA (PostgreSQL) - OPTIMIZED / EXPANSION-READY
-- =============================================================================
-- Architecture : Modular App-based (Odoo-like Architecture)
--
-- Purpose
--   Optimized, expansion-ready reference schema for the MES prototype. It
--   refactors the original DATABASE_SCHEMA_EXAMPLE.sql and closes the gaps
--   found when reviewing the schema against SYSTEM_ARCHITECTURE.md,
--   SYSTEM_ARCHITECTURE_DIAGRAM.md and SYSTEM_PROCESS_FLOW-en.md:
--     * persistence for the Telegram notification engine / Settings config
--     * task state history + approval metadata (traceable lifecycle)
--     * leave-fund ledger (AL / TOIL) + overtime records backing TOIL
--     * constrained status/type fields instead of free-text VARCHAR
--     * a normalized attachment store
--     * KPI rule configuration + a per-event score ledger (reproducible)
--     * global code registries carrying their metadata (name, color, rules)
--     * a module registry as the extension point for future apps
--     * department/division hierarchy
--     * housekeeping: complete timestamps, soft-delete, an updated_at trigger,
--       broader index coverage, and idempotent seed data
--
-- Scope
--   Reference schema only. PostgreSQL dialect. Idempotent: safe to re-run
--   (CREATE ... IF NOT EXISTS / OR REPLACE, and ON CONFLICT DO NOTHING seeds).
--   Planned modules (Recruitment, Payroll, Assets) are represented by the
--   `modules` registry extension point only; their domain tables are out of scope.
--
-- Section map
--   1. Enum types
--   2. Helper function
--   3. Global code registries
--   4. Modules registry (extension point)
--   5. Organization & identity
--   6. RBAC (roles, permissions) & system audit
--   7. Jobs & Projects
--   8. Planning, attendance & leave funds
--   9. Performance & KPI
--  10. Platform settings & notifications
--  11. Views (leave balances, KPI audit levels)
--  12. Indexes
--  13. updated_at triggers
--  14. Seed data (idempotent)
-- =============================================================================

-- gen_random_uuid() is built into PostgreSQL 13+; no extension is required.

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE priority_enum AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE task_type_enum AS ENUM ('HOURLY', 'DAILY', 'MULTI_DAY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE approval_status_enum AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE task_request_type_enum AS ENUM ('EXTENSION', 'LATE_EXPLANATION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE notification_status_enum AS ENUM ('PENDING', 'SENT', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE department_type_enum AS ENUM ('DEPARTMENT', 'DIVISION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE leave_entry_type_enum AS ENUM ('ACCRUAL', 'USAGE', 'ADJUSTMENT', 'EXPIRY', 'CARRY_OVER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- 2. HELPER FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 3. GLOBAL CODE REGISTRIES
--    Codes are the shared, system-wide vocabulary. The codes themselves are
--    unchanged from the docs; the tables add the metadata the docs describe.
-- -----------------------------------------------------------------------------

-- Ticket state codes + identifying colors (workflow: REQ -> ACT -> PEN -> {APP | REJ})
CREATE TABLE IF NOT EXISTS ticket_states (
    code        VARCHAR(10)  PRIMARY KEY,          -- REQ, ACT, PEN, APP, REJ, CAN, OVERDUE
    name        VARCHAR(40)  NOT NULL,             -- Requested, Active, Pending, ...
    color       VARCHAR(30)  NOT NULL,             -- White, Yellow, Blue, Green, Orange, Red, Red (Warning)
    description TEXT,
    is_terminal BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Leave / time-off codes + payroll & timekeeping rules
CREATE TABLE IF NOT EXISTS leave_codes (
    code               VARCHAR(10) PRIMARY KEY,    -- AL, UAL, SL, USL, PL, ML, CL, EL, LWP, TOIL, VTO
    name               VARCHAR(60) NOT NULL,
    category           VARCHAR(20) NOT NULL,       -- PAID, UNPAID, INSURANCE, SPECIAL
    is_paid            BOOLEAN     NOT NULL DEFAULT FALSE,
    payroll_rule       TEXT        NOT NULL,       -- human-readable payroll/timekeeping rule
    deducts_wage       BOOLEAN     NOT NULL DEFAULT FALSE,
    is_penalty         BOOLEAN     NOT NULL DEFAULT FALSE,  -- e.g. UAL / USL
    is_balance_tracked BOOLEAN     NOT NULL DEFAULT FALSE,  -- AL / TOIL drawn from a fund
    sort_order         SMALLINT    NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. MODULES REGISTRY (extension point for the modular app design)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS modules (
    code        VARCHAR(30)  PRIMARY KEY,          -- jobs, planning, performance, settings (+ future apps)
    name        VARCHAR(80)  NOT NULL,
    description TEXT,
    is_enabled  BOOLEAN      NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 5. ORGANIZATION & IDENTITY
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS departments (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                  VARCHAR(20) NOT NULL UNIQUE,
    name                  VARCHAR(120) NOT NULL,
    department_type       department_type_enum NOT NULL DEFAULT 'DEPARTMENT',
    parent_id             UUID REFERENCES departments(id) ON DELETE SET NULL,  -- hierarchy
    manager_id            UUID,                                                -- FK added after users
    auto_forking_enabled  BOOLEAN NOT NULL DEFAULT TRUE,                       -- Auto-forking Engine
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_code     VARCHAR(20) NOT NULL UNIQUE,
    full_name     VARCHAR(120) NOT NULL,
    email         VARCHAR(160) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Department manager relationship (resolved after `users` exists)
ALTER TABLE departments DROP CONSTRAINT IF EXISTS fk_departments_manager;
ALTER TABLE departments
    ADD CONSTRAINT fk_departments_manager
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 6. RBAC & SYSTEM AUDIT
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(50) NOT NULL UNIQUE,       -- SUPER_ADMIN, TECH_LEAD, HR_MANAGER, DEPT_HEAD, EMPLOYEE
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        VARCHAR(100) NOT NULL UNIQUE,      -- e.g. jobs.ticket.create
    module_code VARCHAR(30) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS system_audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    action        VARCHAR(100) NOT NULL,           -- USER_LOCK, PERMISSION_CHANGE, TASK_CANCEL, ...
    resource_type VARCHAR(50)  NOT NULL,           -- USER, TASK, LEAVE, PERMISSION, ...
    resource_id   VARCHAR(100),
    old_data      JSONB,
    new_data      JSONB,
    ip_address    INET,
    user_agent    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 7. JOBS & PROJECTS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS projects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(50) NOT NULL UNIQUE,
    name          VARCHAR(150) NOT NULL,
    description   TEXT,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    deleted_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_code           VARCHAR(30) NOT NULL UNIQUE,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
    task_type           task_type_enum NOT NULL DEFAULT 'DAILY',
    priority            priority_enum  NOT NULL DEFAULT 'MEDIUM',
    state               VARCHAR(10) NOT NULL DEFAULT 'REQ' REFERENCES ticket_states(code),

    -- Assignment
    created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_to         UUID REFERENCES users(id) ON DELETE SET NULL,
    department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,

    -- Timing
    start_date          TIMESTAMPTZ,
    end_date            TIMESTAMPTZ,               -- Deadline / expiration
    extended_deadline   TIMESTAMPTZ,               -- Deadline after an approved extension

    -- Progress (multi-day tasks: 0 -> 100)
    progress_percentage SMALLINT NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),

    -- Flags / warnings
    is_urgent_hourly    BOOLEAN NOT NULL DEFAULT FALSE,
    is_extension_requested BOOLEAN NOT NULL DEFAULT FALSE,
    is_overdue          BOOLEAN NOT NULL DEFAULT FALSE,

    -- Acceptance / review metadata (traceability)
    approved_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    reviewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at         TIMESTAMPTZ,

    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Append-only history of the ticket lifecycle (REQ -> ACT -> PEN -> {APP | REJ}, CAN, OVERDUE)
CREATE TABLE IF NOT EXISTS task_state_transitions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    from_state VARCHAR(10) REFERENCES ticket_states(code),
    to_state   VARCHAR(10) NOT NULL REFERENCES ticket_states(code),
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    reason     TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_progress_logs (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id               UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_percentage   SMALLINT NOT NULL DEFAULT 0 CHECK (previous_percentage BETWEEN 0 AND 100),
    new_percentage        SMALLINT NOT NULL CHECK (new_percentage BETWEEN 0 AND 100),
    log_comment           TEXT,
    is_verified_by_manager BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_requests (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id            UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_type       task_request_type_enum NOT NULL,   -- EXTENSION | LATE_EXPLANATION
    requested_deadline TIMESTAMPTZ,
    reason             TEXT NOT NULL,
    status             approval_status_enum NOT NULL DEFAULT 'PENDING',
    reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    review_comment     TEXT,
    reviewed_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Normalized attachment store (replaces repeated attachment_urls JSONB blobs)
CREATE TABLE IF NOT EXISTS attachments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type  VARCHAR(40) NOT NULL,              -- TASK_PROGRESS, TASK_REQUEST, LEAVE_REQUEST, ...
    owner_id    UUID NOT NULL,
    url         TEXT NOT NULL,
    file_name   VARCHAR(255),
    mime_type   VARCHAR(120),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 8. PLANNING, ATTENDANCE & LEAVE FUNDS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leave_requests (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_code       VARCHAR(10) NOT NULL REFERENCES leave_codes(code),
    start_date       DATE NOT NULL,
    end_date         DATE NOT NULL,
    total_days       NUMERIC(5,1) NOT NULL CHECK (total_days >= 0),
    reason           TEXT NOT NULL,
    handover_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status           approval_status_enum NOT NULL DEFAULT 'PENDING',
    approved_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_leave_request_dates CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS attendance_records (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_date      DATE NOT NULL,
    check_in       TIMESTAMPTZ,
    check_out      TIMESTAMPTZ,
    is_late        BOOLEAN NOT NULL DEFAULT FALSE,
    is_early_leave BOOLEAN NOT NULL DEFAULT FALSE,
    leave_code     VARCHAR(10) REFERENCES leave_codes(code),
    working_hours  NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (working_hours >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_attendance_user_date UNIQUE (user_id, work_date)
);

-- AL / TOIL (and other) leave-fund ledger - the source of truth for balances
CREATE TABLE IF NOT EXISTS leave_balance_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    leave_code     VARCHAR(10) NOT NULL REFERENCES leave_codes(code),
    entry_type     leave_entry_type_enum NOT NULL,
    delta_days     NUMERIC(5,1) NOT NULL,          -- positive = accrued, negative = used
    period_year    SMALLINT NOT NULL,
    reference_type VARCHAR(40),                    -- LEAVE_REQUEST, OVERTIME, MANUAL, ...
    reference_id   UUID,
    note           TEXT,
    created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Overtime hours fund that backs TOIL
CREATE TABLE IF NOT EXISTS overtime_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_date   DATE NOT NULL,
    hours       NUMERIC(5,2) NOT NULL CHECK (hours > 0),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    note        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 9. PERFORMANCE & KPI (deterministic engine)
-- -----------------------------------------------------------------------------

-- Configurable point rules. Seeded with the documented bonus/penalty values.
CREATE TABLE IF NOT EXISTS kpi_point_rules (
    code        VARCHAR(40) PRIMARY KEY,
    event       VARCHAR(60) NOT NULL,
    points      SMALLINT NOT NULL,                 -- +10, +20, +5, +50, -15, -5, -2, -10
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order  SMALLINT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Append-only ledger of every KPI point event (makes scores reproducible/auditable)
CREATE TABLE IF NOT EXISTS kpi_score_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id      UUID REFERENCES tasks(id) ON DELETE SET NULL,
    rule_code    VARCHAR(40) NOT NULL REFERENCES kpi_point_rules(code),
    points       SMALLINT NOT NULL,
    period_year  SMALLINT NOT NULL,
    period_month SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Computed per-user/month snapshot. Derived from kpi_score_events, attendance and
-- leave data (a documented materialization, not an independently edited source).
CREATE TABLE IF NOT EXISTS kpi_monthly_summaries (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_month             SMALLINT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year              SMALLINT NOT NULL,

    -- Task statistics
    total_tasks_assigned     INT NOT NULL DEFAULT 0,
    completed_on_time        INT NOT NULL DEFAULT 0,   -- +10 points / task
    completed_urgent_on_time INT NOT NULL DEFAULT 0,   -- +20 points / task
    approved_first_time      INT NOT NULL DEFAULT 0,   -- +5 points / task
    overdue_tasks            INT NOT NULL DEFAULT 0,   -- -15 points / task
    rejected_tasks           INT NOT NULL DEFAULT 0,   -- -5 points / task
    extension_requests_count INT NOT NULL DEFAULT 0,   -- -2 points / request

    -- Attendance & leave statistics
    attendance_rate          NUMERIC(5,2) NOT NULL DEFAULT 0,  -- % attendance
    perfect_attendance_bonus INT NOT NULL DEFAULT 0,   -- +50 if 100% attendance
    unapproved_leave_count   INT NOT NULL DEFAULT 0,   -- UAL, USL: -10 points / instance
    late_early_count         INT NOT NULL DEFAULT 0,   -- late/early: -10 points / instance

    -- Deterministic output
    total_kpi_score          INT NOT NULL DEFAULT 0,

    created_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kpi_summary_user_period UNIQUE (user_id, period_year, period_month)
);

-- -----------------------------------------------------------------------------
-- 10. PLATFORM SETTINGS & NOTIFICATIONS
-- -----------------------------------------------------------------------------

-- Configuration values, including the Telegram bot, alert group chat ID, and
-- webhook URL endpoints for the notification engine.
CREATE TABLE IF NOT EXISTS app_settings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_code VARCHAR(30) NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
    key         VARCHAR(80) NOT NULL,
    value       JSONB,
    is_secret   BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_app_settings_module_key UNIQUE (module_code, key)
);

-- Outbound notification log (Telegram webhook delivery tracking)
CREATE TABLE IF NOT EXISTS notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel       VARCHAR(30) NOT NULL DEFAULT 'TELEGRAM',
    template      VARCHAR(60),
    recipient     VARCHAR(120),
    payload       JSONB,
    status        notification_status_enum NOT NULL DEFAULT 'PENDING',
    attempts      SMALLINT NOT NULL DEFAULT 0,
    related_type  VARCHAR(40),
    related_id    UUID,
    error_message TEXT,
    sent_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 11. VIEWS
-- -----------------------------------------------------------------------------

-- Current AL / TOIL (and other balance-tracked) leave balances per user
CREATE OR REPLACE VIEW v_user_leave_balances AS
SELECT
    u.id   AS user_id,
    u.user_code,
    u.full_name,
    lc.code AS leave_code,
    lc.name AS leave_name,
    COALESCE(SUM(e.delta_days), 0) AS balance_days
FROM users u
JOIN leave_codes lc ON lc.is_balance_tracked
LEFT JOIN leave_balance_entries e
       ON e.user_id = u.id AND e.leave_code = lc.code
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.user_code, u.full_name, lc.code, lc.name;

-- KPI Audit Level 1 - general, company-wide, per employee (HR / Admin)
CREATE OR REPLACE VIEW v_kpi_audit_level1_company AS
SELECT
    s.period_year,
    s.period_month,
    u.id   AS user_id,
    u.user_code,
    u.full_name,
    d.id   AS department_id,
    d.name AS department_name,
    s.total_tasks_assigned,
    s.completed_on_time,
    s.overdue_tasks,
    s.unapproved_leave_count,
    s.perfect_attendance_bonus,
    s.attendance_rate,
    s.total_kpi_score
FROM kpi_monthly_summaries s
JOIN users u       ON u.id = s.user_id
LEFT JOIN departments d ON d.id = u.department_id;

-- KPI Audit Level 2 - aggregated by department / division (per period)
CREATE OR REPLACE VIEW v_kpi_audit_level2_department AS
SELECT
    s.period_year,
    s.period_month,
    d.id   AS department_id,
    d.name AS department_name,
    COUNT(DISTINCT s.user_id)              AS total_employees,
    SUM(s.total_tasks_assigned)            AS total_tasks_assigned,
    ROUND(AVG(s.attendance_rate), 2)       AS avg_attendance_rate,
    ROUND(AVG(s.total_kpi_score), 2)       AS avg_department_kpi_score
FROM kpi_monthly_summaries s
JOIN users u       ON u.id = s.user_id
JOIN departments d ON d.id = u.department_id
GROUP BY s.period_year, s.period_month, d.id, d.name;

-- KPI Audit Level 3 - per employee within a department (Department Head; filter by department_id)
CREATE OR REPLACE VIEW v_kpi_audit_level3_employee AS
SELECT
    s.period_year,
    s.period_month,
    d.id   AS department_id,
    d.name AS department_name,
    u.id   AS user_id,
    u.user_code,
    u.full_name,
    s.total_tasks_assigned,
    s.completed_on_time,
    s.overdue_tasks,
    s.approved_first_time AS immediate_approval_count,
    s.rejected_tasks      AS returned_count,
    s.perfect_attendance_bonus,
    s.attendance_rate,
    s.total_kpi_score
FROM kpi_monthly_summaries s
JOIN users u       ON u.id = s.user_id
JOIN departments d ON d.id = u.department_id;

-- -----------------------------------------------------------------------------
-- 12. INDEXES
-- -----------------------------------------------------------------------------

-- Organization & identity
CREATE INDEX IF NOT EXISTS idx_departments_parent     ON departments(parent_id);
CREATE INDEX IF NOT EXISTS idx_departments_manager    ON departments(manager_id);
CREATE INDEX IF NOT EXISTS idx_departments_type       ON departments(department_type);
CREATE INDEX IF NOT EXISTS idx_users_department       ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_active           ON users(is_active);

-- RBAC & audit
CREATE INDEX IF NOT EXISTS idx_permissions_module        ON permissions(module_code);
CREATE INDEX IF NOT EXISTS idx_user_roles_role           ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_audit_user                ON system_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource            ON system_audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created             ON system_audit_logs(created_at);

-- Jobs
CREATE INDEX IF NOT EXISTS idx_projects_department    ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project          ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_state            ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned         ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by       ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_department       ON tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_end_date         ON tasks(end_date);
CREATE INDEX IF NOT EXISTS idx_task_transitions_task  ON task_state_transitions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_transitions_state ON task_state_transitions(to_state);
CREATE INDEX IF NOT EXISTS idx_task_progress_task     ON task_progress_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_user     ON task_progress_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_requests_task     ON task_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_task_requests_status   ON task_requests(status);
CREATE INDEX IF NOT EXISTS idx_attachments_owner      ON attachments(owner_type, owner_id);

-- Planning & leave funds
CREATE INDEX IF NOT EXISTS idx_leave_requests_user     ON leave_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status   ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_code     ON leave_requests(leave_code);
CREATE INDEX IF NOT EXISTS idx_attendance_leave_code   ON attendance_records(leave_code);
CREATE INDEX IF NOT EXISTS idx_leave_balance_user      ON leave_balance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_leave_balance_code      ON leave_balance_entries(leave_code);
CREATE INDEX IF NOT EXISTS idx_leave_balance_period    ON leave_balance_entries(period_year);
CREATE INDEX IF NOT EXISTS idx_overtime_user_date      ON overtime_records(user_id, work_date);

-- Performance
CREATE INDEX IF NOT EXISTS idx_kpi_events_user_period ON kpi_score_events(user_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_kpi_events_rule        ON kpi_score_events(rule_code);
CREATE INDEX IF NOT EXISTS idx_kpi_summary_period     ON kpi_monthly_summaries(period_year, period_month);

-- Platform
CREATE INDEX IF NOT EXISTS idx_app_settings_module    ON app_settings(module_code);
CREATE INDEX IF NOT EXISTS idx_notifications_status   ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_related  ON notifications(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created  ON notifications(created_at);

-- -----------------------------------------------------------------------------
-- 13. updated_at TRIGGERS
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'departments', 'users', 'roles', 'permissions', 'modules',
        'ticket_states', 'leave_codes', 'projects', 'tasks', 'task_requests',
        'leave_requests', 'attendance_records', 'overtime_records',
        'kpi_point_rules', 'kpi_monthly_summaries', 'app_settings', 'notifications'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON %1$I', t);
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I '
            'FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 14. SEED DATA (idempotent)
-- -----------------------------------------------------------------------------

-- Ticket state codes + identifying colors
INSERT INTO ticket_states (code, name, color, description, is_terminal, sort_order) VALUES
    ('REQ',     'Requested',  'White',         'Newly allocated ticket, or not confirmed/planned before 08:30.', FALSE, 1),
    ('ACT',     'Active',     'Yellow',        'Accepted and in progress.',                                        FALSE, 2),
    ('PEN',     'Pending',    'Blue',          'Complete pressed, or multi-day task at 100% with report submitted.', FALSE, 3),
    ('APP',     'Approved',   'Green',         'Approved by Manager/HR; progress accepted.',                        TRUE,  4),
    ('REJ',     'Rejected',   'Orange',        'Rejected by Manager/HR; progress returned for revision.',           FALSE, 5),
    ('CAN',     'Cancelled',  'Red',           'Cancelled by the Employee or Manager (reason mandatory).',          TRUE,  6),
    ('OVERDUE', 'Overdue',    'Red (Warning)', 'Past the hourly/daily/multi-day deadline.',                         FALSE, 7)
ON CONFLICT (code) DO NOTHING;

-- Leave / time-off codes + payroll & timekeeping rules
INSERT INTO leave_codes (code, name, category, is_paid, payroll_rule, deducts_wage, is_penalty, is_balance_tracked, sort_order) VALUES
    ('AL',   'Annual Leave',                          'PAID',      TRUE,  '100% paid',                                                          FALSE, FALSE, TRUE,  1),
    ('UAL',  'Unapproved / Unpaid Annual Leave',      'UNPAID',    FALSE, 'Deduct 100% of the daily wage + KPI point deduction',                TRUE,  TRUE,  FALSE, 2),
    ('SL',   'Sick Leave',                            'INSURANCE', TRUE,  'Social insurance regime / sick pay',                                 FALSE, FALSE, FALSE, 3),
    ('USL',  'Unexcused / Unpaid Sick Leave',         'UNPAID',    FALSE, 'Deduct 100% of the daily wage + KPI point deduction',                TRUE,  TRUE,  FALSE, 4),
    ('PL',   'Personal Leave',                        'PAID',      TRUE,  '100% paid under the Labor Law',                                      FALSE, FALSE, FALSE, 5),
    ('ML',   'Medical / Maternity Leave',             'INSURANCE', TRUE,  'Social insurance regime for maternity/medical',                      FALSE, FALSE, FALSE, 6),
    ('CL',   'Compassionate Leave',                   'SPECIAL',   TRUE,  'Paid or unpaid depending on policy',                                 FALSE, FALSE, FALSE, 7),
    ('EL',   'Emergency Leave',                       'SPECIAL',   TRUE,  'Prioritized for supplementary approval afterward',                   FALSE, FALSE, FALSE, 8),
    ('LWP',  'Leave Without Pay',                     'UNPAID',    FALSE, 'No daily wage, no penalty',                                          FALSE, FALSE, FALSE, 9),
    ('TOIL', 'Time Off In Lieu',                      'PAID',      TRUE,  '100% paid (deducted from the OT hours fund)',                        FALSE, FALSE, TRUE, 10),
    ('VTO',  'Voluntary Time Off',                    'UNPAID',    FALSE, 'Unpaid / support depending on policy',                               FALSE, FALSE, FALSE, 11)
ON CONFLICT (code) DO NOTHING;

-- App modules (extension point: register future apps here)
INSERT INTO modules (code, name, description, sort_order) VALUES
    ('jobs',        'Jobs & Projects',      'Task assignment, progress and acceptance.',        1),
    ('planning',    'Planning & Attendance','Matrix calendar, attendance and leave.',           2),
    ('performance', 'Performance & Audit',  'Deterministic KPI scoring and audit tables.',      3),
    ('settings',    'Settings & IAM',       'Authorization, organization and configuration.',   4)
ON CONFLICT (code) DO NOTHING;

-- Roles
INSERT INTO roles (code, name, description) VALUES
    ('SUPER_ADMIN', 'Super Admin',        'Full system administration.'),
    ('TECH_LEAD',   'Manager / Tech Lead','Management plus RBAC and webhook configuration.'),
    ('HR_MANAGER',  'HR Manager',         'Company-wide HR: users, leave, reports.'),
    ('DEPT_HEAD',   'Department Head',    'Department-scoped management.'),
    ('EMPLOYEE',    'Employee',           'Personal workspace only.')
ON CONFLICT (code) DO NOTHING;

-- Permissions (one per documented function, grouped by module)
INSERT INTO permissions (code, module_code, description) VALUES
    ('jobs.ticket.create',            'jobs',        'Create / allocate a ticket (REQ).'),
    ('jobs.ticket.accept_report',     'jobs',        'Accept a task (ACT) and report (PEN).'),
    ('jobs.ticket.approve_return',    'jobs',        'Approve (APP) or return (REJ) a report.'),
    ('jobs.ticket.cancel',            'jobs',        'Cancel a ticket (CAN).'),
    ('jobs.ticket.request_extension', 'jobs',        'Request an extension or explain a late submission.'),
    ('jobs.ticket.print_export',      'jobs',        'Print ticket slips / export task data.'),
    ('planning.calendar.view',        'planning',    'View the attendance matrix calendar.'),
    ('planning.leave.register',       'planning',    'Register a leave request.'),
    ('planning.leave.approve',        'planning',    'Approve leave requests / work.'),
    ('planning.leave.assign_penalty', 'planning',    'Assign penalty leave codes (UAL, USL).'),
    ('planning.print_export',         'planning',    'Print leave requests / export attendance data.'),
    ('performance.kpi.view_personal', 'performance', 'View the personal KPI dashboard.'),
    ('performance.audit.level3_view', 'performance', 'View Audit Level 3 (employees in a department).'),
    ('performance.audit.level1_2_view','performance','View Audit Levels 1 & 2 (company / department).'),
    ('performance.print_export',      'performance', 'Print / export KPI and audit reports.'),
    ('settings.users.manage',         'settings',    'Manage accounts (create/edit/reset/lock).'),
    ('settings.rbac.manage',          'settings',    'Manage RBAC authorization.'),
    ('settings.webhook.manage',       'settings',    'Manage the Telegram webhook configuration.')
ON CONFLICT (code) DO NOTHING;

-- KPI point rules (documented bonus / penalty values)
INSERT INTO kpi_point_rules (code, event, points, description, sort_order) VALUES
    ('KPI_ON_TIME_TICKET',      'on_time_ticket',       10,  '+10 per on-time ticket (APP).',                        1),
    ('KPI_ON_TIME_URGENT',      'on_time_urgent_ticket',20,  '+20 per on-time urgent ticket (APP).',                 2),
    ('KPI_FIRST_TIME_APPROVAL', 'first_time_approval',  5,   '+5 per instance approved immediately without edits.',   3),
    ('KPI_PERFECT_ATTENDANCE',  'perfect_attendance',   50,  '+50 per month of excellent attendance.',                4),
    ('KPI_OVERDUE_TICKET',      'overdue_ticket',       -15, '-15 per overdue ticket (OVERDUE).',                     5),
    ('KPI_RETURNED_TICKET',     'returned_ticket',      -5,  '-5 per instance returned (REJ).',                       6),
    ('KPI_EXTENSION_REQUEST',   'extension_request',    -2,  '-2 per extension request.',                             7),
    ('KPI_UNAPPROVED_LEAVE',    'unapproved_leave',     -10, '-10 per late/early instance or unapproved leave (UAL/USL).', 8)
ON CONFLICT (code) DO NOTHING;

-- Role -> permission grants derived from the documented permission matrix
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON TRUE
WHERE
    -- Super Admin: everything
    (r.code = 'SUPER_ADMIN')
    -- Manager / Tech Lead: everything except account management
    OR (r.code = 'TECH_LEAD' AND p.code <> 'settings.users.manage')
    -- HR Manager: all app functions; user directory only in Settings
    OR (r.code = 'HR_MANAGER'
        AND p.code NOT IN ('settings.rbac.manage', 'settings.webhook.manage'))
    -- Department Head: department-scoped app functions; Settings hidden
    OR (r.code = 'DEPT_HEAD' AND p.code IN (
        'jobs.ticket.create', 'jobs.ticket.accept_report', 'jobs.ticket.approve_return',
        'jobs.ticket.cancel', 'jobs.ticket.request_extension', 'jobs.ticket.print_export',
        'planning.calendar.view', 'planning.leave.register', 'planning.leave.approve',
        'planning.print_export',
        'performance.kpi.view_personal', 'performance.audit.level3_view',
        'performance.print_export'))
    -- Employee: personal workspace only
    OR (r.code = 'EMPLOYEE' AND p.code IN (
        'jobs.ticket.accept_report', 'jobs.ticket.request_extension', 'jobs.ticket.print_export',
        'planning.calendar.view', 'planning.leave.register', 'planning.print_export',
        'performance.kpi.view_personal', 'performance.print_export'))
ON CONFLICT DO NOTHING;

-- =============================================================================
-- END OF OPTIMIZED SCHEMA
-- =============================================================================
