# SYSTEM_ARCHITECTURE.md

> Architecture reference for the MES prototype. This document describes the **structure** of the system — its modules, layers, core engines, shared domain model, authorization model, integrations, and extension points. It is derived from, and should be read alongside, [`SYSTEM_PROCESS_FLOW-en.md`](./SYSTEM_PROCESS_FLOW-en.md), which describes the same system as process flows and role-based screens.

---

## 1. Purpose & Scope

This document is the single architecture reference for the system. It serves contributors, reviewers, and coding agents who need to understand how the system is put together without reading the full process-flow document end to end.

- **Source of truth.** Every architectural statement here is derived from `SYSTEM_PROCESS_FLOW-en.md`. Where this document and the process-flow document differ in framing, the process-flow document governs behavior and this document governs structure.
- **View.** The process-flow document is organized by role and screen; this document is organized by structure — modules, layers, engines, and the shared domain model.
- **Technology neutrality.** The architecture is described logically. It intentionally names no framework, language, data store, host, or deployment infrastructure.

**In scope:** module boundaries, the layered view, core engines and services, the shared domain model (state and leave codes), the two-layer authorization model, integration points, cross-cutting concerns, and the extension model.

**Out of scope:** implementation detail, concrete technology choices, deployment/infrastructure, data-schema definitions, and screen-by-screen process flows (see `SYSTEM_PROCESS_FLOW-en.md`).

---

## 2. System Overview & Context

The system is a modular, app-based management platform for planning and tracking project work, attendance, leave, and performance. It is built on an **Odoo-like architecture**: a single Core Base Module provides shared platform capabilities, and feature capabilities are delivered as discrete **apps** that plug into the core. A built-in **two-layer authorization** mechanism decides exactly which interface each role sees.

The system serves five roles: **Employee**, **Department Head**, **HR Manager**, **Manager / Tech Lead**, and **Super Admin**.

| App | Role in the system |
| --- | --- |
| **Jobs & Projects** (`Jobs`) | Main operational and ticket-handling module: task assignment, progress, and acceptance. |
| **Planning & Attendance** (`Planning`) | Matrix work calendar, attendance, acceptance-report approval, and leave registration. |
| **Performance & Audit** (`Performance`) | Performance measurement that computes scores automatically from a fixed deterministic rule set. |
| **Settings & IAM** (`Settings`) | Administration: authorization, organization management, and connection configuration. |

Shared, system-wide code registries — **ticket state codes** and **leave codes** — give every app a common vocabulary (see §7 and §13).

---

## 3. Architectural Principles

1. **Modular core with pluggable apps.** A single Core Base Module owns shared platform services; each app is a self-contained capability that plugs into the core. This mirrors the Odoo-like design and is what makes future apps additive rather than invasive (§12).
2. **One shared code registry.** Ticket state codes and leave codes are global, not per-app, so state and classification mean the same thing everywhere.
3. **Two-layer authorization.** Access is decided in two independent layers: an app-level guard (which apps a role may open) and a view/action-level guard (which tabs, columns, buttons, and export actions render inside an app) (§8).
4. **Deterministic, rule-based scoring.** Performance is computed by a fixed algorithm, not by judgment, so a score is reproducible from the same inputs (§9.3).
5. **Role-driven UI rendering.** The interface is assembled per role from the authorization model rather than filtered after the fact; different roles see different apps, tabs, and actions.
6. **Auditability by default.** Administrative and state-changing activity is recorded so changes can be traced (§10).

---

## 4. Logical Architecture

The system is a core surrounded by apps. The core provides identity, authorization, notification, scoring, and the shared code registries; each app contributes a capability on top of it.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE BASE MODULE (System)                       │
│  - User Directory, RBAC & Permission Matrix Engine                     │
│  - Telegram Webhook Notification Engine                                │
│  - Deterministic Performance Calculation Engine (KPIs)                 │
│  - Global State Codes (REQ, ACT, PEN, APP, REJ, CAN, OVERDUE)          │
│  - Global Leave Codes (AL, UAL, SL, USL, PL, ML, CL, EL, LWP, TOIL, VTO)│
└───────────┬───────────────────┬───────────────────┬────────────────────┘
            │                   │                   │
    ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐
    │  App 1: Jobs  │   │App 2: Planning│   │App 3: Perform │   │App 4: Settings│
    │  & Projects   │   │  & Attendance │   │  & KPI Audit  │   │    & IAM      │
    └───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘
