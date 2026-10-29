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
import type { AuditPeriod } from "@/lib/mes/audit-period";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
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
import { scoreSegments } from "./score-composition";
import { ScoreTrendChart } from "./score-trend-chart";

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
 * Personal KPI Dashboard — available to every role: the selected period's
 * aggregate score card, the viewer's own AL/TOIL balances, the score-by-month
 * trend over the selected months, the score composition donut, recent score
 * events, and the period summary.
 *
 * The period is the app's shared selection, so the dashboard always describes
 * the same months as the audit surface, the print action, and the export
 * action.
 */
export function PersonalDashboard({
  months,
  periodLabel,
}: {
  /** The months the shared selection covers, oldest first. */
  months: AuditPeriod[];
  /** The selected periods, pre-formatted in the active locale. */
  periodLabel: string;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("performance.personal");
  const labels = useDomainLabels();
  const input = {
    months: months.map((month) => ({
      periodYear: month.periodYear,
      periodMonth: month.periodMonth,
    })),
  };
  const dashboard = useApiQuery<{
    personalKpiDashboard: PersonalKpiDashboard;
  }>(PERSONAL_KPI_DASHBOARD_QUERY, { input }, { liveArea: "performance" });
  const rules = useApiQuery<{ kpiPointRules: KpiPointRule[] }>(
    KPI_POINT_RULES_QUERY,
    {},
    { liveArea: "performance" },
  );

  const dash = dashboard.data?.personalKpiDashboard;

  const segments = useMemo<ChartSegment[]>(
    () => scoreSegments(dash?.recentEvents ?? [], labels.kpiRule, RULE_COLORS),
    [dash, labels],
  );

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
                  {t("scoreCardDesc", { period: periodLabel })}
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

          <section>
            <SectionHeader
              title={t("trendTitle")}
              description={t("trendDesc", { period: periodLabel })}
            />
            {months.length === 0 ? (
              <EmptyState
                title={t("trendEmptyTitle")}
                description={t("trendEmptyDesc")}
              />
            ) : (
              <div className="h-64 w-full border border-border p-2">
                <ScoreTrendChart
                  className="h-full w-full"
                  months={months}
                  totals={dash.monthlyTotals}
                  seriesLabel={t("trendSeriesLabel")}
                  monthLabel={(periodYear, periodMonth) =>
                    fmt.monthYear(
                      new Date(Date.UTC(periodYear, periodMonth - 1, 1)),
                    )
                  }
                />
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <SectionHeader
                title={t("compositionTitle")}
                description={t("compositionDesc", { period: periodLabel })}
              />
              {segments.length === 0 ? (
                <EmptyState
                  title={t("noEventsTitle")}
                  description={t("noEventsDesc", { period: periodLabel })}
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
                description={t("recentDesc", { period: periodLabel })}
                action={
                  <ExportButton
                    mutation={PRINT_KPI_REPORT_MUTATION}
                    resultKey="printKpiReport"
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
                        {labels.kpiRule(event.ruleCode)}
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
                description={t("summaryDesc", { period: periodLabel })}
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
                  <TableCell className="text-xs">
                    {labels.kpiRule(rule.code)}
                  </TableCell>
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
