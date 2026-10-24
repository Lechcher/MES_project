This document is structured entirely around a **Modular App-Based Engine (Odoo-like architecture)**, with a built-in **Two-Layer Authorization mechanism (App-Level & View/Action-Level)** that decides exactly which interface is displayed to each Role (Employee, Department Head, HR, Manager/Admin).

---

# UNIFIED MODULAR SYSTEM DOCUMENT (ODOO-LIKE ARCHITECTURE)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        CORE BASE MODULE (System)                       │
│  - User Directory, RBAC & Permission Matrix Engine                     │
│  - Telegram Webhook Notification Engine                                 │
│  - Deterministic Performance Calculation Engine (KPIs)                 │
│  - Global State Codes (REQ, ACT, PEN, APP, REJ, CAN, OVERDUE)          │
│  - Global Leave Codes (AL, UAL, SL, USL, PL, ML, CL, EL, LWP, TOIL, VTO)│
└───────────┬───────────────────┬───────────────────┬────────────────────┘
            │                   │                   │
    ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐
    │  App 1: Jobs  │   │App 2: Planning│   │App 3: Perform │   │App 4: Settings│   │ App 5: Audit  │
    │  & Projects   │   │  & Attendance │   │  & KPI Audit  │   │    & IAM      │   │      Log      │
    └───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘   └───────────────┘

