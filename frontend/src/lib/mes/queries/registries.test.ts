/**
 * Display-label registry tests.
 *
 * Covers the per-enum lookups, the identity fallback for non-enum strings, the
 * secondary-badge labels, and the coverage guard that keeps every enum value
 * labeled. Coverage values mirror the canonical lists in
 * `backend/src/db/enums.ts`; a new enum value must fail here until it has a
 * label.
 */

import { describe, expect, test } from "bun:test";
import en from "../../../../messages/en.json";
import vi from "../../../../messages/vi.json";
import {
  APPROVAL_STATUS_LABELS,
  DEPARTMENT_TYPE_LABELS,
  EXPORT_FORMAT_LABELS,
  LEAVE_CODE_BY_CODE,
  labelFor,
  MODULE_LABELS,
  PRIORITY_LABELS,
  ROLE_CODE_LABELS,
  TASK_REQUEST_TYPE_LABELS,
  TASK_STATE_BADGE_LABELS,
  TASK_TYPE_LABELS,
  TICKET_STATE_BY_CODE,
  taskStateBadgeLabel,
} from "./registries";
import type { LeaveCode, TaskStateBadge, TicketStateCode } from "./types";

describe("display labels", () => {
  test("looks up the English label for each covered enum", () => {
    expect(labelFor("MEDIUM", PRIORITY_LABELS)).toBe("Medium");
    expect(labelFor("MULTI_DAY", TASK_TYPE_LABELS)).toBe("Multi-day");
    expect(labelFor("PENDING", APPROVAL_STATUS_LABELS)).toBe("Pending");
    expect(labelFor("EXTENSION", TASK_REQUEST_TYPE_LABELS)).toBe(
      "Extension Request",
    );
    expect(labelFor("DIVISION", DEPARTMENT_TYPE_LABELS)).toBe("Division");
    expect(labelFor("SUPER_ADMIN", ROLE_CODE_LABELS)).toBe("Super Admin");
    expect(labelFor("jobs", MODULE_LABELS)).toBe("Jobs & Projects");
    expect(labelFor("PEN", {} as Record<string, string>)).toBe("PEN");
  });

  test("an unknown code passes through unchanged", () => {
    // Audit-stream prose is not enum-shaped; it must not be blanked.
    expect(labelFor("Task approved", APPROVAL_STATUS_LABELS)).toBe(
      "Task approved",
    );
  });

  test("secondary badges read as English with the code prefix dropped", () => {
    expect(taskStateBadgeLabel("URGENT_PROCESSING")).toBe(
      "Active — Urgent Processing",
    );
    expect(taskStateBadgeLabel("PROGRESS_UPDATE", 45)).toBe(
      "Active — Progress Update (45%)",
    );
    expect(taskStateBadgeLabel("AWAITING_EXTENSION_APPROVAL")).toBe(
      "Active — Awaiting Extension Approval",
    );
    for (const label of Object.values(TASK_STATE_BADGE_LABELS)) {
      expect(label.startsWith("Active — ")).toBe(true);
    }
  });
});

/**
 * Every covered enum with its label resolver.
 *
 * `strict` entries require the label to differ from the token — the token must
 * never survive into display. `EXPORT_FORMAT` is read-only: "PDF" and "CSV" are
 * already words a user reads, so only presence is enforced there.
 *
 * `catalogueGroup` names the `enums.*` group in the localization catalogues
 * that carries the locale names for the same codes (see
 * `src/lib/mes/i18n/labels.ts`).
 */
