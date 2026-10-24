"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { ExportButton } from "@/components/shared/export-action";
import { SectionHeader } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { seesCompanyCalendar } from "@/lib/mes/queries/access";
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import {
  ATTENDANCE_RECORDS_QUERY,
  EXPORT_ATTENDANCE_MUTATION,
  LEAVE_BALANCES_QUERY,
} from "@/lib/mes/queries/planning";
import type {
  AttendanceRecord,
  Connection,
  DepartmentDetail,
  LeaveBalance,
  RoleCode,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";

function monthBounds(year: number, month: number) {
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
}

/**
 * Attendance summary (check-in/out, late and early-leave flags, working hours,
 * leave code per record) plus each person's `AL Balance` and `TOIL Balance`.
 */
export function AttendanceSummary({ role }: { role: RoleCode | null }) {
  const fmt = useMesFormat();
  const t = useTranslations("planning.attendance");
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [departmentId, setDepartmentId] = useState("ALL");

  const companyScope = seesCompanyCalendar(role);
  const departmentsQuery = useApiQuery<{ departments: DepartmentDetail[] }>(
    DEPARTMENTS_QUERY,
    {},
    { enabled: companyScope, liveArea: "users" },
  );

  const { from, to } = monthBounds(year, month);
  const filter = {
    departmentId: departmentId === "ALL" ? undefined : departmentId,
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
  };

  const attendance = useApiQuery<{
    attendanceRecords: Connection<AttendanceRecord>;
  }>(
    ATTENDANCE_RECORDS_QUERY,
    { filter, offset: 0, limit: 200 },
    {
      liveArea: "leave",
    },
  );

  const balances = useApiQuery<{ leaveBalances: LeaveBalance[] }>(
    LEAVE_BALANCES_QUERY,
    {},
    { liveArea: "leave" },
  );

  const monthLabel = fmt.monthYear(from);

  const balanceRows = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; AL: number; TOIL: number }
    >();
    for (const balance of balances.data?.leaveBalances ?? []) {
      const existing = map.get(balance.user.id) ?? {
        id: balance.user.id,
        name: balance.user.fullName,
        AL: 0,
        TOIL: 0,
      };
      if (balance.leaveCode === "AL") existing.AL = balance.balanceDays;
      if (balance.leaveCode === "TOIL") existing.TOIL = balance.balanceDays;
      map.set(balance.user.id, existing);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [balances.data]);

  const shiftMonth = (delta: number) => {
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth() + 1);
  };

  const records = attendance.data?.attendanceRecords.nodes ?? [];

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionHeader
          title={t("title")}
          description={t("description")}
          action={
            <ExportButton
              mutation={EXPORT_ATTENDANCE_MUTATION}
              resultKey="exportAttendance"
              label={t("export")}
              variables={{ filter, format: "XLSX" }}
            />
          }
        >
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => shiftMonth(-1)}
              >
                ‹
              </Button>
              <span className="text-sm font-medium">{monthLabel}</span>
              <Button variant="outline" size="sm" onClick={() => shiftMonth(1)}>
                ›
              </Button>
            </div>
            {companyScope ? (
              <div className="grid gap-1">
                <Label htmlFor="attendance-department">
                  {t("departmentLabel")}
                </Label>
                <Select
                  value={departmentId}
                  onValueChange={(value) => setDepartmentId(value ?? "ALL")}
                  items={{
                    ALL: t("allDepartments"),
                    ...Object.fromEntries(
                      (departmentsQuery.data?.departments ?? []).map(
                        (department) => [department.id, department.name],
                      ),
                    ),
                  }}
                >
                  <SelectTrigger id="attendance-department" className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">{t("allDepartments")}</SelectItem>
                    {(departmentsQuery.data?.departments ?? []).map(
                      (department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
        </SectionHeader>

        {attendance.error ? (
          <ErrorState error={attendance.error} onRetry={attendance.refetch} />
        ) : null}
        {attendance.loading && !attendance.data ? (
          <LoadingState label={t("loading")} rows={5} />
        ) : null}

        {attendance.data && records.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : null}

        {records.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">{t("colEmployee")}</TableHead>
                <TableHead className="w-28">{t("colDate")}</TableHead>
                <TableHead className="w-24">{t("colCheckIn")}</TableHead>
                <TableHead className="w-24">{t("colCheckOut")}</TableHead>
                <TableHead className="w-20">{t("colLate")}</TableHead>
                <TableHead className="w-24">{t("colEarlyLeave")}</TableHead>
                <TableHead className="w-24">{t("colHours")}</TableHead>
                <TableHead className="w-28">{t("colLeave")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="text-xs">
                    {record.user.fullName}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.date(record.workDate)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.time(record.checkIn)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.time(record.checkOut)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {record.isLate ? t("yes") : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {record.isEarlyLeave ? t("yes") : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.decimal(record.workingHours)}
                  </TableCell>
                  <TableCell>
                    {record.leaveCode ? (
                      <StateBadge
                        code={record.leaveCode}
                        variant="leave"
                        compact
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>

      <section>
        <SectionHeader
          title={t("balancesTitle")}
          description={t("balancesDescription")}
        />
        {balances.error ? (
          <ErrorState error={balances.error} onRetry={balances.refetch} />
        ) : null}
        {balances.loading && !balances.data ? (
          <LoadingState label={t("loadingBalances")} rows={4} />
        ) : null}

        {balances.data && balanceRows.length === 0 ? (
          <EmptyState
            title={t("noBalancesTitle")}
            description={t("noBalancesDescription")}
          />
        ) : null}

        {balanceRows.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEmployee")}</TableHead>
                <TableHead className="w-32">{t("colAlBalance")}</TableHead>
                <TableHead className="w-32">{t("colToilBalance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm">{row.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.decimal(row.AL)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.decimal(row.TOIL)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </div>
  );
}
