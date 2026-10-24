"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { SectionHeader } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMesFormat } from "@/lib/mes/i18n/format";
import {
  canSeeCompanyAudit,
  canSeeDepartmentAudit,
} from "@/lib/mes/queries/access";
import {
  KPI_AUDIT_LEVEL1_QUERY,
  KPI_AUDIT_LEVEL2_QUERY,
  KPI_AUDIT_LEVEL3_QUERY,
} from "@/lib/mes/queries/performance";
import type {
  Connection,
  KpiAuditLevel1Row,
  KpiAuditLevel2Row,
  KpiAuditLevel3Row,
  RoleCode,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { RankingChart } from "./ranking-chart";

const NOT_AVAILABLE = "—";

function byScoreDesc<T extends { totalKpiScore: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.totalKpiScore - a.totalKpiScore);
}

/**
 * The three audit tables with their documented columns and role visibility:
 * Levels 1–2 are hidden from `DEPT_HEAD`/`EMPLOYEE`; Level 3 is hidden from
 * `EMPLOYEE` and scoped to the department for `DEPT_HEAD`.
 */
export function AuditTables({
  role,
  periodYear,
  periodMonth,
}: {
  role: RoleCode | null;
  periodYear: number;
  periodMonth: number;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("performance.audit");
  const showCompany = canSeeCompanyAudit(role);
  const showDepartment = canSeeDepartmentAudit(role);

  const filter = { periodYear, periodMonth };

  const level1 = useApiQuery<{
    kpiAuditLevel1Company: Connection<KpiAuditLevel1Row>;
  }>(
    KPI_AUDIT_LEVEL1_QUERY,
    { filter, offset: 0, limit: 200 },
    { enabled: showCompany, liveArea: "performance" },
  );

  const level2 = useApiQuery<{
    kpiAuditLevel2Department: Connection<KpiAuditLevel2Row>;
  }>(
    KPI_AUDIT_LEVEL2_QUERY,
    { filter },
    {
      enabled: showCompany,
      liveArea: "performance",
    },
  );

  const level3 = useApiQuery<{
    kpiAuditLevel3Employee: Connection<KpiAuditLevel3Row>;
  }>(
    KPI_AUDIT_LEVEL3_QUERY,
    { filter, orderBy: "TOTAL_KPI_SCORE_DESC", offset: 0, limit: 200 },
    { enabled: showDepartment, liveArea: "performance" },
  );

  const level1Rows = useMemo(
    () => byScoreDesc(level1.data?.kpiAuditLevel1Company.nodes ?? []),
    [level1.data],
  );
  const level3Rows = useMemo(
    () => byScoreDesc(level3.data?.kpiAuditLevel3Employee.nodes ?? []),
    [level3.data],
  );
  const level2Rows = level2.data?.kpiAuditLevel2Department.nodes ?? [];

  if (!showCompany && !showDepartment) {
    return <EmptyState title={t("noneTitle")} description={t("noneDesc")} />;
  }

  return (
    <div className="flex flex-col gap-8">
      {showCompany ? (
        <section>
          <SectionHeader
            title={t("rankingTitle")}
            description={t("rankingDesc")}
          />
          {level1.error ? (
            <ErrorState error={level1.error} onRetry={level1.refetch} />
          ) : null}
          {level1.loading && !level1.data ? (
            <LoadingState rows={2} />
          ) : (
            <div className="h-64 w-full border border-border p-2">
              <RankingChart
                className="h-full w-full"
                labels={level1Rows.map((row) => row.user.fullName)}
                values={level1Rows.map((row) => row.totalKpiScore)}
              />
            </div>
          )}
        </section>
      ) : null}

      {showCompany ? (
        <section>
          <SectionHeader
            title={t("level1Title")}
            description={t("level1Desc")}
          />
          {level1.error ? (
            <ErrorState error={level1.error} onRetry={level1.refetch} />
          ) : null}
          {level1.loading && !level1.data ? <LoadingState rows={5} /> : null}
          {level1.data && level1Rows.length === 0 ? (
            <EmptyState
              title={t("level1EmptyTitle")}
              description={t("level1EmptyDesc")}
            />
          ) : null}
          {level1Rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t("colNo")}</TableHead>
                  <TableHead>{t("colEmployeeName")}</TableHead>
                  <TableHead className="w-40">{t("colDepartment")}</TableHead>
                  <TableHead className="w-24">{t("colTotalTasks")}</TableHead>
                  <TableHead className="w-28">{t("colOnTime")}</TableHead>
                  <TableHead className="w-32">{t("colOverdue")}</TableHead>
                  <TableHead className="w-28">{t("colAnnualLeave")}</TableHead>
                  <TableHead className="w-28">{t("colSickLeave")}</TableHead>
                  <TableHead className="w-40">
                    {t("colUnapprovedLeave")}
                  </TableHead>
                  <TableHead className="w-40">{t("colExcellent")}</TableHead>
                  <TableHead className="w-48">
                    {t("colUnapprovedDeduction")}
                  </TableHead>
                  <TableHead className="w-32">
                    {t("colAttendanceRate")}
                  </TableHead>
                  <TableHead className="w-48">{t("colTotalScore")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {level1Rows.map((row, index) => (
                  <TableRow key={row.user.id}>
                    <TableCell className="font-mono text-xs">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.user.fullName}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.department?.name ?? NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.totalTasksAssigned}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.completedOnTime}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.overdueTasks}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.unapprovedLeaveCount}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.perfectAttendanceBonus}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.unapprovedLeaveCount === 0
                        ? 0
                        : -10 * row.unapprovedLeaveCount}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt.decimal(row.attendanceRate)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {row.totalKpiScore}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {t("level1Note", { na: NOT_AVAILABLE })}
          </p>
        </section>
      ) : null}

      {showCompany ? (
        <section>
          <SectionHeader
            title={t("level2Title")}
            description={t("level2Desc")}
          />
          {level2.error ? (
            <ErrorState error={level2.error} onRetry={level2.refetch} />
          ) : null}
          {level2.loading && !level2.data ? <LoadingState rows={4} /> : null}
          {level2.data && level2Rows.length === 0 ? (
            <EmptyState
              title={t("level2EmptyTitle")}
              description={t("level2EmptyDesc")}
            />
          ) : null}
          {level2Rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t("colNo")}</TableHead>
                  <TableHead>{t("colDepartmentName")}</TableHead>
                  <TableHead className="w-40">{t("colDeptHead")}</TableHead>
                  <TableHead className="w-32">
                    {t("colTotalEmployees")}
                  </TableHead>
                  <TableHead className="w-40">
                    {t("colTotalTasksAssigned")}
                  </TableHead>
                  <TableHead className="w-40">{t("colAvgProgress")}</TableHead>
                  <TableHead className="w-48">{t("colOnTimeRate")}</TableHead>
                  <TableHead className="w-40">
                    {t("colAvgAttendanceScore")}
                  </TableHead>
                  <TableHead className="w-56">{t("colAvgDeptScore")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {level2Rows.map((row, index) => (
                  <TableRow key={row.department.id}>
                    <TableCell className="font-mono text-xs">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.department.name}
                    </TableCell>
                    <TableCell className="text-xs">
                      {row.department.manager?.fullName ?? NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.totalEmployees}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.totalTasksAssigned}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt.decimal(row.avgAttendanceRate)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {fmt.decimal(row.avgDepartmentKpiScore)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
        </section>
      ) : null}

      {showDepartment ? (
        <section>
          <SectionHeader
            title={t("level3Title")}
            description={
              role === "DEPT_HEAD" ? t("level3DescOwn") : t("level3Desc")
            }
          />
          {level3.error ? (
            <ErrorState error={level3.error} onRetry={level3.refetch} />
          ) : null}
          {level3.loading && !level3.data ? <LoadingState rows={5} /> : null}
          {level3.data && level3Rows.length === 0 ? (
            <EmptyState
              title={t("level3EmptyTitle")}
              description={t("level3EmptyDesc")}
            />
          ) : null}
          {level3Rows.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{t("colNo")}</TableHead>
                  <TableHead>{t("colEmployeeName")}</TableHead>
                  <TableHead className="w-24">{t("colTotalTasks")}</TableHead>
                  <TableHead className="w-28">{t("colOnTime")}</TableHead>
                  <TableHead className="w-32">{t("colOverdue")}</TableHead>
                  <TableHead className="w-28">{t("colAnnualLeave")}</TableHead>
                  <TableHead className="w-40">
                    {t("colUnapprovedLeave")}
                  </TableHead>
                  <TableHead className="w-40">{t("colImmediate")}</TableHead>
                  <TableHead className="w-40">{t("colExcellent")}</TableHead>
                  <TableHead className="w-28">{t("colReturned")}</TableHead>
                  <TableHead className="w-32">
                    {t("colAttendanceRate")}
                  </TableHead>
                  <TableHead className="w-48">{t("colTotalScore")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {level3Rows.map((row, index) => (
                  <TableRow key={`${row.department.id}-${row.user.id}`}>
                    <TableCell className="font-mono text-xs">
                      {index + 1}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.user.fullName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.totalTasksAssigned}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.completedOnTime}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.overdueTasks}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {NOT_AVAILABLE}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.immediateApprovalCount}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.perfectAttendanceBonus}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.returnedCount}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt.decimal(row.attendanceRate)}
                    </TableCell>
                    <TableCell className="font-mono text-sm font-semibold">
                      {row.totalKpiScore}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {t("level3Note", { na: NOT_AVAILABLE })}
          </p>
        </section>
      ) : null}

      {!showCompany && showDepartment ? (
        <p className="text-xs text-muted-foreground">
          Audit Tables 1 and 2 and the company-wide ranking chart are restricted
          to Super Admin, Tech Lead, and HE Manager.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showCompany ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => level1.refetch()}
            >
              {t("refreshLevel1")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => level2.refetch()}
            >
              {t("refreshLevel2")}
            </Button>
          </>
        ) : null}
        {showDepartment ? (
          <Button variant="outline" size="sm" onClick={() => level3.refetch()}>
            {t("refreshLevel3")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
