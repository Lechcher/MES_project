/**
 * Score-composition segment tests.
 *
 * Covers the aggregation the donut chart depends on and, critically, that the
 * rule code never reaches the chart legend — the label comes from the caller's
 * localized resolver, so a bare token cannot survive into display.
 */

import { describe, expect, test } from "bun:test";
import { KPI_RULE_LABELS } from "@/lib/mes/queries/registries";
import { scoreSegments } from "./score-composition";

const COLORS = ["#0f62fe", "#24a148", "#f1c21b"];

/** The real resolver, standing in for `useDomainLabels().kpiRule`. */
const englishRule = (code: string) => KPI_RULE_LABELS[code] ?? code;

describe("score composition segments", () => {
  test("labels a segment by the localized rule name, never the code", () => {
    const [segment] = scoreSegments(
      [{ ruleCode: "KPI_ON_TIME_TICKET", points: 10 }],
      englishRule,
      COLORS,
    );
    expect(segment.label).toBe("On-time ticket (+10)");
    expect(segment.label).not.toContain("KPI_");
  });

  test("aggregates every event of the same rule into one segment", () => {
    const segments = scoreSegments(
      [
        { ruleCode: "KPI_ON_TIME_TICKET", points: 10 },
        { ruleCode: "KPI_OVERDUE_TICKET", points: -15 },
        { ruleCode: "KPI_ON_TIME_TICKET", points: 10 },
      ],
      englishRule,
      COLORS,
    );
    expect(segments).toHaveLength(2);
    expect(segments[0].label).toBe("On-time ticket (+20)");
    expect(segments[1].label).toBe("Overdue ticket (-15)");
    expect(segments[1].value).toBe(-15);
  });

  test("keeps the chart's magnitudes as absolute values for drawing", () => {
    const segments = scoreSegments(
      [{ ruleCode: "KPI_OVERDUE_TICKET", points: -15 }],
      englishRule,
      COLORS,
    );
    // The signed value survives in the label while the chart draws |value|.
    expect(segments[0].value).toBe(-15);
    expect(segments[0].label).toContain("-15");
  });

  test("cycles the palette so many rules still get distinct colors", () => {
    const events = [
      "KPI_ON_TIME_TICKET",
      "KPI_ON_TIME_URGENT",
      "KPI_FIRST_TIME_APPROVAL",
      "KPI_PERFECT_ATTENDANCE",
    ].map((ruleCode) => ({ ruleCode, points: 1 }));
    const segments = scoreSegments(events, englishRule, COLORS);
    expect(segments.map((segment) => segment.color)).toEqual([
      "#0f62fe",
      "#24a148",
      "#f1c21b",
      "#0f62fe",
    ]);
  });

  test("a period with no events produces no segments", () => {
    expect(scoreSegments([], englishRule, COLORS)).toEqual([]);
  });

  test("an unknown rule code still renders a non-empty label", () => {
    const [segment] = scoreSegments(
      [{ ruleCode: "KPI_SOMETHING_NEW", points: 5 }],
      englishRule,
      COLORS,
    );
    expect(segment.label).toBe("KPI_SOMETHING_NEW (+5)");
    expect(segment.label).not.toBe("");
  });
});