```

---

## 📋 STANDARD CODE TABLES SHARED ACROSS THE SYSTEM

### 1. Ticket State Codes & Color Codes

| State Code | State Name | Identifying Color Code | State Condition & Trigger |
| --- | --- | --- | --- |
| **REQ** | **Requested** *(Assignment / Not yet confirmed)* | ⚪ **White** | Newly allocated ticket, or the employee has not confirmed / has not planned before 08:30. |
| **ACT** | **Active** *(In progress / Being worked on)* | 🟡 **Yellow** | The employee has accepted the task and is working on it.<br>

<br>• *Secondary badges:* `ACT - Urgent Processing` | `ACT - Progress Update (X%)` | `ACT - Awaiting Extension Approval` | `ACT - Awaiting Progress Verification`. |
| **PEN** | **Pending** *(Awaiting review / Awaiting acceptance)* | 🔵 **Blue** | The "Complete" button is pressed, or a multi-day task reaches 100% progress + acceptance files & report are submitted. |
| **APP** | **Approved** *(Completed / Approved)* | 🟢 **Green** | The Manager/HR has approved the result report / successfully accepted the progress. |
| **REJ** | **Rejected** *(Needs revision / Returned)* | 🟠 **Orange** | The report is rejected by the Manager/HR, or the progress % is returned (requiring edits/redo). |
| **CAN** | **Cancelled** *(Cancelled)* | 🔴 **Red** | The ticket is cancelled by the Employee or Manager (a reason is mandatory). |
| **OVERDUE** | **Overdue / Expired** *(Past due / Expired)* | 🔴 **Red (Warning)** | Past the hourly deadline for an urgent task, past 00:00 of the next day for a daily task, or past the 00:00 immediately after `End_Date` while progress is $< 100\%$. |

---

### 2. Leave / Time-Off State Codes (Leave State Codes)

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

## 🔐 AUTHORIZATION & UI RENDERING MECHANISM (RBAC & UI RENDERING)

The system manages access rights through **2 Layers of Control**:

1. **Layer 1 — App-Level Access Guard:** Determines which App icons appear on the Home Page Dashboard upon login.


2. **Layer 2 — View & Action-Level Access Guard:** Determines which tabs, data columns, action buttons, and Print/Export report buttons are rendered inside each App.

### Detailed Access Control Matrix (Permission Matrix Engine)

| Function & Action Permission | Super Admin | Manager / Tech Lead | HR Manager | Department Head | Employee |
| --- | --- | --- | --- | --- | --- |
| **App Jobs & Projects (`Jobs`)**<br> | ✅ (All) | ✅ (All) | ✅ (Company-wide) | ✅ (Department-only) | ✅ (Personal detail) |
| • *Create / Allocate Ticket (⚪ REQ)* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Accept Task (🟡 ACT) & Report (🔵 PEN)* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *Approve Acceptance (🟢 APP) / Return (🟠 REJ)* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Request Extension / Explain Late Submission* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *Print Ticket Slip / Export Task Excel* | ✅ | ✅ | ✅ | ✅ | ✅ (Personal tasks only) |
| **App Planning & Attendance (`Planning`)**<br> | ✅ (All) | ✅ (All) | ✅ (Company-wide) | ✅ (Department-only) | ✅ (Personal detail) |
| • *View Attendance Matrix Calendar (Monthly View)* | Company-wide | Company-wide | Company-wide | Department-only | Personal calendar |
| • *Approve Leave Requests / Approve Work* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *Assign Unapproved-Leave Code (🔴 UAL, USL)* | ✅ | ❌ | ✅ | ❌ | ❌ |
| • *Register Leave (AL, SL, PL,...)* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *Print Leave Request / Export Attendance Excel* | ✅ | ✅ | ✅ | ✅ (Department only) | ✅ (Personal request only) |
| **App Performance & Audit (`Performance`)**<br> | ✅ (All) | ✅ (All) | ✅ (Company-wide) | ✅ (Department-only) | ✅ (Personal KPI) |
| • *View Personal KPI Dashboard* | ✅ | ✅ | ✅ | ✅ | ✅ |
| • *View Audit Table Level 3 (Employees in Department)* | ✅ | ✅ | ✅ | ✅ | ❌ |
| • *View Audit Table Level 1 & 2 (Company-wide & Department)* | ✅ | ✅ | ✅ | ❌ | ❌ |
| • *Print / Export Multi-sheets Audit Excel Workbook* | ✅ | ✅ | ✅ | ✅ (Department only) | ✅ (Personal report only) |
| **App Settings & IAM (`Settings`)**<br> | ✅ (Hidden from Employees) | ✅ (Hidden from Employees) | 🟡 (View Users only) | ❌ (Fully hidden) | ❌ (Fully hidden) |
| • *Manage Accounts (Create/Edit/Reset/Lock)* | ✅ | ❌ | ✅ | ❌ | ❌ |
| • *Manage RBAC Authorization & Webhook* | ✅ | ✅ | ❌ | ❌ | ❌ |
| **App Audit Log (`AuditLog`)**<br> | ✅ (All) | ✅ (All) | ❌ (Fully hidden) | ❌ (Fully hidden) | ❌ (Fully hidden) |
| • *View System-Wide Activity Stream* | ✅ | ✅ | ❌ | ❌ | ❌ |
| • *View Per-Module Activity (each App module)* | ✅ | ✅ | ❌ | ❌ | ❌ |
| • *Filter / Export Audit Events* | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 🔁 SHARED FLOWS (ALL ROLES)

### Self-Service Password Reset

1. On the sign-in screen, the user chooses **Forgot password** and enters their email.
2. The system always shows the same confirmation, whether or not the address has an account (account existence is never disclosed).
3. If the account exists, a reset email is sent with a link to the **Reset Password** page carrying a one-time token. If the email cannot be delivered, or no mail server is configured, the user sees an error instead of the confirmation.
4. On the **Reset Password** page (reachable without signing in), the user enters a new password that follows the same policy as an administrator reset. An invalid or expired link is reported as such, with a way to request a new one. The new password is never stored in the browser.

### Live Updates

* Every App screen refreshes in place when another user changes the data it shows (for example, an approved `PEN` ticket turns `APP` on everyone's list) — no manual reload, and filters, selected day, and scroll position are kept.
* A refresh never shows more than the viewer's role may already see.
* A status indicator shows whether live updates are connected. While disconnected, the last data stays visible and the manual **Refresh** action still works; on reconnect, open screens refresh automatically.

---

## 📱 CUSTOM APPLICATION MODULES (CUSTOM APPS)

### 📱 APP 1: JOBS & PROJECTS (`Jobs`)



> **Purpose:** The system's main operational and Ticket-handling module.

#### 1. Functions & Operational Flow:

* **Project Tracking:** Every ticket created must be attached to a specific **Project/Campaign** (or the default group *General Operations*).
* **Time & Progress Classification:**
* **Hourly Task:** Deadline follows the urgent time slots (*10:30, 14:00, 16:30*).
* **Daily Task:** Default deadline 17:00/18:00 the same day.
* **Multi-day Task:** Tracked by accumulated Progress % ($0\% \rightarrow 100\%$) with the standard milestones: $25\%$ (Outline/Wireframe) $\rightarrow$ $50\%$ (Draft/Rough) $\rightarrow$ $75\%$ (Testing/Review) $\rightarrow$ $100\%$ (Acceptance).


* **State Transition Flow:**

$$\text{REQ (Requested)} \xrightarrow{\text{Accept Task}} \text{ACT (Active)} \xrightarrow{\text{Submit Report}} \text{PEN (Pending)} \begin{cases} \xrightarrow{\text{Approve}} \text{APP (Approved)} \\ \xrightarrow{\text{Return}} \text{REJ (Rejected)} \end{cases}$$



*(Cancel task: any time $\rightarrow$ **CAN (Cancelled)**)*
* **Extension Request Process (`ACT - Awaiting Extension Approval`):** Send the request before the deadline passes $\rightarrow$ Choose a new deadline + Reason + Evidence $\rightarrow$ Manager Approves (updates the new deadline) or Rejects (keeps the old deadline).
* **Late Submission Handling Process (`OVERDUE`):** Passing the deadline automatically moves it to 🔴 **OVERDUE** $\rightarrow$ the Complete button is locked $\rightarrow$ the **`Report Late Submission / Explanation`** button must be pressed $\rightarrow$ 🔵 **PEN** (tagged with the *Late Submission* warning).

#### 2. Functional Screens & Role-Based Display:

* **1-Click Day Navigation Bar (Header Bar):** `[ Yesterday ]` \ `[ Today ]` \ `[ Tomorrow ]`.
* **Daily Quick-add:** The screen for planning/confirming the day's tasks first thing (before 08:30).
* **Employee Interface:** Shows only the tickets assigned to the individual; hides the button to create new tickets allocated to others.
* **Manager / HR Interface:** Sees the `+ Create New Ticket` button (supporting the **Auto-forking Engine** that automatically replicates to accounts within the Department), sees all tickets of the Department/Company, and shows the `Cancel Ticket (CAN)` button.

#### 3. Print & Export Functions (Print/Export Engine):

* **[🖨️ Print]:** Print the Assignment Slip / Ticket Acceptance Slip as standard PDF (with the time log and comments).
* **[📥 Export]:** Export the list of project tasks to an Excel (`.xlsx`) or CSV (`.csv`) file according to the filters.

---

### 📱 APP 2: PLANNING & ATTENDANCE (`Planning`)



> **Purpose:** The module for managing the matrix work calendar, Attendance, acceptance-report approval, and Leave registration.

#### 1. Functions & Operational Flow:

* **Department Matrix Grid:** A matrix calendar with employees as rows (grouped by Department/Division) and days/hours as columns. Tickets are displayed as Gantt-like bars containing the actual progress % and the State Code (**REQ, ACT, PEN, APP, REJ, CAN, OVERDUE**).
* **Approval Board (For HR/Manager):**
* Work approval queue: Review reports in 🔵 **PEN** status $\rightarrow$ Approve 🟢 **APP** (+ KPI points) or Return 🟠 **REJ** (- KPI points).
* Queue for approving extensions and late-submission reports.


* **Leave Management Workflow:**
* The employee submits a request selecting a Leave Code (**AL, SL, PL, ML, CL, EL, LWP, TOIL, VTO**) + Attachment + Handover personnel.
* HR/Manager Approves $\rightarrow$ the day cell displays the official Badge (**AL, SL, PL,...**).
* HR/Manager Rejects / Unauthorized absence $\rightarrow$ the day cell is tagged **UAL** or **USL** $\rightarrow$ Deduct 100% of the daily wage + Deduct 10-20 attendance KPI points.



#### 2. Functional Screens & Role-Based Display:

* **Employee Interface:** Sees only their personal calendar + their own attendance/leave badges; the `Create Leave Request` button; the *Approval Board* tab is hidden.
* **Department Head Interface:** Sees the department-wide matrix calendar; the *Department Work Approval* and *Department Leave Request Approval* tabs appear.
* **HR / Super Admin Interface:** Sees the company-wide matrix calendar (with a department filter); the *System-wide Approval Board* tab and the function to assign penalty leave codes (🔴 **UAL, USL**) appear.

#### 3. Print & Export Functions (Print/Export Engine):

* **[🖨️ Print]:** Print the Leave Request in standard A4 form (with an electronic signature); print the department's monthly attendance calendar (A4 Landscape).
* **[📥 Export]:** Export the Attendance Summary & Remaining Leave Fund table (`AL Balance`, `TOIL Balance`) to an Excel file (`.xlsx`).

---

### 📱 APP 3: PERFORMANCE & AUDIT (`Performance / Users`)



> **Purpose:** The center that measures and computes performance scores 100% automatically using a Deterministic Engine algorithm based on a fixed rule set.

#### 1. Quantitative Performance Scoring Algorithm:

$$\text{Total Performance Score} = \text{Total Bonus Points (+)} - \text{Total Penalty Points (-)}$$

* **Bonus points (+):** `+10 points`/on-time ticket (**APP**) | `+20 points`/on-time urgent ticket (**APP**) | `+5 points`/instance approved immediately without edits | `+50 points`/month of excellent attendance.
* **Penalty points (-):** `-15 points`/overdue ticket (🔴 **OVERDUE**) | `-5 points`/instance returned (🟠 **REJ**) | `-2 points`/extension request | `-10 points`/instance of arriving late, leaving early, or unapproved leave (**UAL/USL**).

#### 2. Three-Level Audit Table System (Multi-level Audit Tables):

* **TABLE 1: PERFORMANCE TABLE FOR ALL EMPLOYEES (GENERAL LEVEL)**
*(Shown to HR / Admin — sorted by TOTAL PERFORMANCE SCORE in descending order from highest to lowest).*

| No. | Employee ID | Employee Name | Department / Division | Total Tasks | On-Time (APP) | Overdue (OVERDUE) | Annual Leave (AL) | Sick Leave (SL) | Unapproved Leave (UAL/USL) | Excellent Attendance (+50) | Unapproved-Leave Deduction (-10/occurrence) | Attendance Rate (%) | TOTAL PERFORMANCE SCORE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | NV001 | Nguyen Van A | Production Department | 25 | 22 | 0 | 1 | 0 | 0 | +50 | 0 | 100% | **425** |
| 2 | NV012 | Le Thi H | Engineering Department | 22 | 18 | 0 | 2 | 1 | 0 | +50 | 0 | 100% | **400** |
| 3 | NV008 | Hoang Van K | QC Department | 20 | 16 | 0 | 0 | 0 | 0 | +50 | 0 | 100% | **388** |
| 4 | NV002 | Tran Thi B | Production Department | 20 | 18 | 1 | 1 | 0 | 1 (UAL) | 0 | -10 | 92% | **270** |
| 5 | NV015 | Do Minh T | Engineering Department | 19 | 15 | 1 | 0 | 2 (SL) | 0 | 0 | 0 | 98% | **241** |
| 6 | NV003 | Pham Van D | Production Department | 18 | 12 | 3 | 0 | 0 | 2 (USL) | 0 | -20 | 80% | **85** |

* **TABLE 2: PERFORMANCE TABLE BY DEPARTMENT / DIVISION (DEPARTMENT LEVEL)**

| No. | Department Code | Department / Division Name | Department Head | Total Employees | Total Tasks Assigned | Avg. Progress Rate (%) | On-Time Completion Rate (%) | Avg. Attendance Score | Avg. Department Performance Score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | B-SX | Production Department | Nguyen Van C | 15 | 320 | 94.5% | 96.0% | 95/100 | **245.5** |
| 2 | B-KT | Engineering Department | Tran Van D | 8 | 180 | 91.0% | 92.5% | 98/100 | **210.0** |
| 3 | B-QC | Quality Control (QC) Department | Le Thi E | 6 | 140 | 88.0% | 89.0% | 92/100 | **185.0** |

* **TABLE 3: PERFORMANCE TABLE FOR EACH EMPLOYEE IN THE DEPARTMENT (EMPLOYEE LEVEL)**
*(Shown to the Department Head to monitor the department's internal performance).*

| No. | Employee ID | Employee Name | Total Tasks | On-Time (APP) | Overdue (OVERDUE) | Annual Leave (AL) | Unapproved Leave (UAL/USL) | Immediate Approval (+5) | Excellent Attendance (+50) | Returned (-5) | Attendance Rate (%) | TOTAL PERFORMANCE SCORE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | NV001 | Nguyen Van A | 25 | 22 | 0 | 1 | 0 | 20 | +50 | 1 | 100% | **425** |
| 2 | NV002 | Tran Thi B | 20 | 18 | 1 | 1 | 1 (UAL) | 15 | 0 | 2 | 92% | **270** |
| 3 | NV003 | Pham Van D | 18 | 12 | 3 | 0 | 2 (USL) | 8 | 0 | 4 | 80% | **85** |

#### 3. Functional Screens & Role-Based Display:

* **Employee Interface:** Shows only the **Personal KPI Dashboard** (score card, personal Donut Chart, their own **AL/TOIL Balance** leave fund). All Audit Level 1 & 2 tables are hidden.
* **Department Head Interface:** Shows the personal KPI dashboard + the **Level 3 Table (Employee Level)** of their own department.
* **HR / Admin Interface:** Shows the full **Three-Level Audit Tables** and the company-wide ranking column chart.

#### 4. Print & Export Functions (Print/Export Engine):

* **[🖨️ Print]:** Print the Personal KPI Evaluation Report in standard A4.
* **[📥 Export]:** Export an Excel file (`.xlsx`) containing all 3 Sheets of the Audit tables (General, Department, Employee) and export the performance ranking column chart.

---

### 📱 APP 4: SETTINGS & IAM (`Settings`)



> **Purpose:** The system administration center for RBAC authorization, organization management, and Webhook connection configuration.

#### 1. Core Administration Functions:

* **User Directory:** Manage accounts (View, Create, Edit, Reset Password, Soft Delete).
* **Org Structure Management:** Manage Departments/Divisions, configure the **Auto-forking Engine** mechanism.
* **System Audit Logs:** Record the entire history of technical interventions (User, Action, Field Changes, Timestamp, IP Address).
* **Telegram Webhook Settings:** Configure the Telegram Bot, alert group Chat ID, and Webhook URL endpoints.

#### 2. Functional Screens & Role-Based Display:

* **Employee & Department Head:** The App icon is fully hidden on the Home Page Dashboard.


* **HR Manager:** Sees the *User Directory* menu for personnel management; the RBAC and Webhook menus are hidden.
* **Technical Lead / Super Admin:** Shows 100% of all the technical configuration menus.

---

### 📱 APP 5: AUDIT LOG (`AuditLog`)



> **Purpose:** The technical activity-monitoring center for inspecting system-wide and per-module activity recorded by the audit log.

#### 1. Core Functions:

* **System-Wide Activity Stream:** View every recorded audit event across all App modules (User, Action, Resource, Field Changes, Timestamp, IP Address), newest first.
* **Per-Module Activity:** Inspect activity for a single App module (`jobs`, `planning`, `performance`, `settings`, `audit-log`), including an activity summary for that module (event count and most recent activity for the chosen period).
* **Filtering:** Filter the activity stream by module, user, action, resource type, resource id, and date range.
* **Export:** Export the currently filtered audit events to an Excel (`.xlsx`) or `.csv` file.
* **Read-only / Append-only:** Audit events are append-only; the App offers no action to edit or delete a recorded event. The same event store also backs the Settings audit trail.

#### 2. Functional Screens & Role-Based Display:

* **Employee, Department Head & HR Manager:** The App icon is fully hidden on the Home Page Dashboard.
* **Technical Lead / Super Admin:** Full access to the system-wide stream, per-module activity, filters, and export.

---

## 🚀 FUTURE MODULE EXPANSION (FUTURE EXPANSION)

Thanks to the Odoo-like core modular design, as the system expands, new Apps will be embedded directly into the Home Page Dashboard:

1. **App Recruitment (`Recruitment`):** Manage the recruitment process, automatically creating an account in the `Settings` App when a candidate is hired.


2. **App Payroll (`Payroll`):** Read attendance data from the `Planning` App + KPI points from the `Performance` App to automatically compute and export the monthly payroll.


3. **App Inventory / Asset (`Assets`):** Manage the issuance of machinery and technical equipment to personnel.