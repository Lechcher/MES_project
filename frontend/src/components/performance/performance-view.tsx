"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuditTables } from "@/components/performance/audit-tables";
import { PersonalDashboard } from "@/components/performance/personal-dashboard";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { ExportButton } from "@/components/shared/export-action";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canSeeDepartmentAudit } from "@/lib/mes/queries/access";
import {
  EXPORT_AUDIT_WORKBOOK_MUTATION,
  PRINT_KPI_REPORT_MUTATION,
} from "@/lib/mes/queries/performance";
import type { RoleCode } from "@/lib/mes/queries/types";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/**
 * Performance & Audit: the Personal KPI Dashboard for every role, the
 * role-gated audit tables and ranking chart, and print/export entry points.
 */
export function PerformanceView() {
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const fmt = useMesFormat();
  const t = useTranslations("performance.view");
  const labels = useDomainLabels();

  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [tab, setTab] = useState("personal");

  if (!viewer) return null;

  const showAudit = canSeeDepartmentAudit(role);
  const input = { periodYear: year, periodMonth: month };
  const periodLabel = fmt.monthYear(new Date(Date.UTC(year, month - 1, 1)));

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  };

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("performance")}
        title={t("title")}
        description={t("roleScoped", { role: role ? labels.role(role) : "—" })}
        actions={
          <>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </Button>
              <span className="text-sm font-medium">{periodLabel}</span>
              <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>
                ›
              </Button>
            </div>
            <ExportButton
              mutation={PRINT_KPI_REPORT_MUTATION}
              resultKey="printKpiReport"
              label={t("print")}
              variables={{ input }}
            />
            {showAudit ? (
              <ExportButton
                mutation={EXPORT_AUDIT_WORKBOOK_MUTATION}
                resultKey="exportAuditWorkbook"
                label={t("exportWorkbook")}
                variables={{ filter: input }}
              />
            ) : null}
          </>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList variant="line">
          <TabsTrigger value="personal">{t("tabPersonal")}</TabsTrigger>
          {showAudit ? (
            <TabsTrigger value="audit">{t("tabAudit")}</TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <PersonalDashboard periodYear={year} periodMonth={month} />
        </TabsContent>

        {showAudit ? (
          <TabsContent value="audit" className="mt-4">
            <AuditTables role={role} periodYear={year} periodMonth={month} />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
