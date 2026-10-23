/**
 * Documented code registries.
 *
 * These constants are the code registries seeded from
 * `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` §14 and mirrored in
 * `API_CONTACT_SPECIFICATION.md` §5.2. They are stable enum metadata used for
 * badge labels and colors — not fixture data — and never substitute for API
 * reads of domain records.
 *
 * Colors map to the DESIGN.md palette: White → hairline outline,
 * Yellow → warning `#f1c21b`, Blue → primary `#0f62fe`, Green → success
 * `#24a148`, Orange → `#ee5c25`, Red → error `#da1e28`.
 */

import type {
  ApprovalStatus,
  CompletionScope,
  DepartmentType,
  ExportFormat,
  LeaveCode,
  Priority,
  RoleCode,
  TaskRequestType,
  TaskStateBadge,
  TaskType,
  TicketStateCode,
} from "./types";

/* ─────────────────────────── Ticket states ──────────────────────── */

export interface TicketStateMeta {
  code: TicketStateCode;
  name: string;
  colorLabel: string;
  hex: string;
  isTerminal: boolean;
}

export const TICKET_STATES: TicketStateMeta[] = [
  {
    code: "REQ",
    name: "Requested",
    colorLabel: "White",
    hex: "#161616",
    isTerminal: false,
  },
  {
    code: "ACT",
    name: "Active",
    colorLabel: "Yellow",
    hex: "#f1c21b",
    isTerminal: false,
  },
  {
    code: "PEN",
    name: "Pending",
    colorLabel: "Blue",
    hex: "#0f62fe",
    isTerminal: false,
  },
  {
    code: "APP",
    name: "Approved",
    colorLabel: "Green",
    hex: "#24a148",
    isTerminal: true,
  },
  {
    code: "REJ",
    name: "Rejected",
    colorLabel: "Orange",
    hex: "#ee5c25",
    isTerminal: false,
  },
  {
    code: "CAN",
    name: "Cancelled",
    colorLabel: "Red",
    hex: "#da1e28",
    isTerminal: true,
  },
  {
    code: "OVERDUE",
    name: "Overdue",
    colorLabel: "Red (Warning)",
    hex: "#da1e28",
    isTerminal: false,
  },
];

export const TICKET_STATE_BY_CODE: Record<TicketStateCode, TicketStateMeta> =
  Object.fromEntries(
    TICKET_STATES.map((state) => [state.code, state]),
  ) as Record<TicketStateCode, TicketStateMeta>;

export const TICKET_STATE_CODES: TicketStateCode[] = TICKET_STATES.map(
  (state) => state.code,
);

/* ──────────────────────── Task state badges ─────────────────────── */

export const TASK_STATE_BADGE_LABELS: Record<TaskStateBadge, string> = {
  URGENT_PROCESSING: "Active — Urgent Processing",
  PROGRESS_UPDATE: "Active — Progress Update",
  AWAITING_EXTENSION_APPROVAL: "Active — Awaiting Extension Approval",
  AWAITING_PROGRESS_VERIFICATION: "Active — Awaiting Progress Verification",
};

/** Render the `Active — Progress Update (X%)` label with the live percentage. */
export function taskStateBadgeLabel(
  badge: TaskStateBadge,
  progressPercentage?: number,
): string {
  if (badge === "PROGRESS_UPDATE" && typeof progressPercentage === "number") {
    return `Active — Progress Update (${progressPercentage}%)`;
  }
  return TASK_STATE_BADGE_LABELS[badge];
}

/** What a completion request asks the reviewer to accept. */
export const COMPLETION_SCOPE_LABELS: Record<CompletionScope, string> = {
  MILESTONE: "Stage of a multi-day job",
  FULL_JOB: "The whole job",
};

/** Documented `MULTI_DAY` milestone labels for 0% → 100% accumulation. */
export const MULTI_DAY_MILESTONES: { at: number; label: string }[] = [
  { at: 25, label: "Outline/Wireframe" },
  { at: 50, label: "Draft/Rough" },
  { at: 75, label: "Testing/Review" },
  { at: 100, label: "Acceptance" },
];

export function multiDayMilestone(progress: number): string | null {
  let label: string | null = null;
  for (const milestone of MULTI_DAY_MILESTONES) {
    if (progress >= milestone.at) label = milestone.label;
  }
  return label;
}

/* ─────────────────────────── Leave codes ────────────────────────── */

export interface LeaveCodeMeta {
  code: LeaveCode;
  name: string;
  hex: string;
  isPenalty: boolean;
  isBalanceTracked: boolean;
}

