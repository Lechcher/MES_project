"use client";

import { BarChart } from "./bar-chart";
import {
  type MonthlyScore,
  selectedScorePoints,
  type TrendMonth,
} from "./score-trend";

/**
 * Personal KPI score by month: the viewer's total score for each month of the
 * selected period. A total score can be negative, so negative months draw in
 * the danger red.
 */
export function ScoreTrendChart({
  months,
  totals,
  seriesLabel,
  monthLabel,
  className,
}: {
  /** The selected months, oldest first. */
  months: readonly TrendMonth[];
  /** Each selected month's total KPI score. */
  totals: readonly MonthlyScore[];
  /** The localized series name, e.g. "KPI score by month". */
  seriesLabel: string;
  /** The localized label of one month. */
  monthLabel: (periodYear: number, periodMonth: number) => string;
  className?: string;
}) {
  const { labels, values } = selectedScorePoints(months, totals, monthLabel);
  return (
    <BarChart
      labels={labels}
      series={{ label: seriesLabel, values }}
      colorNegative
      className={className}
    />
  );
}
