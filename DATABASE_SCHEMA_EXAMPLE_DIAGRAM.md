# DATABASE_SCHEMA_EXAMPLE_DIAGRAM.md

> ER-diagram view of [`DATABASE_SCHEMA_EXAMPLE.sql`](./DATABASE_SCHEMA_EXAMPLE.sql). Every diagram is **Mermaid `erDiagram`** and renders in Markdown viewers (e.g. GitHub).
>
> **Legend.** Each entity is a table; each attribute is a column with a single-token type (the first word of the SQL type). `PK` marks a primary key, `FK` a foreign key. Composite keys mark each key column `PK`. Relationship lines read `PARENT ||--o{ CHILD : "fk_column"`: `||` = exactly one parent, `o{` = zero-or-many children, `|{` = one-or-many children (a `NOT NULL` foreign key). Each diagram carries a `*Source:*` line naming the SQL it derives from. Names match the DDL exactly.

**Diagram index**

1. [Full ER Diagram](#1-full-er-diagram)
2. [Organization & Identity](#2-organization--identity)
3. [RBAC & Audit](#3-rbac--audit)
4. [Jobs & Projects](#4-jobs--projects)
5. [Planning & Attendance](#5-planning--attendance)
6. [Performance](#6-performance)

---

## 1. Full ER Diagram

All 14 tables of the original schema.

```mermaid
erDiagram
    departments {
        uuid id PK
        varchar code
        varchar name
        uuid manager_id FK
        boolean auto_forking_enabled
        timestamptz created_at
        timestamptz updated_at
    }

    users {
        uuid id PK
        varchar user_code
        varchar full_name
        varchar email
        varchar password_hash
        uuid department_id FK
        boolean is_active
        numeric annual_leave_quota
        numeric toil_quota
        timestamptz created_at
        timestamptz updated_at
    }

    roles {
        uuid id PK
        varchar code
        varchar name
        text description
        timestamptz created_at
    }

    user_roles {
        uuid user_id PK, FK
        uuid role_id PK, FK
    }

    permissions {
        uuid id PK
        varchar code
        varchar module
        text description
    }

    role_permissions {
        uuid role_id PK, FK
        uuid permission_id PK, FK
    }

    system_audit_logs {
        uuid id PK
        uuid user_id FK
        varchar action
        varchar resource_type
        varchar resource_id
        jsonb old_data
        jsonb new_data
        varchar ip_address
        timestamptz created_at
    }

    projects {
        uuid id PK
        varchar code
        varchar name
        text description
        uuid department_id FK
        timestamptz created_at
    }

    tasks {
        uuid id PK
        varchar task_code
        varchar title
        text description
        uuid project_id FK
        enum task_type
        enum priority
        enum state
        uuid created_by FK
        uuid assigned_to FK
        uuid department_id FK
        timestamptz start_date
        timestamptz end_date
        timestamptz extended_deadline
        int progress_percentage
        boolean is_urgent_hourly
        boolean is_extension_requested
        boolean is_overdue
        timestamptz created_at
        timestamptz updated_at
    }

    task_progress_logs {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        int previous_percentage
        int new_percentage
        text log_comment
        jsonb attachment_urls
        boolean is_verified_by_manager
        timestamptz created_at
    }

    task_requests {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        varchar request_type
        timestamptz requested_deadline
        text reason
        jsonb attachment_urls
        varchar status
        uuid reviewed_by FK
        text review_comment
        timestamptz created_at
    }

    leave_requests {
        uuid id PK
        uuid user_id FK
        enum leave_code
        date start_date
        date end_date
        numeric total_days
        text reason
        jsonb attachment_urls
        uuid handover_user_id FK
        varchar status
        uuid approved_by FK
        timestamptz created_at
    }

    attendance_records {
        uuid id PK
        uuid user_id FK
        date work_date
        timestamptz check_in
        timestamptz check_out
        boolean is_late
        boolean is_early_leave
        enum leave_code
        numeric working_hours
        timestamptz created_at
    }

    kpi_monthly_summaries {
        uuid id PK
        uuid user_id FK
        int period_month
        int period_year
        int total_tasks_assigned
        int completed_on_time
        int completed_urgent_on_time
        int approved_first_time
        int overdue_tasks
        int rejected_tasks
        int extension_requests_count
        numeric attendance_rate
        int perfect_attendance_bonus
        int unapproved_leave_count
        int late_early_count
        int total_kpi_score
        timestamptz created_at
        timestamptz updated_at
    }

    users ||--o{ departments : "manager_id"
    departments ||--o{ users : "department_id"

    users ||--|{ user_roles : "user_id"
    roles ||--|{ user_roles : "role_id"
    roles ||--|{ role_permissions : "role_id"
    permissions ||--|{ role_permissions : "permission_id"
    users ||--o{ system_audit_logs : "user_id"

    departments ||--o{ projects : "department_id"
    projects ||--o{ tasks : "project_id"
    users ||--o{ tasks : "created_by"
    users ||--o{ tasks : "assigned_to"
    departments ||--o{ tasks : "department_id"
    tasks ||--o{ task_progress_logs : "task_id"
    users ||--o{ task_progress_logs : "user_id"
    tasks ||--o{ task_requests : "task_id"
    users ||--o{ task_requests : "user_id"
    users ||--o{ task_requests : "reviewed_by"

    users ||--o{ leave_requests : "user_id"
    users ||--o{ leave_requests : "handover_user_id"
    users ||--o{ leave_requests : "approved_by"
    users ||--o{ attendance_records : "user_id"

    users ||--o{ kpi_monthly_summaries : "user_id"
```

*Source:* `DATABASE_SCHEMA_EXAMPLE.sql` — all sections (enums, Settings & IAM, Jobs & Projects, Planning & Attendance, Performance & Audit).

---

## 2. Organization & Identity

`departments` and `users`, with the manager ↔ department relationships.

```mermaid
erDiagram
    departments {
        uuid id PK
        varchar code
        varchar name
        uuid manager_id FK
        boolean auto_forking_enabled
        timestamptz created_at
        timestamptz updated_at
    }

    users {
        uuid id PK
        varchar user_code
        varchar full_name
        varchar email
        varchar password_hash
        uuid department_id FK
        boolean is_active
        numeric annual_leave_quota
        numeric toil_quota
        timestamptz created_at
        timestamptz updated_at
    }

    users ||--o{ departments : "manager_id"
    departments ||--o{ users : "department_id"
```

*Source:* `DATABASE_SCHEMA_EXAMPLE.sql` — section 2 (Settings & IAM: departments, users).

---

## 3. RBAC & Audit

Roles, permissions, their join tables, and the system audit log.

```mermaid
erDiagram
    roles {
        uuid id PK
        varchar code
        varchar name
        text description
        timestamptz created_at
    }

    user_roles {
        uuid user_id PK, FK
        uuid role_id PK, FK
    }

    permissions {
        uuid id PK
        varchar code
        varchar module
        text description
    }

    role_permissions {
        uuid role_id PK, FK
        uuid permission_id PK, FK
    }

    system_audit_logs {
        uuid id PK
        uuid user_id FK
        varchar action
        varchar resource_type
        varchar resource_id
        jsonb old_data
        jsonb new_data
        varchar ip_address
        timestamptz created_at
    }

    users {
        uuid id PK
    }

    users ||--|{ user_roles : "user_id"
    roles ||--|{ user_roles : "role_id"
    roles ||--|{ role_permissions : "role_id"
    permissions ||--|{ role_permissions : "permission_id"
    users ||--o{ system_audit_logs : "user_id"
```

*Source:* `DATABASE_SCHEMA_EXAMPLE.sql` — section 2 (Settings & IAM: RBAC roles, permissions, audit logs).

---

## 4. Jobs & Projects

Projects, tickets, progress logs, and extension/late-submission requests.

```mermaid
erDiagram
    projects {
        uuid id PK
        varchar code
        varchar name
        text description
        uuid department_id FK
        timestamptz created_at
    }

    tasks {
        uuid id PK
        varchar task_code
        varchar title
        text description
        uuid project_id FK
        enum task_type
        enum priority
        enum state
        uuid created_by FK
        uuid assigned_to FK
        uuid department_id FK
        timestamptz start_date
        timestamptz end_date
        timestamptz extended_deadline
        int progress_percentage
        boolean is_urgent_hourly
        boolean is_extension_requested
        boolean is_overdue
        timestamptz created_at
        timestamptz updated_at
    }

    task_progress_logs {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        int previous_percentage
        int new_percentage
        text log_comment
        jsonb attachment_urls
        boolean is_verified_by_manager
        timestamptz created_at
    }

    task_requests {
        uuid id PK
        uuid task_id FK
        uuid user_id FK
        varchar request_type
        timestamptz requested_deadline
        text reason
        jsonb attachment_urls
        varchar status
        uuid reviewed_by FK
        text review_comment
        timestamptz created_at
    }

    departments {
        uuid id PK
    }

    users {
        uuid id PK
    }

    departments ||--o{ projects : "department_id"
    projects ||--o{ tasks : "project_id"
    users ||--o{ tasks : "created_by"
    users ||--o{ tasks : "assigned_to"
    departments ||--o{ tasks : "department_id"
    tasks ||--o{ task_progress_logs : "task_id"
    users ||--o{ task_progress_logs : "user_id"
    tasks ||--o{ task_requests : "task_id"
    users ||--o{ task_requests : "user_id"
    users ||--o{ task_requests : "reviewed_by"
```

*Source:* `DATABASE_SCHEMA_EXAMPLE.sql` — section 3 (Jobs & Projects). Cross-domain parents (`users`, `departments`) are shown as key-only entities.

---

## 5. Planning & Attendance

Leave requests and daily attendance records.

```mermaid
erDiagram
    leave_requests {
        uuid id PK
        uuid user_id FK
        enum leave_code
        date start_date
        date end_date
        numeric total_days
        text reason
        jsonb attachment_urls
        uuid handover_user_id FK
        varchar status
        uuid approved_by FK
        timestamptz created_at
    }

    attendance_records {
        uuid id PK
        uuid user_id FK
        date work_date
        timestamptz check_in
        timestamptz check_out
        boolean is_late
        boolean is_early_leave
        enum leave_code
        numeric working_hours
        timestamptz created_at
    }

    users {
        uuid id PK
    }

    users ||--o{ leave_requests : "user_id"
    users ||--o{ leave_requests : "handover_user_id"
    users ||--o{ leave_requests : "approved_by"
    users ||--o{ attendance_records : "user_id"
```

*Source:* `DATABASE_SCHEMA_EXAMPLE.sql` — section 4 (Planning & Attendance). `users` is shown as a key-only cross-domain entity.

---

## 6. Performance

The per-user, per-month KPI summary.

```mermaid
erDiagram
    kpi_monthly_summaries {
        uuid id PK
        uuid user_id FK
        int period_month
        int period_year
        int total_tasks_assigned
        int completed_on_time
        int completed_urgent_on_time
        int approved_first_time
        int overdue_tasks
        int rejected_tasks
        int extension_requests_count
        numeric attendance_rate
        int perfect_attendance_bonus
        int unapproved_leave_count
        int late_early_count
        int total_kpi_score
        timestamptz created_at
        timestamptz updated_at
    }

    users {
        uuid id PK
    }

    users ||--o{ kpi_monthly_summaries : "user_id"
```

*Source:* `DATABASE_SCHEMA_EXAMPLE.sql` — section 5 (Performance & Audit). `users` is shown as a key-only cross-domain entity.

---

*This document is a visual summary only; `DATABASE_SCHEMA_EXAMPLE.sql` is authoritative for detail.*