export const LEAVE_CODES: LeaveCodeMeta[] = [
  {
    code: "AL",
    name: "Annual Leave",
    hex: "#0f62fe",
    isPenalty: false,
    isBalanceTracked: true,
  },
  {
    code: "UAL",
    name: "Unapproved / Unpaid Annual Leave",
    hex: "#da1e28",
    isPenalty: true,
    isBalanceTracked: false,
  },
  {
    code: "SL",
    name: "Sick Leave",
    hex: "#0f62fe",
    isPenalty: false,
    isBalanceTracked: false,
  },
  {
    code: "USL",
    name: "Unexcused / Unpaid Sick Leave",
    hex: "#da1e28",
    isPenalty: true,
    isBalanceTracked: false,
  },
  {
    code: "PL",
    name: "Personal Leave",
    hex: "#24a148",
    isPenalty: false,
    isBalanceTracked: false,
  },
  {
    code: "ML",
    name: "Medical / Maternity Leave",
    hex: "#0f62fe",
    isPenalty: false,
    isBalanceTracked: false,
  },
  {
    code: "CL",
    name: "Compassionate Leave",
    hex: "#f1c21b",
    isPenalty: false,
    isBalanceTracked: false,
  },
  {
    code: "EL",
    name: "Emergency Leave",
    hex: "#f1c21b",
    isPenalty: false,
    isBalanceTracked: false,
  },
  {
    code: "LWP",
    name: "Leave Without Pay",
    hex: "#da1e28",
    isPenalty: false,
    isBalanceTracked: false,
  },
  {
    code: "TOIL",
    name: "Time Off In Lieu",
    hex: "#24a148",
    isPenalty: false,
    isBalanceTracked: true,
  },
  {
    code: "VTO",
    name: "Voluntary Time Off",
    hex: "#da1e28",
    isPenalty: false,
    isBalanceTracked: false,
  },
];

export const LEAVE_CODE_BY_CODE: Record<LeaveCode, LeaveCodeMeta> =
  Object.fromEntries(LEAVE_CODES.map((code) => [code.code, code])) as Record<
    LeaveCode,
    LeaveCodeMeta
  >;

/** Codes a user may register in the Create Leave Request form. */
export const LEAVE_REQUEST_CODES: LeaveCode[] = [
  "AL",
  "SL",
  "PL",
  "ML",
  "CL",
  "EL",
  "LWP",
  "TOIL",
  "VTO",
];

/** Penalty codes assignable only by `SUPER_ADMIN` and `HR_MANAGER`. */
export const PENALTY_LEAVE_CODES: LeaveCode[] = ["UAL", "USL"];

/* ───────────────────────── Display labels ───────────────────────── */

/**
 * English display labels for the enums without metadata registries.
 *
 * Code tokens remain the data and logic contract; these tables exist so no
 * screen renders a bare token. Values mirror the canonical lists in
 * `backend/src/db/enums.ts`, and a coverage test keeps them in step.
 */

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  HOURLY: "Hourly",
  DAILY: "Daily",
  MULTI_DAY: "Multi-day",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const TASK_REQUEST_TYPE_LABELS: Record<TaskRequestType, string> = {
  EXTENSION: "Extension Request",
  LATE_EXPLANATION: "Late Submission Explanation",
};

export const DEPARTMENT_TYPE_LABELS: Record<DepartmentType, string> = {
  DEPARTMENT: "Department",
  DIVISION: "Division",
};

/** `XLSX` is a file extension; the user-facing name for it is Excel. */
export const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  PDF: "PDF",
  XLSX: "Excel",
  CSV: "CSV",
};

export const ROLE_CODE_LABELS: Record<RoleCode, string> = {
  SUPER_ADMIN: "Super Admin",
  TECH_LEAD: "Tech Lead",
  HR_MANAGER: "HR Manager",
  DEPT_HEAD: "Department Head",
  EMPLOYEE: "Employee",
};

/** Module display names, aligned with `AUDIT_LOG_MODULES` in `./access`. */
export const MODULE_LABELS: Record<string, string> = {
  jobs: "Jobs & Projects",
  planning: "Planning & Attendance",
  performance: "Performance & Audit",
  settings: "Settings & IAM",
  "audit-log": "Audit Log",
};

/**
 * The label for a code in one of the tables above.
 *
 * Unknown values pass through unchanged — audit-stream prose and other
 * non-enum strings must not be mapped or blanked by mistake.
 */
export function labelFor(code: string, table: Record<string, string>): string {
  return table[code] ?? code;
}

export function priorityLabel(code: Priority): string {
  return labelFor(code, PRIORITY_LABELS);
}

export function taskTypeLabel(code: TaskType): string {
  return labelFor(code, TASK_TYPE_LABELS);
}

export function approvalStatusLabel(code: ApprovalStatus): string {
  return labelFor(code, APPROVAL_STATUS_LABELS);
}

export function taskRequestTypeLabel(code: TaskRequestType): string {
  return labelFor(code, TASK_REQUEST_TYPE_LABELS);
}

export function departmentTypeLabel(code: DepartmentType): string {
  return labelFor(code, DEPARTMENT_TYPE_LABELS);
}

export function roleCodeLabel(code: RoleCode): string {
  return labelFor(code, ROLE_CODE_LABELS);
}

export function moduleLabel(code: string): string {
  return labelFor(code, MODULE_LABELS);
}

export function ticketStateName(code: TicketStateCode): string {
  return TICKET_STATE_BY_CODE[code]?.name ?? code;
}

export function leaveCodeName(code: LeaveCode): string {
  return LEAVE_CODE_BY_CODE[code]?.name ?? code;
}
