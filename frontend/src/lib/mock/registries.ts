/**
 * Code registries seeded from `DATABASE_SCHEMA_EXAMPLE_OPTIMIZED.sql` (§14)
 * and mirrored in `API_CONTACT_SPECIFICATION.md` §5.2.
 *
 * Enum codes appear verbatim; color names map to the DESIGN.md palette
 * (design decision D4): White→neutral outline, Yellow→warning #f1c21b,
 * Blue→primary #0f62fe, Green→success #24a148, Orange→#ee5c25,
 * Red→error #da1e28, Red (Warning)→error #da1e28.
 */

import type {
  KpiPointRule,
  LeaveCode,
  LeaveCodeInfo,
  TicketState,
  TicketStateCode,
} from "./types";

/*──────────────────────────── Ticket states ──────────────────────────────────*/

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
] as const;

export const TICKET_STATE_BY_CODE: Record<TicketStateCode, TicketState> =
  Object.fromEntries(TICKET_STATES.map((s) => [s.code, s])) as Record<
    TicketStateCode,
    TicketState
  >;

export const TICKET_STATE_CODES: TicketStateCode[] = TICKET_STATES.map(
  (s) => s.code,
);

/*──────────────────────────── Leave codes ────────────────────────────────────*/

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
] as const;

export const LEAVE_CODE_BY_CODE: Record<LeaveCode, LeaveCodeInfo> =
  Object.fromEntries(LEAVE_CODES.map((c) => [c.code, c])) as Record<
    LeaveCode,
    LeaveCodeInfo
  >;

export const LEAVE_CODES_LIST: LeaveCode[] = LEAVE_CODES.map((c) => c.code);

/*──────────────────────────── KPI point rules ────────────────────────────────*/

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
    description: "-10 per late/early instance or unapproved leave (UAL/USL).",
    isActive: true,
    sortOrder: 8,
  },
] as const;

export const KPI_POINT_RULE_BY_CODE: Record<string, KpiPointRule> =
  Object.fromEntries(KPI_POINT_RULES.map((r) => [r.code, r])) as Record<
    string,
    KpiPointRule
  >;

/*──────────────────────────── Color lookup (hex) ─────────────────────────────*/

export const STATE_COLOR_HEX: Record<string, string> = {
  REQ: "transparent", // neutral outline on white
  ACT: "#f1c21b", // Yellow → warning
  PEN: "#0f62fe", // Blue → primary
  APP: "#24a148", // Green → success
  REJ: "#ee5c25", // Orange → supplementary palette extension
  CAN: "#da1e28", // Red → error
  OVERDUE: "#da1e28", // Red (Warning) → error
} as const;

export const LEAVE_COLOR_HEX: Record<string, string> = {
  AL: "#0f62fe",
  UAL: "#da1e28",
  SL: "#0f62fe",
  USL: "#da1e28",
  PL: "#24a148",
  ML: "#0f62fe",
  CL: "#f1c21b",
  EL: "#f1c21b",
  LWP: "#da1e28",
  TOIL: "#24a148",
  VTO: "#da1e28",
} as const;
