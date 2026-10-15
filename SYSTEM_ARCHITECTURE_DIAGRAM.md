# SYSTEM_ARCHITECTURE_DIAGRAM.md

> Visual companion to [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md). Every diagram below is **Mermaid** (renders in Markdown viewers such as GitHub) and is derived from two documents: [`SYSTEM_ARCHITECTURE.md`](./SYSTEM_ARCHITECTURE.md) for **structure** (modules, layers, engines, authorization, extension model) and [`SYSTEM_PROCESS_FLOW-en.md`](./SYSTEM_PROCESS_FLOW-en.md) for **behavior** (state transitions, per-app flows, role-based screens).
>
> **How to read these diagrams.** Each view has a title, a one-line caption, the Mermaid block, and a `*Source:*` line pointing at the source section(s) it visualizes. The diagrams are a visual summary only — the source documents are authoritative for detail. The diagrams are deliberately technology-neutral (no frameworks, hosting, or infrastructure).

**Diagram index**

1. [System & Module Map](#1-system--module-map)
2. [Layered View](#2-layered-view)
3. [Core Engines & Services](#3-core-engines--services)
4. [Ticket State Machine](#4-ticket-state-machine)
5. [End-to-End Task Lifecycle](#5-end-to-end-task-lifecycle)
6. [Leave-Request Workflow](#6-leave-request-workflow)
7. [Authorization / RBAC Decision Flow](#7-authorization--rbac-decision-flow)
8. [KPI & Audit Data Flow](#8-kpi--audit-data-flow)
9. [Audit Log Data Flow](#9-audit-log-data-flow)
10. [Extensibility Roadmap](#10-extensibility-roadmap)

---

## 1. System & Module Map

The Core Base Module provides shared platform services; the five apps plug into it.

```mermaid
flowchart TD
    subgraph CORE["Core Base Module (System)"]
        UD["User Directory"]
        RBAC["RBAC & Permission Matrix Engine"]
        TG["Telegram Webhook Notification Engine"]
        KPI["Deterministic Performance Calculation Engine (KPIs)"]
        SC["Global State Codes (REQ, ACT, PEN, APP, REJ, CAN, OVERDUE)"]
        LC["Global Leave Codes (AL, UAL, SL, USL, PL, ML, CL, EL, LWP, TOIL, VTO)"]
    end

    J["App 1: Jobs & Projects"]
    P["App 2: Planning & Attendance"]
    F["App 3: Performance & Audit"]
    S["App 4: Settings & IAM"]
    A["App 5: Audit Log"]

    CORE --> J
    CORE --> P
    CORE --> F
    CORE --> S
    CORE --> A
```

*Source:* `SYSTEM_ARCHITECTURE.md` §2 (System Overview & Context) and §4 (Logical Architecture); `SYSTEM_PROCESS_FLOW-en.md` — the `CORE BASE MODULE` diagram.

---

## 2. Layered View

The same system as stacked layers, from what the user sees down to what is stored.

```mermaid
flowchart TB
    subgraph L1["Presentation / UI rendering"]
        UI["Role-specific dashboard, tabs, columns, actions, print/export controls"]
    end

    subgraph L2["App / module layer"]
        APPS["Jobs | Planning | Performance | Settings | AuditLog"]
    end

    subgraph L3["Core-services layer"]
        CORE["Permission evaluation, notification, deterministic performance, shared code registries"]
    end

    subgraph L4["Data layer"]
        DATA["People & org units, projects & tickets, acceptance & requests, attendance & leave, performance summaries, audit logs"]
    end

    UI --> APPS
    APPS --> CORE
    CORE --> DATA
```

*Source:* `SYSTEM_ARCHITECTURE.md` §5 (Layered View), synthesized from §4 and the four app sections.

---

## 3. Core Engines & Services

The six shared services of the Core Base Module and the apps that consume them.

```mermaid
flowchart LR
    subgraph CORE["Core Base Module - Engines & Services"]
        E1["RBAC & Permission Matrix Engine"]
        E2["Telegram Webhook Notification Engine"]
        E3["Deterministic Performance Calculation Engine (KPI)"]
        E4["Auto-forking Engine"]
        E5["Print/Export Engine"]
        E6["Global State & Leave Code Registry"]
    end

    J["Jobs"]
    P["Planning"]
    F["Performance"]
    S["Settings"]
    A["Audit Log"]

    E1 --> J
    E1 --> P
    E1 --> F
    E1 --> S
    E1 --> A

    E2 --> J
    E2 --> P

    E3 --> F

    E4 --> J

    E5 --> J
    E5 --> P
    E5 --> F
    E5 --> A

    E6 --> J
    E6 --> P
    E6 --> F

    S --> E2
```

*Source:* `SYSTEM_ARCHITECTURE.md` §9 (Core Engines & Services) and §4 (core contents); `SYSTEM_PROCESS_FLOW-en.md` — `CORE BASE MODULE` contents and per-app Print/Export Engine.

---

## 4. Ticket State Machine

The ticket lifecycle: `REQ → ACT → PEN → {APP | REJ}`, plus cancellation and overdue.

```mermaid
stateDiagram-v2
    state "REQ - Requested (White)" as REQ
    state "ACT - Active (Yellow)" as ACT
    state "PEN - Pending (Blue)" as PEN
    state "APP - Approved (Green)" as APP
    state "REJ - Rejected (Orange)" as REJ
    state "CAN - Cancelled (Red)" as CAN
    state "OVERDUE - Overdue (Red Warning)" as OVERDUE

    [*] --> REQ
    REQ --> ACT : Accept Task
    ACT --> PEN : Submit Report
    PEN --> APP : Approve
    PEN --> REJ : Return
    REJ --> ACT : Rework
    ACT --> CAN : Cancel
    PEN --> CAN : Cancel
    ACT --> OVERDUE : Deadline passed
    PEN --> OVERDUE : Deadline passed
    APP --> [*]
    CAN --> [*]

    classDef white fill:#FFFFFF,stroke:#333333,color:#000000
    classDef yellow fill:#FFE08A,stroke:#333333,color:#000000
    classDef blue fill:#8AB8FF,stroke:#333333,color:#000000
    classDef green fill:#8AE08A,stroke:#333333,color:#000000
    classDef orange fill:#FFB870,stroke:#333333,color:#000000
    classDef red fill:#FF8A8A,stroke:#333333,color:#000000
    classDef redWarning fill:#FF5A5A,stroke:#333333,color:#000000

    class REQ white
    class ACT yellow
    class PEN blue
    class APP green
    class REJ orange
    class CAN red
    class OVERDUE redWarning
```

*Source:* `SYSTEM_ARCHITECTURE.md` §7.1–§7.2 (Shared Domain Model); `SYSTEM_PROCESS_FLOW-en.md` — Ticket State Codes & Color Codes and the App 1 state-transition flow.

---

## 5. End-to-End Task Lifecycle

Assignment through acceptance, including the extension-request and late-submission paths.

```mermaid
sequenceDiagram
    actor E as Employee
    actor MH as Manager / HR
    participant SYS as Jobs App & Core

    MH->>SYS: Create / allocate ticket (REQ)
    SYS->>E: Assigned ticket (REQ)
    Note over E,SYS: Daily quick-add / confirm before 08:30
    E->>SYS: Accept task (ACT)
    E->>SYS: Submit progress / report (PEN)
    Note over E,SYS: Multi-day milestones 25% / 50% / 75% / 100%

    alt Approve
        MH->>SYS: Approve result (APP, bonus KPI)
    else Return
        MH->>SYS: Return for revision (REJ, penalty KPI)
        E->>SYS: Rework (ACT)
    end

    opt Before deadline
        E->>MH: Extension request (new deadline + reason + evidence)
        MH->>SYS: Approve or reject extension
    end

    opt Past deadline
        E->>SYS: Report late submission / explanation (PEN, tagged late)
    end
```

*Source:* `SYSTEM_ARCHITECTURE.md` §6.1 (Jobs) and §10 (timekeeping constraints); `SYSTEM_PROCESS_FLOW-en.md` — App 1 (Jobs & Projects) operational flow.

---

## 6. Leave-Request Workflow

Submitting, reviewing, and resolving a leave request, including the penalty path.

```mermaid
sequenceDiagram
    actor E as Employee
    actor MH as HR / Manager
    participant SYS as Planning App & Core

    E->>SYS: Submit leave request (AL, SL, PL, ML, CL, EL, LWP, TOIL, VTO)
    Note over E,SYS: Attachment + handover personnel
    SYS->>MH: Leave request in review

    alt Approved
        MH->>SYS: Approve
        SYS->>E: Official leave badge (AL, SL, PL, ...)
    else Rejected / unauthorized absence
        MH->>SYS: Reject or mark unauthorized
        SYS->>E: Penalty leave code (UAL or USL)
    end
```

*Source:* `SYSTEM_ARCHITECTURE.md` §6.2 (Planning) and §10 (attendance rules); `SYSTEM_PROCESS_FLOW-en.md` — App 2 (Planning & Attendance) leave management workflow.

---

## 7. Authorization / RBAC Decision Flow

The two-layer guard: which apps a role may open, then which views and actions render.

```mermaid
flowchart TD
    ROLE["Role"] --> L1{"Layer 1 - App-level access guard: which apps can this role open?"}
    L1 --> APPS["Render app icons on the home dashboard"]
    L1 --> AUDIT["App 5: Audit Log - granted to Super Admin and Manager / Tech Lead only"]
    APPS --> L2{"Layer 2 - View / action-level access guard: which tabs, columns, buttons, and exports render?"}
    L2 --> VIEW["Render the role-specific interface"]

    subgraph ROLES["Roles"]
        R1["Super Admin"]
        R2["Manager / Tech Lead"]
        R3["HR Manager"]
        R4["Department Head"]
        R5["Employee"]
    end

    subgraph SCOPE["Scope vocabulary"]
        S1["(All)"]
        S2["(Company-wide)"]
        S3["(Department-only)"]
        S4["Personal views"]
    end

    ROLES --> L1
    SCOPE --> L2
```

*Source:* `SYSTEM_ARCHITECTURE.md` §3 (Architectural Principles) and §8 (Authorization Architecture); `SYSTEM_PROCESS_FLOW-en.md` — RBAC & UI Rendering Mechanism and the Detailed Access Control Matrix.

---

## 8. KPI & Audit Data Flow

How task, attendance, and leave signals feed the deterministic KPI engine and the audit levels.

```mermaid
flowchart LR
    T["Task signals: on-time (APP), overdue (OVERDUE), returned (REJ), extension requests"]
    A["Attendance signals: late arrival, early leave, excellent attendance"]
    LV["Leave signals: unapproved leave (UAL / USL)"]

    KPI["Deterministic Performance Calculation Engine"]
    SCORE["Total Performance Score = Bonus (+) - Penalty (-)"]

    BONUS["Bonus: +10 on-time, +20 on-time urgent, +5 first-time approval, +50 excellent attendance"]
    PEN["Penalty: -15 overdue, -5 returned, -2 extension request, -10 late / early / UAL / USL"]

    T --> KPI
    A --> KPI
    LV --> KPI
    BONUS --> KPI
    PEN --> KPI
    KPI --> SCORE

    SCORE --> L1["Audit Level 1 - General / company-wide (HR / Admin)"]
    SCORE --> L2["Audit Level 2 - Department level"]
    SCORE --> L3["Audit Level 3 - Employee level (Department Head)"]
    SCORE --> PD["Personal KPI dashboard"]
```

*Source:* `SYSTEM_ARCHITECTURE.md` §6.3 (Performance) and §9.3 (Deterministic Performance Calculation Engine); `SYSTEM_PROCESS_FLOW-en.md` — App 3 (Performance & Audit) scoring algorithm and audit tables.

---

## 9. Audit Log Data Flow

How every app module's state-changing and administrative actions feed the shared, module-attributed audit store that the Audit Log app inspects.

```mermaid
flowchart LR
    subgraph MODS["App modules (event sources)"]
        J["Jobs"]
        P["Planning"]
        F["Performance"]
        S["Settings"]
        AL["Audit Log"]
    end

    EV["Audit events - append-only: user, action, resource, field changes, timestamp, IP address"]
    STORE[("Audit event store - module-attributed")]

    J -->|state changes| EV
    P -->|state changes| EV
    F -->|state changes| EV
    S -->|admin / config changes| EV
    AL -->|inspection actions| EV
    EV --> STORE

    STORE --> GATE["Layer 1 gate - Super Admin & Manager / Tech Lead only"]
    GATE --> STREAM["System-wide activity stream"]
    GATE --> AGG["Per-module activity - jobs, planning, performance, settings, audit-log"]
    GATE --> EXP["Filtered export (.xlsx / .csv)"]
```

*Source:* `SYSTEM_ARCHITECTURE.md` §6.5 (Audit Log), §2 and §10 (auditability); `SYSTEM_PROCESS_FLOW-en.md` — App 5 (Audit Log).

---

## 10. Extensibility Roadmap

Planned apps (dashed) plug into the existing core and reuse other apps' data.

```mermaid
flowchart TD
    subgraph CORE["Core Base Module (shared services)"]
        CS["Identity, authorization, notification, KPI, shared code registry"]
    end

    J["Jobs"]
    P["Planning"]
    F["Performance"]
    S["Settings"]
    A["Audit Log"]

    CORE --> J
    CORE --> P
    CORE --> F
    CORE --> S
    CORE --> A

    REC["Recruitment (planned)"]
    PAY["Payroll (planned)"]
    AST["Assets (planned)"]

    CORE -.-> REC
    CORE -.-> PAY
    CORE -.-> AST

    REC -.->|creates account on hire| S
    PAY -.->|reads attendance| P
    PAY -.->|reads KPI points| F
    AST -.->|equipment issuance to personnel| CORE

    classDef planned fill:#EEEEEE,stroke:#999999,stroke-dasharray: 5 5,color:#666666
    class REC,PAY,AST planned
```

*Source:* `SYSTEM_ARCHITECTURE.md` §12 (Extensibility & Future Modules); `SYSTEM_PROCESS_FLOW-en.md` — Future Module Expansion.

---

*Dashed nodes in Diagram 10 denote planned (not yet present) modules. All other diagrams depict the current architecture.*
