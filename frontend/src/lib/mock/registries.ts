/**
 * Code registries seeded from `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` and the
 * display mappings documented in `DESIGN.md` §3 / `SYSTEM_PROCESS_FLOW-en.md`.
 *
 * Codes are the shared, system-wide vocabulary and are preserved verbatim.
 */

import type {
  KpiPointRule,
  LeaveCode,
  LeaveCodeInfo,
  ModuleCode,
  ModuleInfo,
  TaskStateBadge,
  TicketState,
  TicketStateCode,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Modules registry (extension point)                                         */
/* -------------------------------------------------------------------------- */

export const MODULES: ModuleInfo[] = [
  {
    code: "jobs",
    name: "Jobs & Projects",
    description: "Task assignment, progress and acceptance.",
    isEnabled: true,
    sortOrder: 1,
  },
  {
    code: "planning",
    name: "Planning & Attendance",
    description: "Matrix calendar, attendance and leave.",
    isEnabled: true,
    sortOrder: 2,
  },
  {
    code: "performance",
    name: "Performance & Audit",
    description: "Deterministic KPI scoring and audit tables.",
    isEnabled: true,
    sortOrder: 3,
  },
  {
    code: "settings",
    name: "Settings & IAM",
    description: "Authorization, organization and configuration.",
    isEnabled: true,
    sortOrder: 4,
  },
  {
    code: "audit-log",
    name: "Audit Log",
    description:
      "Technical monitoring of system-wide and per-module activity.",
    isEnabled: true,
    sortOrder: 5,
  },
];

/* -------------------------------------------------------------------------- */
/* Ticket state registry                                                      */
/* -------------------------------------------------------------------------- */

export const TICKET_STATES: TicketState[] = [
  {
    code: "REQ",
    name: "Requested",
    color: "White",
    description:
      "Newly allocated ticket, or not confirmed/planned before 08:30.",
    isTerminal: false,
    sortOrder: 1,
  },
  {
    code: "ACT",
    name: "Active",
    color: "Yellow",
    description: "Accepted and in progress.",
    isTerminal: false,
    sortOrder: 2,
  },
  {
    code: "PEN",
    name: "Pending",
    color: "Blue",
    description:
      "Complete pressed, or multi-day task at 100% with report submitted.",
    isTerminal: false,
    sortOrder: 3,
  },
  {
    code: "APP",
    name: "Approved",
    color: "Green",
    description: "Approved by Manager/HR; progress accepted.",
    isTerminal: true,
    sortOrder: 4,
  },
  {
    code: "REJ",
    name: "Rejected",
    color: "Orange",
    description: "Rejected by Manager/HR; progress returned for revision.",
    isTerminal: false,
    sortOrder: 5,
  },
  {
    code: "CAN",
    name: "Cancelled",
    color: "Red",
    description: "Cancelled by the Employee or Manager (reason mandatory).",
    isTerminal: true,
    sortOrder: 6,
  },
  {
    code: "OVERDUE",
    name: "Overdue",
    color: "Red (Warning)",
    description: "Past the hourly/daily/multi-day deadline.",
    isTerminal: false,
    sortOrder: 7,
  },
];

export const TICKET_STATE_BY_CODE: Record<TicketStateCode, TicketState> =
  Object.fromEntries(TICKET_STATES.map((s) => [s.code, s])) as Record<
    TicketStateCode,
    TicketState
  >;

/**
 * Badge surface styling per `DESIGN.md` §3 mapping:
 * `ACT`→warning, `PEN`→primary, `APP`→success, `CAN`/`OVERDUE`→error,
 * `REQ`→neutral outline on white, `REJ`→one supplementary Carbon orange.
 */
export interface StateVisual {
  colorName: string;
  hex: string;
  className: string;
}

export const TICKET_STATE_VISUALS: Record<TicketStateCode, StateVisual> = {
  REQ: {
    colorName: "White",
    hex: "#8c8c8c",
    className: "border-border bg-background text-foreground",
  },
  ACT: {
    colorName: "Yellow",
    hex: "#f1c21b",
    className: "border-[#f1c21b] bg-[#f1c21b] text-[#161616]",
  },
  PEN: {
    colorName: "Blue",
    hex: "#0f62fe",
    className: "border-primary bg-primary text-primary-foreground",
  },
  APP: {
    colorName: "Green",
    hex: "#24a148",
    className: "border-[#24a148] bg-[#24a148] text-white",
  },
  REJ: {
    colorName: "Orange",
    hex: "#ee5c25",
    className: "border-[#ee5c25] bg-[#ee5c25] text-white",
  },
  CAN: {
    colorName: "Red",
    hex: "#da1e28",
    className: "border-[#da1e28] bg-[#da1e28] text-white",
  },
  OVERDUE: {
    colorName: "Red (Warning)",
    hex: "#da1e28",
    className: "border-[#da1e28] bg-background text-[#da1e28]",
  },
};

/** `ACT` secondary-badge display labels (verbatim from the contract). */
export const TASK_STATE_BADGE_LABELS: Record<TaskStateBadge, string> = {
  URGENT_PROCESSING: "ACT - Urgent Processing",
  PROGRESS_UPDATE: "ACT - Progress Update",
  AWAITING_EXTENSION_APPROVAL: "ACT - Awaiting Extension Approval",
  AWAITING_PROGRESS_VERIFICATION: "ACT - Awaiting Progress Verification",
};

/** Multi-day milestone labels (progress 0% → 100%). */
export const MULTI_DAY_MILESTONES = [
  { percentage: 25, label: "Outline/Wireframe" },
  { percentage: 50, label: "Draft/Rough" },
  { percentage: 75, label: "Testing/Review" },
  { percentage: 100, label: "Acceptance" },
] as const;

export function multiDayMilestoneLabel(progress: number): string | null {
  let label: string | null = null;
  for (const milestone of MULTI_DAY_MILESTONES) {
    if (progress >= milestone.percentage) label = milestone.label;
  }
  return label;
}

/* -------------------------------------------------------------------------- */
/* Leave code registry                                                        */
/* -------------------------------------------------------------------------- */

export const LEAVE_CODES: LeaveCodeInfo[] = [
  {
    code: "AL",
    name: "Annual Leave",
    category: "PAID",
    isPaid: true,
    payrollRule: "100% paid",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: true,
    sortOrder: 1,
  },
  {
    code: "UAL",
    name: "Unapproved / Unpaid Annual Leave",
    category: "UNPAID",
    isPaid: false,
    payrollRule: "Deduct 100% of the daily wage + KPI point deduction",
    deductsWage: true,
    isPenalty: true,
    isBalanceTracked: false,
    sortOrder: 2,
  },
  {
    code: "SL",
    name: "Sick Leave",
    category: "INSURANCE",
    isPaid: true,
    payrollRule: "Social insurance regime / sick pay",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 3,
  },
  {
    code: "USL",
    name: "Unexcused / Unpaid Sick Leave",
    category: "UNPAID",
    isPaid: false,
    payrollRule: "Deduct 100% of the daily wage + KPI point deduction",
    deductsWage: true,
    isPenalty: true,
    isBalanceTracked: false,
    sortOrder: 4,
  },
  {
    code: "PL",
    name: "Personal Leave",
    category: "PAID",
    isPaid: true,
    payrollRule: "100% paid under the Labor Law",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 5,
  },
  {
    code: "ML",
    name: "Medical / Maternity Leave",
    category: "INSURANCE",
    isPaid: true,
    payrollRule: "Social insurance regime for maternity/medical",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 6,
  },
  {
    code: "CL",
    name: "Compassionate Leave",
    category: "SPECIAL",
    isPaid: true,
    payrollRule: "Paid or unpaid depending on policy",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 7,
  },
  {
    code: "EL",
    name: "Emergency Leave",
    category: "SPECIAL",
    isPaid: true,
    payrollRule: "Prioritized for supplementary approval afterward",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 8,
  },
  {
    code: "LWP",
    name: "Leave Without Pay",
    category: "UNPAID",
    isPaid: false,
    payrollRule: "No daily wage, no penalty",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 9,
  },
  {
    code: "TOIL",
    name: "Time Off In Lieu",
    category: "PAID",
    isPaid: true,
    payrollRule: "100% paid (deducted from the OT hours fund)",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: true,
    sortOrder: 10,
  },
  {
    code: "VTO",
    name: "Voluntary Time Off",
    category: "UNPAID",
    isPaid: false,
    payrollRule: "Unpaid / support depending on policy",
    deductsWage: false,
    isPenalty: false,
    isBalanceTracked: false,
    sortOrder: 11,
  },
];

export const LEAVE_CODE_BY_CODE: Record<LeaveCode, LeaveCodeInfo> =
  Object.fromEntries(LEAVE_CODES.map((c) => [c.code, c])) as Record<
    LeaveCode,
    LeaveCodeInfo
  >;

export const LEAVE_CODE_VISUALS: Record<LeaveCode, StateVisual> = {
  AL: {
    colorName: "Green",
    hex: "#24a148",
    className: "border-[#24a148] bg-[#24a148]/10 text-[#161616]",
  },
  SL: {
    colorName: "Blue",
    hex: "#0f62fe",
    className: "border-primary bg-primary/10 text-[#161616]",
  },
  PL: {
    colorName: "Neutral",
    hex: "#525252",
    className: "border-border bg-muted text-foreground",
  },
  ML: {
    colorName: "Blue",
    hex: "#0f62fe",
    className: "border-primary bg-primary/10 text-[#161616]",
  },
  CL: {
    colorName: "Neutral",
    hex: "#525252",
    className: "border-border bg-muted text-foreground",
  },
  EL: {
    colorName: "Yellow",
    hex: "#f1c21b",
    className: "border-[#f1c21b] bg-[#f1c21b]/20 text-[#161616]",
  },
  LWP: {
    colorName: "Neutral",
    hex: "#525252",
    className: "border-border bg-muted text-foreground",
  },
  TOIL: {
    colorName: "Green",
    hex: "#24a148",
    className: "border-[#24a148] bg-[#24a148]/10 text-[#161616]",
  },
  VTO: {
    colorName: "Neutral",
    hex: "#525252",
    className: "border-border bg-muted text-foreground",
  },
  UAL: {
    colorName: "Red (Warning)",
    hex: "#da1e28",
    className: "border-[#da1e28] bg-[#da1e28]/10 text-[#da1e28]",
  },
  USL: {
    colorName: "Red (Warning)",
    hex: "#da1e28",
    className: "border-[#da1e28] bg-[#da1e28]/10 text-[#da1e28]",
  },
};

/* -------------------------------------------------------------------------- */
/* KPI point rules (fixed, documented rule set)                               */
/* -------------------------------------------------------------------------- */

export const KPI_POINT_RULES: KpiPointRule[] = [
  {
    code: "KPI_ON_TIME_TICKET",
    event: "on_time_ticket",
    points: 10,
    description: "+10 per on-time ticket (APP).",
    isActive: true,
    sortOrder: 1,
  },
  {
    code: "KPI_ON_TIME_URGENT",
    event: "on_time_urgent_ticket",
    points: 20,
    description: "+20 per on-time urgent ticket (APP).",
    isActive: true,
    sortOrder: 2,
  },
  {
    code: "KPI_FIRST_TIME_APPROVAL",
    event: "first_time_approval",
    points: 5,
    description: "+5 per instance approved immediately without edits.",
    isActive: true,
    sortOrder: 3,
  },
  {
    code: "KPI_PERFECT_ATTENDANCE",
    event: "perfect_attendance",
    points: 50,
    description: "+50 per month of excellent attendance.",
    isActive: true,
    sortOrder: 4,
  },
  {
    code: "KPI_OVERDUE_TICKET",
    event: "overdue_ticket",
    points: -15,
    description: "-15 per overdue ticket (OVERDUE).",
    isActive: true,
    sortOrder: 5,
  },
  {
    code: "KPI_RETURNED_TICKET",
    event: "returned_ticket",
    points: -5,
    description: "-5 per instance returned (REJ).",
    isActive: true,
    sortOrder: 6,
  },
  {
    code: "KPI_EXTENSION_REQUEST",
    event: "extension_request",
    points: -2,
    description: "-2 per extension request.",
    isActive: true,
    sortOrder: 7,
  },
  {
    code: "KPI_UNAPPROVED_LEAVE",
    event: "unapproved_leave",
    points: -10,
    description:
      "-10 per late/early instance or unapproved leave (UAL/USL).",
    isActive: true,
    sortOrder: 8,
  },
];

export const KPI_POINT_RULE_BY_CODE: Record<string, KpiPointRule> =
  Object.fromEntries(KPI_POINT_RULES.map((r) => [r.code, r]));

/* -------------------------------------------------------------------------- */
/* Shared enumerations (for filter controls)                                  */
/* -------------------------------------------------------------------------- */

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const TASK_TYPES = ["HOURLY", "DAILY", "MULTI_DAY"] as const;

/** Hourly urgent deadline slots. */
export const HOURLY_DEADLINE_SLOTS = ["10:30", "14:00", "16:30"] as const;

/** Daily deadline defaults (same day). */
export const DAILY_DEADLINE_SLOTS = ["17:00", "18:00"] as const;

/** Daily planning/confirmation cutoff. */
export const DAILY_PLANNING_CUTOFF = "08:30";
