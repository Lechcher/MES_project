/**
 * Personal KPI score trend tests.
 *
 * Covers the axis the chart promises — exactly the selected months, in order —
 * and, critically, that a selected month with no recorded total stays on the
 * axis as a zero bar rather than being dropped, because a dropped month would
 * silently relabel every later bar.
 */

import { describe, expect, test } from "bun:test";
import { selectedScorePoints } from "./score-trend";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** A month's chart label, standing in for the locale's short month name. */
const monthLabel = (periodYear: number, periodMonth: number) =>
  `${MONTHS[periodMonth - 1] ?? String(periodMonth)} ${periodYear}`;

describe("selected score points", () => {
  test("exactly the selected months are plotted, in order", () => {
    const { labels, values } = selectedScorePoints(
      [
        { periodYear: 2026, periodMonth: 1 },
        { periodYear: 2026, periodMonth: 4 },
        { periodYear: 2026, periodMonth: 12 },
      ],
      [],
      monthLabel,
    );
    expect(labels).toEqual(["Jan 2026", "Apr 2026", "Dec 2026"]);
    expect(values).toHaveLength(3);
  });

  test("a selected month with no recorded total is a zero bar", () => {
    const { values } = selectedScorePoints(
      [
        { periodYear: 2026, periodMonth: 1 },
        { periodYear: 2026, periodMonth: 2 },
        { periodYear: 2026, periodMonth: 3 },
      ],
      [
        { periodYear: 2026, periodMonth: 1, totalKpiScore: 40 },
        { periodYear: 2026, periodMonth: 3, totalKpiScore: -15 },
      ],
      monthLabel,
    );
    expect(values).toEqual([40, 0, -15]);
  });

  test("a total outside the selection does not reach the chart", () => {
    const { labels, values } = selectedScorePoints(
      [{ periodYear: 2026, periodMonth: 1 }],
      [
        { periodYear: 2025, periodMonth: 1, totalKpiScore: 999 },
        { periodYear: 2026, periodMonth: 1, totalKpiScore: 12 },
      ],
      monthLabel,
    );
    expect(labels).toEqual(["Jan 2026"]);
    expect(values).toEqual([12]);
  });

  test("a month selected twice is plotted once", () => {
    const { labels, values } = selectedScorePoints(
      [
        { periodYear: 2026, periodMonth: 3 },
        { periodYear: 2026, periodMonth: 3 },
      ],
      [{ periodYear: 2026, periodMonth: 3, totalKpiScore: 20 }],
      monthLabel,
    );
    expect(labels).toHaveLength(1);
    expect(values).toEqual([20]);
  });

  test("a duplicate total aggregates instead of overwriting", () => {
    const { values } = selectedScorePoints(
      [{ periodYear: 2026, periodMonth: 3 }],
      [
        { periodYear: 2026, periodMonth: 3, totalKpiScore: 20 },
        { periodYear: 2026, periodMonth: 3, totalKpiScore: 5 },
      ],
      monthLabel,
    );
    expect(values).toEqual([25]);
  });

  test("an out-of-range total is ignored rather than breaking the axis", () => {
    const { values } = selectedScorePoints(
      [{ periodYear: 2026, periodMonth: 2 }],
      [
        { periodYear: 2026, periodMonth: 0, totalKpiScore: 50 },
        { periodYear: 2026, periodMonth: 13, totalKpiScore: 50 },
        { periodYear: 2026, periodMonth: 2, totalKpiScore: 7 },
      ],
      monthLabel,
    );
    expect(values).toEqual([7]);
  });

  test("an empty selection plots nothing", () => {
    const { labels, values } = selectedScorePoints([], [], monthLabel);
    expect(labels).toEqual([]);
    expect(values).toEqual([]);
  });
});
