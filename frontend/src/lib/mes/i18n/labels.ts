"use client";

/**
 * Domain label bridge.
 *
 * The registry (`queries/registries.ts`) stays the code contract; the locale
 * names live in the `enums.*` catalogue groups keyed by the same codes. This
 * hook resolves a code to the active locale's name, falling back to the
 * registry's canonical English name when a message is missing, and to the
 * code itself when neither knows it — audit-stream prose and other
 * non-enum strings must never be blanked or mapped by mistake.
 */

import { useTranslations } from "next-intl";
import {
  APPROVAL_STATUS_LABELS,
  COMPLETION_SCOPE_LABELS,
  DEPARTMENT_TYPE_LABELS,
  EXPORT_FORMAT_LABELS,
  LEAVE_CODE_BY_CODE,
  MODULE_LABELS,
  PRIORITY_LABELS,
  ROLE_CODE_LABELS,
  TASK_REQUEST_TYPE_LABELS,
  TASK_STATE_BADGE_LABELS,
  TASK_TYPE_LABELS,
  TICKET_STATE_BY_CODE,
} from "@/lib/mes/queries/registries";
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
} from "@/lib/mes/queries/types";

/** The slice of next-intl's translator the bridge relies on. */
export interface DomainTranslatorFn {
  (key: string, values?: Record<string, unknown>): string;
  has: (key: string) => boolean;
}

/**
 * Resolve one code's display name: the active locale's `enums.<group>.<code>`
 * message first, then the registry's canonical English name, then the code
 * unchanged. Pure so the fallback order is unit-testable without React.
 */
export function resolveDomainLabel(
  tFn: DomainTranslatorFn,
  group: string,
  code: string,
  registryName: string | undefined,
): string {
  const key = `${group}.${code}`;
  return tFn.has(key) ? tFn(key) : (registryName ?? code);
}

/** The live `Progress Update (X%)` badge template, with the registry fallback. */
export function resolveTaskStateBadgeLabel(
  tFn: DomainTranslatorFn,
  badge: string,
  progressPercentage?: number,
): string {
  if (badge === "PROGRESS_UPDATE" && typeof progressPercentage === "number") {
    const templateKey = "taskStateBadges.PROGRESS_UPDATE_WITH_PERCENT";
    if (tFn.has(templateKey)) {
      return tFn(templateKey, { percent: progressPercentage });
    }
    return `Active — Progress Update (${progressPercentage}%)`;
  }
  return resolveDomainLabel(
    tFn,
    "taskStateBadges",
    badge,
    TASK_STATE_BADGE_LABELS[badge as TaskStateBadge],
  );
}

export function useDomainLabels() {
  const t = useTranslations("enums");
  const tFn = t as unknown as DomainTranslatorFn;

  return {
    ticketState(code: TicketStateCode | string): string {
      return resolveDomainLabel(
        tFn,
        "ticketStates",
        code,
        TICKET_STATE_BY_CODE[code as TicketStateCode]?.name,
      );
    },
    leaveCode(code: LeaveCode | string): string {
      return resolveDomainLabel(
        tFn,
        "leaveCodes",
        code,
        LEAVE_CODE_BY_CODE[code as LeaveCode]?.name,
      );
    },
    priority(code: Priority | string): string {
      return resolveDomainLabel(
        tFn,
        "priorities",
        code,
        PRIORITY_LABELS[code as Priority],
      );
    },
    taskType(code: TaskType | string): string {
      return resolveDomainLabel(
        tFn,
        "taskTypes",
        code,
        TASK_TYPE_LABELS[code as TaskType],
      );
    },
    approvalStatus(code: ApprovalStatus | string): string {
      return resolveDomainLabel(
        tFn,
        "approvalStatuses",
        code,
        APPROVAL_STATUS_LABELS[code as ApprovalStatus],
      );
    },
    completionScope(code: CompletionScope | string): string {
      return resolveDomainLabel(
        tFn,
        "completionScopes",
        code,
        COMPLETION_SCOPE_LABELS[code as CompletionScope],
      );
    },
    taskRequestType(code: TaskRequestType | string): string {
      return resolveDomainLabel(
        tFn,
        "taskRequestTypes",
        code,
        TASK_REQUEST_TYPE_LABELS[code as TaskRequestType],
      );
    },
    departmentType(code: DepartmentType | string): string {
      return resolveDomainLabel(
        tFn,
        "departmentTypes",
        code,
        DEPARTMENT_TYPE_LABELS[code as DepartmentType],
      );
    },
    role(code: RoleCode | string): string {
      return resolveDomainLabel(
        tFn,
        "roles",
        code,
        ROLE_CODE_LABELS[code as RoleCode],
      );
    },
    module(code: string): string {
      return resolveDomainLabel(tFn, "modules", code, MODULE_LABELS[code]);
    },
    exportFormat(code: ExportFormat | string): string {
      return resolveDomainLabel(
        tFn,
        "exportFormats",
        code,
        EXPORT_FORMAT_LABELS[code as ExportFormat],
      );
    },
    taskStateBadge(
      badge: TaskStateBadge | string,
      progressPercentage?: number,
    ): string {
      return resolveTaskStateBadgeLabel(tFn, badge, progressPercentage);
    },
  };
}