const COVERAGE: {
  name: string;
  values: readonly string[];
  labelOf: (code: string) => string;
  strict: boolean;
  catalogueGroup: string;
}[] = [
  {
    name: "ticket states",
    values: ["REQ", "ACT", "PEN", "APP", "REJ", "CAN", "OVERDUE"],
    labelOf: (code) => TICKET_STATE_BY_CODE[code as TicketStateCode]?.name,
    strict: true,
    catalogueGroup: "ticketStates",
  },
  {
    name: "leave codes",
    values: [
      "AL",
      "UAL",
      "SL",
      "USL",
      "PL",
      "ML",
      "CL",
      "EL",
      "LWP",
      "TOIL",
      "VTO",
    ],
    labelOf: (code) => LEAVE_CODE_BY_CODE[code as LeaveCode]?.name,
    strict: true,
    catalogueGroup: "leaveCodes",
  },
  {
    name: "priority",
    values: ["LOW", "MEDIUM", "HIGH", "URGENT"],
    labelOf: (code) => labelFor(code, PRIORITY_LABELS),
    strict: true,
    catalogueGroup: "priorities",
  },
  {
    name: "task type",
    values: ["HOURLY", "DAILY", "MULTI_DAY"],
    labelOf: (code) => labelFor(code, TASK_TYPE_LABELS),
    strict: true,
    catalogueGroup: "taskTypes",
  },
  {
    name: "approval status",
    values: ["PENDING", "APPROVED", "REJECTED"],
    labelOf: (code) => labelFor(code, APPROVAL_STATUS_LABELS),
    strict: true,
    catalogueGroup: "approvalStatuses",
  },
  {
    name: "task request type",
    values: ["EXTENSION", "LATE_EXPLANATION"],
    labelOf: (code) => labelFor(code, TASK_REQUEST_TYPE_LABELS),
    strict: true,
    catalogueGroup: "taskRequestTypes",
  },
  {
    name: "department type",
    values: ["DEPARTMENT", "DIVISION"],
    labelOf: (code) => labelFor(code, DEPARTMENT_TYPE_LABELS),
    strict: true,
    catalogueGroup: "departmentTypes",
  },
  {
    name: "role code",
    values: ["SUPER_ADMIN", "TECH_LEAD", "HR_MANAGER", "DEPT_HEAD", "EMPLOYEE"],
    labelOf: (code) => labelFor(code, ROLE_CODE_LABELS),
    strict: true,
    catalogueGroup: "roles",
  },
  {
    name: "task state badge",
    values: [
      "URGENT_PROCESSING",
      "PROGRESS_UPDATE",
      "AWAITING_EXTENSION_APPROVAL",
      "AWAITING_PROGRESS_VERIFICATION",
    ],
    labelOf: (code) => TASK_STATE_BADGE_LABELS[code as TaskStateBadge] ?? code,
    strict: true,
    catalogueGroup: "taskStateBadges",
  },
  {
    name: "audit module",
    values: ["jobs", "planning", "performance", "settings", "audit-log"],
    labelOf: (code) => labelFor(code, MODULE_LABELS),
    strict: true,
    catalogueGroup: "modules",
  },
  {
    name: "export format",
    values: ["PDF", "XLSX", "CSV"],
    labelOf: (code) => labelFor(code, EXPORT_FORMAT_LABELS),
    strict: false,
    catalogueGroup: "exportFormats",
  },
];

describe("label coverage", () => {
  for (const entry of COVERAGE) {
    test(`every ${entry.name} value has a label`, () => {
      for (const value of entry.values) {
        const label = entry.labelOf(value);
        expect(label, `${entry.name}: ${value} has no label`).toBeTruthy();
        if (entry.strict) {
          // A label that merely repeats the token is not a label.
          expect(label).not.toBe(value);
        }
      }
    });
  }

  test("no label table contains an empty entry", () => {
    for (const table of [
      PRIORITY_LABELS,
      TASK_TYPE_LABELS,
      APPROVAL_STATUS_LABELS,
      TASK_REQUEST_TYPE_LABELS,
      DEPARTMENT_TYPE_LABELS,
      EXPORT_FORMAT_LABELS,
      ROLE_CODE_LABELS,
      MODULE_LABELS,
    ]) {
      for (const [code, label] of Object.entries(table)) {
        expect(label, `${code} maps to an empty label`).not.toBe("");
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* Localization catalogues                                             */
/* ------------------------------------------------------------------ */

/** The localization catalogues, keyed by locale. */
const CATALOGUES = { en, vi } as const;

/** Look up `enums.<group>.<code>` in one catalogue. */
function catalogueMessage(
  locale: (typeof CATALOGUES)[keyof typeof CATALOGUES],
  group: string,
  code: string,
): string | undefined {
  const enums = locale.enums as unknown as
    | Record<string, Record<string, string>>
    | undefined;
  return enums?.[group]?.[code];
}

/** Every dot-joined key path in a catalogue, in a stable order. */
function keyPaths(node: unknown, prefix = ""): string[] {
  if (node === null || typeof node !== "object") return [prefix];
  return Object.entries(node).flatMap(([key, value]) =>
    keyPaths(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe("catalogue label coverage", () => {
  for (const entry of COVERAGE) {
    test(`every ${entry.name} value has an enums message in every locale`, () => {
      for (const value of entry.values) {
        for (const [localeName, locale] of Object.entries(CATALOGUES)) {
          const message = catalogueMessage(locale, entry.catalogueGroup, value);
          expect(
            message,
            `${localeName} is missing enums.${entry.catalogueGroup}.${value}`,
          ).toBeTruthy();
          expect(
            message,
            `${localeName} has an empty enums.${entry.catalogueGroup}.${value}`,
          ).not.toBe("");
          if (entry.strict) {
            // A message that merely repeats the token is not a translation.
            expect(
              message,
              `${localeName} enums.${entry.catalogueGroup}.${value} repeats the code`,
            ).not.toBe(value);
          }
        }
      }
    });
  }

  test("every locale exposes the same key set", () => {
    const enKeys = keyPaths(CATALOGUES.en).sort();
    const viKeys = keyPaths(CATALOGUES.vi).sort();
    // Both directions, so the diff names the exact missing or extra keys.
    expect(
      viKeys.filter((key) => !enKeys.includes(key)),
      "keys only in vi",
    ).toEqual([]);
    expect(
      enKeys.filter((key) => !viKeys.includes(key)),
      "keys only in en",
    ).toEqual([]);
    expect(viKeys.length).toBe(enKeys.length);
  });
});
