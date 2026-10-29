/**
 * Personal KPI score trend points.
 *
 * Pure so the gap handling is unit-testable without mounting React: the
 * component supplies the localized month names, this module decides that a
 * missing month is a zero bar rather than a hole in the axis.
 */

/** One monthly period a Performance read covers. */
export interface TrendMonth {
  periodYear: number;
  periodMonth: number;
}

/** The slice of a monthly KPI total the trend needs. */
export interface MonthlyScore {
  periodYear: number;
  periodMonth: number;
  totalKpiScore: number;
}

export interface TrendPoints {
  labels: string[];
  values: number[];
}

/**
 * The selected months as chart points.
 *
 * Exactly the selected months are plotted, in the order they were selected, so
 * the chart always describes the period the rest of the screen describes. A
 * selected month with no recorded total plots as a zero-height bar instead of
 * being dropped — a missing month is information, not a gap in the data.
 *
 * A total for a month the selection does not cover is ignored, so the chart can
 * never show a period the screen did not ask for.
 */
export function selectedScorePoints(
  months: readonly TrendMonth[],
  totals: readonly MonthlyScore[],
  monthLabel: (periodYear: number, periodMonth: number) => string,
): TrendPoints {
  const byMonth = new Map<string, number>();
  for (const total of totals) {
    if (
      !Number.isInteger(total.periodYear) ||
      !Number.isInteger(total.periodMonth) ||
      total.periodMonth < 1 ||
      total.periodMonth > 12
    ) {
      continue;
    }
    const identity = `${total.periodYear}-${total.periodMonth}`;
    byMonth.set(identity, (byMonth.get(identity) ?? 0) + total.totalKpiScore);
  }

  const labels: string[] = [];
  const values: number[] = [];
  const seen = new Set<string>();
  for (const month of months) {
    const identity = `${month.periodYear}-${month.periodMonth}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    labels.push(monthLabel(month.periodYear, month.periodMonth));
    values.push(byMonth.get(identity) ?? 0);
  }
  return { labels, values };
}
