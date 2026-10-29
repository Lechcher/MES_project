"use client";

/**
 * Audit chart and table — one ranking chart and one detail table, in the scope,
 * department, and period the performance view currently selects.
 *
 * The three former audit levels are one surface with three grains: a
 * Company-wide scope lists employee rows, a Department-wide scope lists
 * department rows, and an Employees in department scope lists the employees of
 * one chosen department with the same employee-level columns. Every role
 * reaches this surface; which rows come back is the API's decision, applied by
 * `auditScopeFor` in `queries/access`.
 */

import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type AuditDepartmentRow,
  type AuditEmployeeRow,
  filterAuditRowsByRole,
} from "@/lib/mes/audit-merge";
import type { MesApiError } from "@/lib/mes/errors";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import type { AuditScopeCode } from "@/lib/mes/queries/access";
import { RankingChart } from "./ranking-chart";

const NOT_AVAILABLE = "—";

export function AuditChartAndTable({
  scope,
  employeeRows,
  departmentRows,
  roleCodes,
  loading,
  error,
  departmentId,
  seriesLabel,
  periodLabel,
}: {
  scope: AuditScopeCode;
  /** The authorized employee rows, before the role filter narrows them. */
  employeeRows: AuditEmployeeRow[];
  /** The authorized department rows. */
  departmentRows: AuditDepartmentRow[];
  /** The selected role codes; an empty selection keeps every row. */
  roleCodes: string[];
  loading: boolean;
  error: MesApiError | null;
  /** The department the per-department grain narrows to, if one is chosen. */
  departmentId?: string | null;
  /** The localized series name for the ranking chart. */
  seriesLabel: string;
  /** The selected periods, pre-formatted, shown beside the table title. */
  periodLabel: string;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("performance.audit");
  const labels = useDomainLabels();

  const isDepartment = scope === "department";
  const isDepartmentEmployees = scope === "employees-in-department";
  // The role filter narrows the rows the chart and the table both show, so the
  // two can never describe different sets of people.
  const rows = filterAuditRowsByRole(employeeRows, roleCodes);
  const rowCount = isDepartment ? departmentRows.length : rows.length;
  // No department chosen for the per-department grain: nothing has been asked
  // for yet, which is a choice to make rather than an empty period.
  const awaitingDepartment = isDepartmentEmployees && !departmentId && !loading;

  /** One cell's value, or the em dash when the row does not expose it. */
  const cell = (value: number | null): string =>
    value === null ? NOT_AVAILABLE : String(value);

  /** The person's roles, as names. A person may hold more than one. */
  const roleNames = (row: AuditEmployeeRow): string =>
    row.roles.length === 0
      ? NOT_AVAILABLE
      : row.roles.map((role) => labels.role(role.code)).join(", ");

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader
          title={t("rankingTitle")}
          description={t("rankingDesc")}
        />
        {error ? (
          <ErrorState error={error} />
        ) : awaitingDepartment ? (
          <EmptyState
            title={t("departmentEmptyTitle")}
            description={t("departmentEmptyDesc")}
          />
        ) : rowCount === 0 && loading ? (
          <LoadingState rows={4} />
        ) : rowCount === 0 ? (
          <EmptyState
            title={t("detailEmptyTitle")}
            description={t("detailEmptyDesc")}
          />
        ) : (
          <div className="h-64 w-full border border-border p-2">
            <RankingChart
              className="h-full w-full"
              labels={
                isDepartment
                  ? departmentRows.map((row) => row.department.name)
                  : rows.map((row) => row.user.fullName)
              }
              values={
                isDepartment
                  ? departmentRows.map((row) => row.avgDepartmentKpiScore)
                  : rows.map((row) => row.totalKpiScore)
              }
              seriesLabel={seriesLabel}
              colorNegative
            />
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title={t("detailTitle")}
          description={`${t("detailDesc")} · ${periodLabel}`}
        />
        {error ? (
          <ErrorState error={error} />
        ) : awaitingDepartment ? (
          <EmptyState
            title={t("departmentEmptyTitle")}
            description={t("departmentEmptyDesc")}
          />
        ) : rowCount === 0 && loading ? (
          <LoadingState rows={5} />
        ) : rowCount === 0 ? (
          <EmptyState
            title={t("detailEmptyTitle")}
            description={t("detailEmptyDesc")}
          />
        ) : isDepartment ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("colNo")}</TableHead>
                <TableHead>{t("colDepartmentName")}</TableHead>
                <TableHead className="w-40">{t("colDepartmentHead")}</TableHead>
                <TableHead className="w-32">{t("colTotalEmployees")}</TableHead>
                <TableHead className="w-40">
                  {t("colTotalTasksAssigned")}
                </TableHead>
                <TableHead className="w-40">
                  {t("colAvgAttendanceScore")}
                </TableHead>
                <TableHead className="w-56">
                  {t("colAvgDepartmentScore")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departmentRows.map((row, index) => (
                <TableRow key={row.department.id}>
                  <TableCell className="font-mono text-xs">
                    {index + 1}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.department.name}
                  </TableCell>
                  <TableCell className="text-xs">
                    {row.manager?.fullName ?? NOT_AVAILABLE}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.totalEmployees}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.totalTasksAssigned}
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
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("colNo")}</TableHead>
                <TableHead>{t("colEmployeeName")}</TableHead>
                <TableHead className="w-40">{t("colRole")}</TableHead>
                <TableHead className="w-40">{t("colDepartment")}</TableHead>
                <TableHead className="w-24">{t("colTotalTasks")}</TableHead>
                <TableHead className="w-28">{t("colOnTime")}</TableHead>
                <TableHead className="w-32">{t("colOverdue")}</TableHead>
                <TableHead className="w-40">
                  {t("colUnapprovedLeave")}
                </TableHead>
                <TableHead className="w-28">{t("colAnnualLeave")}</TableHead>
                <TableHead className="w-40">{t("colSickLeave")}</TableHead>
                <TableHead className="w-32">{t("colAttendanceRate")}</TableHead>
                <TableHead className="w-48">{t("colTotalScore")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={row.user.id}>
                  <TableCell className="font-mono text-xs">
                    {index + 1}
                  </TableCell>
                  <TableCell className="text-sm">{row.user.fullName}</TableCell>
                  <TableCell className="text-xs">{roleNames(row)}</TableCell>
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
                    {cell(row.unapprovedLeaveCount)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {NOT_AVAILABLE}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {NOT_AVAILABLE}
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
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {t("detailNote", { na: NOT_AVAILABLE })}
        </p>
      </section>
    </div>
  );
}