```

**Core Base Module contents:**

- User Directory, RBAC & Permission Matrix Engine
- Telegram Webhook Notification Engine
- Deterministic Performance Calculation Engine (KPIs)
- Global State Codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`)
- Global Leave Codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`)

The core is the only source of authorization truth, notification delivery, scoring, and code definitions; apps consume these and add their own domain behavior.

---

## 5. Layered View

The same system viewed as stacked layers, from what the user sees down to what is stored:

| Layer | Responsibility |
| --- | --- |
| **Presentation / UI rendering** | Renders the role-specific interface: the app dashboard, in-app tabs, data columns, action buttons, and print/export controls. Rendered from the authorization model, so each role sees a different assembly of the same features. |
| **App / module layer** | Hosts the four capability apps (`Jobs`, `Planning`, `Performance`, `Settings`) and their domain behavior — task lifecycle, attendance and leave, scoring and audit views, and administration. |
| **Core-services layer** | Shared platform services supplied by the Core Base Module: permission evaluation, notification dispatch, deterministic performance calculation, and the shared code registries. |
| **Data layer** | Holds the system's domain entities and their states: people and organizational units, projects and tickets with progress, acceptance and request records, attendance and leave records, performance summaries, and audit logs. |

Dependencies point inward: the presentation layer depends on the app layer, the app layer depends on core services, and everything depends on the shared domain model. No layer below depends on one above.

---

## 6. Module Catalog

### 6.1 App 1 — Jobs & Projects (`Jobs`)

- **Purpose.** The main operational and ticket-handling module.
- **Responsibilities.** Track projects/campaigns (every ticket attaches to a project or the default group *General Operations*); classify work by time and progress; drive the ticket state lifecycle; handle extension requests and late-submission explanations.
- **Key capabilities.** Time/progress classification (Hourly, Daily, Multi-day); the ticket state-transition flow; the extension-request process (new deadline + reason + evidence, then manager approve/reject); late-submission handling that moves overdue work into a reviewable state.
- **Role-based interface visibility.** Employees see only their own tickets and cannot create tickets allocated to others. Managers and HR see a create-new-ticket action (with the Auto-forking Engine — §9.4), all department/company tickets, and a cancel-ticket action.

### 6.2 App 2 — Planning & Attendance (`Planning`)

- **Purpose.** Manage the matrix work calendar, attendance, acceptance-report approval, and leave registration.
- **Responsibilities.** Render the department matrix grid (employees as rows grouped by department, days/hours as columns, tickets as progress bars carrying their state code); host the approval board for reports in review; run the leave workflow.
- **Key capabilities.** Approval board for work reports and for extension/late-submission approvals; leave request → approve/reject workflow; assignment of penalty leave codes for unauthorized absence.
- **Role-based interface visibility.** Employees see only their personal calendar, their own attendance/leave badges, and a create-leave-request action; the approval board is hidden. Department Heads see the department-wide matrix and the department-level approval tabs. HR and Super Admin see the company-wide matrix (with a department filter) plus the system-wide approval board and the ability to assign penalty leave codes.

### 6.3 App 3 — Performance & Audit (`Performance`)

- **Purpose.** Measure and compute performance scores automatically from a fixed rule set.
- **Responsibilities.** Apply the deterministic scoring algorithm; expose personal KPI dashboards and the multi-level audit tables.
- **Key capabilities.** Deterministic scoring (§9.3); a three-level audit view — a general company-wide table (HR/Admin), a department-level table, and an employee-level table (Department Head) — plus personal KPI dashboards and leave-fund balances.
- **Role-based interface visibility.** Employees see only their personal KPI dashboard, personal chart, and their own leave-fund balances; audit tables are hidden. Department Heads additionally see the employee-level table for their own department. HR and Admin see the full three-level audit tables and company-wide ranking.

### 6.4 App 4 — Settings & IAM (`Settings`)

- **Purpose.** The administration center for authorization, organization management, and connection configuration.
- **Responsibilities.** Manage the user directory; manage departments/divisions and the auto-forking mechanism; record system audit logs; configure notification/webhook settings.
- **Key capabilities.** Account lifecycle management (view, create, edit, reset password, soft delete); organizational structure management; system audit logging; notification/webhook configuration (bot, alert group chat ID, webhook URL endpoints).
- **Role-based interface visibility.** The app is fully hidden from Employees and Department Heads. HR Managers see the user directory only; authorization and webhook menus are hidden. Super Admins and Technical Leads see the complete technical configuration set.

---

## 7. Shared Domain Model

### 7.1 Ticket state machine

A ticket moves through a defined lifecycle. The primary path is:

$$\text{REQ (Requested)} \xrightarrow{\text{Accept Task}} \text{ACT (Active)} \xrightarrow{\text{Submit Report}} \text{PEN (Pending)} \begin{cases} \xrightarrow{\text{Approve}} \text{APP (Approved)} \\ \xrightarrow{\text{Return}} \text{REJ (Rejected)} \end{cases}$$

A ticket can be **cancelled (CAN)** at any time, and passing its deadline moves it to **OVERDUE**.

### 7.2 Ticket state registry

| State Code | State Name | Identifying Color Code | State Condition & Trigger |
| --- | --- | --- | --- |
| **REQ** | **Requested** *(Assignment / Not yet confirmed)* | ⚪ **White** | Newly allocated ticket, or the employee has not confirmed / has not planned before 08:30. |
| **ACT** | **Active** *(In progress / Being worked on)* | 🟡 **Yellow** | The employee has accepted the task and is working on it. Secondary badges: `ACT - Urgent Processing` \| `ACT - Progress Update (X%)` \| `ACT - Awaiting Extension Approval` \| `ACT - Awaiting Progress Verification`. |
| **PEN** | **Pending** *(Awaiting review / Awaiting acceptance)* | 🔵 **Blue** | The "Complete" button is pressed, or a multi-day task reaches 100% progress + acceptance files & report are submitted. |
| **APP** | **Approved** *(Completed / Approved)* | 🟢 **Green** | The Manager/HR has approved the result report / successfully accepted the progress. |
| **REJ** | **Rejected** *(Needs revision / Returned)* | 🟠 **Orange** | The report is rejected by the Manager/HR, or the progress % is returned (requiring edits/redo). |
| **CAN** | **Cancelled** *(Cancelled)* | 🔴 **Red** | The ticket is cancelled by the Employee or Manager (a reason is mandatory). |
| **OVERDUE** | **Overdue / Expired** *(Past due / Expired)* | 🔴 **Red (Warning)** | Past the hourly deadline for an urgent task, past 00:00 of the next day for a daily task, or past the 00:00 immediately after `End_Date` while progress is < 100%. |

### 7.3 Leave code registry

| Leave Code | English Name | Name / Explanation | Payroll & Timekeeping Rules |
| --- | --- | --- | --- |
| **AL** | Annual Leave | Annual leave (paid) | 100% paid |
| **UAL** | Unapproved / Unpaid Annual Leave | Unapproved annual leave / Absence without notice | Deduct 100% of the daily wage + KPI point deduction |
| **SL** | Sick Leave | Sick leave (with a doctor's note / social insurance) | Social insurance regime / sick pay |
| **USL** | Unexcused / Unpaid Sick Leave | Sick leave without reason / without a note | Deduct 100% of the daily wage + KPI point deduction |
| **PL** | Personal Leave | Personal leave (marriage, bereavement) | 100% paid under the Labor Law |
| **ML** | Medical / Maternity Leave | Maternity leave / long-term medical treatment | Social insurance regime for maternity/medical |
| **CL** | Compassionate Leave | Compassionate leave / special family circumstances | Paid or unpaid depending on policy |
| **EL** | Emergency Leave | Emergency leave (natural disaster, accident) | Prioritized for supplementary approval afterward |
| **LWP** | Leave Without Pay | Unpaid leave (already agreed) | No daily wage, no penalty |
| **TOIL** | Time Off In Lieu | Compensatory leave (drawing on the OT hours fund) | 100% paid (deducted from the OT hours fund) |
| **VTO** | Voluntary Time Off | Voluntary leave (company has little work) | Unpaid / support depending on policy |

---

## 8. Authorization Architecture

Authorization is enforced through **two layers of control**, evaluated independently:

- **Layer 1 — App-Level Access Guard.** Determines which app icons appear on the home dashboard after login, for the current role.
- **Layer 2 — View & Action-Level Access Guard.** Determines which tabs, data columns, action buttons, and print/export controls are rendered inside each app.

Because both layers are driven by the same permission model, the interface each role sees is a direct expression of that role's permissions.

### Permission model (architectural summary)

The permission matrix maps roles to functions across the four apps. Its scope vocabulary is:

- **(All)** — unrestricted within the function.
- **(Company-wide)** — all departments.
- **(Department-only)** — restricted to the user's own department.
- **(Personal detail) / personal views** — restricted to the user's own records.

| Function area | Super Admin | Manager / Tech Lead | HR Manager | Department Head | Employee |
| --- | --- | --- | --- | --- | --- |
| **Jobs** (create/allocate, accept & report, approve/return, cancel) | ✅ (All) | ✅ (All) | ✅ (Company-wide) | ✅ (Department-only) | ✅ (Personal detail) |
| **Planning** (matrix calendar, approve work/leave, register leave) | ✅ (All) | ✅ (All) | ✅ (Company-wide) | ✅ (Department-only) | ✅ (Personal detail) |
| **Performance** (personal KPI, audit tables) | ✅ (All) | ✅ (All) | ✅ (Company-wide) | ✅ (Department-only) | ✅ (Personal KPI) |
| **Settings & IAM** | ✅ (visible) | ✅ (hidden from Employees) | 🟡 (view users only) | ❌ (fully hidden) | ❌ (fully hidden) |

**Notable asymmetries** that the architecture must preserve:

- Only HR Manager and Super Admin can assign the penalty leave codes **UAL** / **USL**; Manager/Tech Lead and Department Head cannot.
- Only Super Admin and Manager/Tech Lead can manage RBAC authorization and the webhook configuration.
- HR Manager can manage accounts in the user directory but does not see the RBAC or webhook menus.
- Department Head never sees the company-wide audit levels; Employee never sees any audit level above their personal KPI.

---

## 9. Core Engines & Services

These shared services live in the Core Base Module and are consumed by the apps.

### 9.1 RBAC & Permission Matrix Engine

Evaluates the permission model and drives both authorization layers (§8). It answers two questions per request: which apps the role may open (Layer 1), and which actions/views render inside an app (Layer 2).

### 9.2 Telegram Webhook Notification Engine

Delivers system notifications to a configured Telegram bot and alert group. It is the notification backbone for state changes and approval events, and is configured in the `Settings` app.

### 9.3 Deterministic Performance Calculation Engine (KPI)

Computes performance scores from a fixed rule set so results are reproducible:

$$\text{Total Performance Score} = \text{Total Bonus Points (+)} - \text{Total Penalty Points (-)}$$

- **Bonus points (+):** `+10` per on-time ticket (**APP**); `+20` per on-time urgent ticket (**APP**); `+5` per instance approved immediately without edits; `+50` per month of excellent attendance.
- **Penalty points (-):** `-15` per overdue ticket (**OVERDUE**); `-5` per instance returned (**REJ**); `-2` per extension request; `-10` per instance of arriving late, leaving early, or unapproved leave (**UAL**/**USL**).

### 9.4 Auto-forking Engine

Replicates a newly created ticket automatically to the appropriate accounts within the department, configured through organization settings. It backs the create-new-ticket capability for Managers and HR.

### 9.5 Print/Export Engine

Produces the printable and exportable outputs used across the apps: standard PDF printouts (assignment/acceptance slips, leave requests, KPI reports, attendance calendars) and spreadsheet exports (`.xlsx`, `.csv`) such as ticket lists, attendance summaries, and multi-sheet audit workbooks.

### 9.6 Global State & Leave Code Registry

Owns the shared code vocabulary — ticket state codes (`REQ`, `ACT`, `PEN`, `APP`, `REJ`, `CAN`, `OVERDUE`) and leave codes (`AL`, `UAL`, `SL`, `USL`, `PL`, `ML`, `CL`, `EL`, `LWP`, `TOIL`, `VTO`) — so all apps classify states and leave identically.

---

## 10. Cross-Cutting Concerns & Non-Functional Notes

- **Auditability.** The Settings app records the full history of technical interventions — **user, action, field changes, timestamp, and IP address** — so administrative changes are traceable.
- **Notification.** State changes and approval events are delivered through the Telegram webhook; notification configuration (bot, alert group chat ID, webhook URL endpoints) is centralized in Settings.
- **Report outputs.** Print outputs are standard PDF; spreadsheet exports are `.xlsx` and `.csv`. Print layouts include A4 (e.g. leave requests, KPI reports) and A4 Landscape (e.g. monthly attendance calendars). The multi-level audit export produces a workbook with one sheet per audit level.
- **Timekeeping constraints.** Deadlines and transitions are rule-based: the daily planning/confirmation cutoff is **08:30**; urgent tasks use the hourly slots **10:30**, **14:00**, and **16:30**; daily tasks default to **17:00**/**18:00** the same day; multi-day tasks are tracked by accumulated progress with milestones at **25%**, **50%**, **75%**, and **100%**. A ticket becomes **OVERDUE** when it passes the relevant deadline.
- **Attendance rules.** Approved leave displays the official leave badge for the day; unauthorized absence is tagged **UAL** or **USL** and deducts 100% of the daily wage plus an attendance KPI deduction.
- **Reproducibility.** Scoring is deterministic (§9.3), so the same inputs always produce the same performance score.

---

## 11. Integration Points

The system has a single external integration: the **Telegram webhook**. The Telegram Webhook Notification Engine (part of the core, §9.2) sends notifications to a configured bot's alert group. The integration is configured in the `Settings` app, where the **Telegram bot**, the **alert group Chat ID**, and the **webhook URL endpoints** are defined. No other external integration is part of the current architecture.

---

## 12. Extensibility & Future Modules

Because capabilities are delivered as apps on top of the Core Base Module, new modules are embedded directly into the home dashboard without redesigning the core. The planned additions are:

1. **App Recruitment (`Recruitment`).** Manages the recruitment process and automatically creates an account in the `Settings` app when a candidate is hired.
2. **App Payroll (`Payroll`).** Reads attendance data from the `Planning` app and KPI points from the `Performance` app to automatically compute and export the monthly payroll.
3. **App Inventory / Asset (`Assets`).** Manages the issuance of machinery and technical equipment to personnel.

Each reuses core services (identity, authorization, the shared code registry) and depends on other apps' data rather than reimplementing it.

---

## 13. Glossary of Codes

**Ticket state codes:** `REQ` (Requested), `ACT` (Active), `PEN` (Pending), `APP` (Approved), `REJ` (Rejected), `CAN` (Cancelled), `OVERDUE` (Overdue / Expired).

**Leave codes:** `AL` (Annual Leave), `UAL` (Unapproved / Unpaid Annual Leave), `SL` (Sick Leave), `USL` (Unexcused / Unpaid Sick Leave), `PL` (Personal Leave), `ML` (Medical / Maternity Leave), `CL` (Compassionate Leave), `EL` (Emergency Leave), `LWP` (Leave Without Pay), `TOIL` (Time Off In Lieu), `VTO` (Voluntary Time Off).

Full definitions and rules are in §7.2 and §7.3.

---

## Traceability

Each architecture section derives from the following section(s) of `SYSTEM_PROCESS_FLOW-en.md`:

| This document | `SYSTEM_PROCESS_FLOW-en.md` source |
| --- | --- |
| 1. Purpose & Scope | Document scope (intro paragraph) |
| 2. System Overview & Context | Intro paragraph; `CUSTOM APPLICATION MODULES` overview |
| 3. Architectural Principles | `CORE BASE MODULE` diagram; Standard Code Tables; RBAC & UI Rendering; App 3 scoring algorithm; per-app role-based display |
| 4. Logical Architecture | `CORE BASE MODULE` diagram |
| 5. Layered View | Synthesized from the core diagram, RBAC & UI Rendering, and the four app sections |
| 6. Module Catalog | App 1 (Jobs & Projects), App 2 (Planning & Attendance), App 3 (Performance & Audit), App 4 (Settings & IAM) |
| 7. Shared Domain Model | Ticket State Codes & Color Codes; Leave State Codes; App 1 state-transition flow |
| 8. Authorization Architecture | RBAC & UI Rendering Mechanism; Detailed Access Control Matrix |
| 9. Core Engines & Services | `CORE BASE MODULE` contents; App 3 quantitative scoring algorithm; App 1 auto-forking; per-app Print/Export Engine |
| 10. Cross-Cutting Concerns | App 4 system audit logs; App 4 webhook settings; per-app Print/Export Engine; App 1 time/progress classification; App 2 leave workflow |
| 11. Integration Points | App 4 Telegram Webhook Settings; `CORE BASE MODULE` notification engine |
| 12. Extensibility & Future Modules | Future Module Expansion |
| 13. Glossary of Codes | Ticket State Codes & Color Codes; Leave State Codes |
