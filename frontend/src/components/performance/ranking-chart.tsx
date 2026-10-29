"use client";

import { BarChart } from "./bar-chart";

/**
 * Performance score ranking chart: one bar per ranked row, highest first, in
 * the scope and time frame the audit surface currently shows.
 */
export function RankingChart({
  labels,
  values,
  seriesLabel,
  colorNegative = false,
  className,
}: {
  labels: string[];
  values: number[];
  /** The localized series name for this ranking, e.g. "Total performance score". */
  seriesLabel: string;
  /** Paint negative scores in the danger red rather than the accent. */
  colorNegative?: boolean;
  className?: string;
}) {
  return (
    <BarChart
      labels={labels}
      series={{ label: seriesLabel, values }}
      colorNegative={colorNegative}
      className={className}
    />
  );
}
