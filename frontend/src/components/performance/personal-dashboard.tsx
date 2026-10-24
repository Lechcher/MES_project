"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { ExportButton } from "@/components/shared/export-action";
import { SectionHeader } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  KPI_POINT_RULES_QUERY,
  PERSONAL_KPI_DASHBOARD_QUERY,
  PRINT_KPI_REPORT_MUTATION,
} from "@/lib/mes/queries/performance";
import type {
  KpiPointRule,
  PersonalKpiDashboard,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { type ChartSegment, DonutChart } from "./donut-chart";

const RULE_COLORS = [
  "#0f62fe",
  "#24a148",
  "#f1c21b",
  "#da1e28",
  "#525252",
  "#0043ce",
  "#ee5c25",
  "#8c8c8c",
];

/**
 * Personal KPI Dashboard — available to every role: month selector, score card,
 * donut chart, the viewer's own AL/TOIL balances, and recent score events.
 */
export function PersonalDashboard({
  periodYear,
  periodMonth,
}: {
  periodYear: number;
  periodMonth: number;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("performance.personal");
  const input = { periodYear, periodMonth };
  const dashboard = useApiQuery<{
    personalKpiDashboard: PersonalKpiDashboard;
  }>(PERSONAL_KPI_DASHBOARD_QUERY, { input }, { liveArea: "performance" });
  const rules = useApiQuery<{ kpiPointRules: KpiPointRule[] }>(
    KPI_POINT_RULES_QUERY,
    {},
    { liveArea: "performance" },
  );

  const dash = dashboard.data?.personalKpiDashboard;

  const segments = useMemo<ChartSegment[]>(() => {
    const events = dash?.recentEvents ?? [];
    const totals = new Map<string, number>();
    for (const event of events) {
      totals.set(
        event.ruleCode,
        (totals.get(event.ruleCode) ?? 0) + event.points,
      );
    }
    return [...totals.entries()].map(([ruleCode, points], index) => ({
      label: `${ruleCode} (${points > 0 ? "+" : ""}${points})`,
      value: points,
      color: RULE_COLORS[index % RULE_COLORS.length],
    }));
  }, [dash]);

  const alBalance =
    dash?.leaveBalances.find((balance) => balance.leaveCode === "AL")
      ?.balanceDays ?? 0;
  const toilBalance =
    dash?.leaveBalances.find((balance) => balance.leaveCode === "TOIL")
      ?.balanceDays ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {dashboard.error ? (
        <ErrorState error={dashboard.error} onRetry={dashboard.refetch} />
      ) : null}
      {dashboard.loading && !dash ? (
        <LoadingState label={t("loading")} rows={3} />
      ) : null}

      {dash ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t("scoreCard")}</CardTitle>
                <CardDescription>
                  {`${dash.periodYear}-${String(dash.periodMonth).padStart(2, "0")}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold text-foreground">
                  {dash.totalKpiScore}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("alBalanceCard")}</CardTitle>
                <CardDescription>{t("alBalanceDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold text-foreground">
                  {fmt.decimal(alBalance)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("toilBalanceCard")}</CardTitle>
                <CardDescription>{t("toilBalanceDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold text-foreground">
                  {fmt.decimal(toilBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <SectionHeader
                title={t("compositionTitle")}
                description={t("compositionDesc")}
              />
              {segments.length === 0 ? (
                <EmptyState
                  title={t("noEventsTitle")}
                  description={t("noEventsDesc")}
                />
              ) : (
                <div className="h-64 w-full border border-border p-2">
                  <DonutChart className="h-full w-full" segments={segments} />
                </div>
              )}
            </div>
            <div>
              <SectionHeader
                title={t("recentTitle")}
                description={t("recentDesc")}
                action={
                  <ExportButton
                    mutation={PRINT_KPI_REPORT_MUTATION}
                    resultKey="printKpiEeport"
                    label={t("printPersonal")}
                    variables={{ input }}
                  />
                }
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">{t("colWhen")}</TableHead>
                    <TableHead>{t("colRule")}</TableHead>
                    <TableHead className="w-20">{t("colPoints")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dash.recentEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-xs">
                        {fmt.dateTime(event.occurredAt)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {event.ruleCode}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.points > 0 ? "+" : ""}
                        {event.points}
                      </TableCell>
                    </TableRow>
                  ))}
                  {dash.recentEvents.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="py-4 text-center text-muted-foreground"
                      >
                        {t("noEventsRow")}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </section>

          {dash.summary ? (
            <section>
              <SectionHeader
                title={t("summaryTitle")}
                description={t("summaryDesc")}
              />
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("colMetric")}</TableHead>
                    <TableHead className="w-32">{t("colValue")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    [t("metricTotalTasks"), dash.summary.totalTasksAssigned],
                    [t("metricCompletedOnTime"), dash.summary.completedOnTime],
                    [t("metricOverdue"), dash.summary.overdueTasks],
                    [t("metricReturned"), dash.summary.rejectedTasks],
                    [
                      t("metricExtensions"),
                      dash.summary.extensionRequestsCount,
                    ],
                    [
                      t("metricUnapprovedLeave"),
                      dash.summary.unapprovedLeaveCount,
                    ],
                    [
                      t("metricAttendanceRate"),
                      fmt.decimal(dash.summary.attendanceRate),
                    ],
                    [
                      t("metricPerfectBonus"),
                      dash.summary.perfectAttendanceBonus,
                    ],
                  ].map(([label, value]) => (
                    <TableRow key={String(label)}>
                      <TableCell className="text-xs">{label}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {value}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ) : null}
        </>
      ) : null}

      <section>
        <SectionHeader title={t("rulesTitle")} description={t("rulesDesc")} />
        {rules.error ? (
          <ErrorState error={rules.error} onRetry={rules.refetch} />
        ) : null}
        {rules.loading && !rules.data ? <LoadingState rows={3} /> : null}
        {rules.data ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colEvent")}</TableHead>
                <TableHead className="w-20">{t("colPoints")}</TableHead>
                <TableHead>{t("colDescription")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.data.kpiPointRules.map((rule) => (
                <TableRow key={rule.code}>
                  <TableCell className="text-xs">{rule.event}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {rule.points > 0 ? "+" : ""}
                    {rule.points}
                  </TableCell>
                  <TableCell className="text-xs">
                    {rule.description ?? "—"}
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
