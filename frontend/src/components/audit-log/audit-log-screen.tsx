"use client";

import { useTranslations } from "next-intl";
import { AuditLogView } from "@/components/audit-log/audit-log-view";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { EmptyState } from "@/components/shared/query-states";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canViewAuditLogApp } from "@/lib/mes/queries/access";
import type { RoleCode } from "@/lib/mes/queries/types";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/**
 * Audit Log app — a read-only, newest-first view over the shared audit trail.
 * Visible and available only to `SUPER_ADMIN` and `TECH_LEAD`.
 */
export function AuditLogScreen() {
  const t = useTranslations("auditLog.screen");
  const labels = useDomainLabels();
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;

  if (!viewer) return null;

  if (!canViewAuditLogApp(role)) {
    return (
      <div>
        <AppPageHeader
          eyebrow={labels.module("audit-log")}
          title={labels.module("audit-log")}
          description={t("restricted")}
        />
        <EmptyState
          title={t("noAccessTitle")}
          description={t("noAccessDescription")}
        />
      </div>
    );
  }

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("audit-log")}
        title={t("title")}
        description={t("description")}
      />
      <AuditLogView />
    </div>
  );
}
