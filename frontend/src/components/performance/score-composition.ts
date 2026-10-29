/**
 * Score-composition segments for the personal KPI dashboard.
 *
 * Pure so the label mapping is unit-testable without mounting React: the
 * component passes the domain-label resolver, this module decides how a
 * period's score events aggregate into chart segments.
 */

import type { ChartSegment } from "./donut-chart";

/** The slice of a KPI score event the composition needs. */
export interface CompositionEvent {
  ruleCode: string;
  points: number;
}

/**
 * Aggregate one period's score events into donut segments, one per rule, in
 * first-seen order.
 *
 * The rule code never reaches the segment label: the caller supplies the
 * localized rule name, so a bare token cannot survive into the chart legend.
 */
export function scoreSegments(
  events: readonly CompositionEvent[],
  labelForRule: (ruleCode: string) => string,
  colors: readonly string[],
): ChartSegment[] {
  const totals = new Map<string, number>();
  for (const event of events) {
    totals.set(
      event.ruleCode,
      (totals.get(event.ruleCode) ?? 0) + event.points,
    );
  }
  return [...totals.entries()].map(([ruleCode, points], index) => ({
    label: `${labelForRule(ruleCode)} (${points > 0 ? "+" : ""}${points})`,
    value: points,
    color: colors[index % colors.length],
  }));
}
