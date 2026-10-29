/**
 * The Performance period selection tests.
 *
 * Covers each frame's expansion, a selection that mixes shapes, the
 * de-duplication of a month two keys cover, the default keys, the bounded
 * option window, and the locale-aware period labels.
 */

import { describe, expect, test } from "bun:test";
import { createFormatter } from "next-intl";
import {
  AUDIT_TIME_FRAMES,
  defaultPeriodKeys,
  monthKey,
  monthsForSelection,
  PERIOD_OPTION_WINDOW,
  periodOptions,
  quarterKey,
  quarterOf,
  yearKey,
} from "./audit-period";
import { periodLabeler } from "./i18n/format";

/** A fixed "now" so the default keys and the option window never drift. */
const NOW = new Date("2026-10-15T00:00:00.000Z");

describe("audit time frames", () => {
  test("offer month, quarter and year only — never week", () => {
    expect([...AUDIT_TIME_FRAMES]).toEqual(["month", "quarter", "year"]);
    expect(
      AUDIT_TIME_FRAMES.includes("week" as (typeof AUDIT_TIME_FRAMES)[number]),
    ).toBe(false);
  });

  test("quarterOf maps each month to its calendar quarter", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(quarterOf)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4,
    ]);
  });
});

describe("monthsForSelection", () => {
  test("a month key covers that month", () => {
    expect(monthsForSelection([monthKey(2026, 7)])).toEqual([
      { periodYear: 2026, periodMonth: 7 },
    ]);
  });

  test("a quarter key covers the three months of its quarter", () => {
    expect(monthsForSelection([quarterKey(2026, 3)])).toEqual([
      { periodYear: 2026, periodMonth: 7 },
      { periodYear: 2026, periodMonth: 8 },
      { periodYear: 2026, periodMonth: 9 },
    ]);
  });

  test("a quarter never straddles a year", () => {
    // December is Q4 of its own year, not a quarter spanning into the next.
    expect(monthsForSelection([quarterKey(2026, 4)])).toEqual([
      { periodYear: 2026, periodMonth: 10 },
      { periodYear: 2026, periodMonth: 11 },
      { periodYear: 2026, periodMonth: 12 },
    ]);
    // January is Q1 of its own year, not a quarter reaching back into Dec.
    expect(monthsForSelection([quarterKey(2027, 1)])).toEqual([
      { periodYear: 2027, periodMonth: 1 },
      { periodYear: 2027, periodMonth: 2 },
      { periodYear: 2027, periodMonth: 3 },
    ]);
  });

  test("a year key covers its twelve months, in order", () => {
    const months = monthsForSelection([yearKey(2026)]);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ periodYear: 2026, periodMonth: 1 });
    expect(months[11]).toEqual({ periodYear: 2026, periodMonth: 12 });
  });

  test("a mixed selection covers the months of every shape it names", () => {
    const months = monthsForSelection([quarterKey(2026, 3), monthKey(2025, 2)]);
    expect(months).toEqual([
      { periodYear: 2025, periodMonth: 2 },
      { periodYear: 2026, periodMonth: 7 },
      { periodYear: 2026, periodMonth: 8 },
      { periodYear: 2026, periodMonth: 9 },
    ]);
  });

  test("the months come back oldest first", () => {
    const months = monthsForSelection([
      monthKey(2026, 5),
      monthKey(2024, 12),
      monthKey(2026, 1),
    ]);
    expect(months.map((month) => month.periodYear)).toEqual([2024, 2026, 2026]);
    expect(months.map((month) => month.periodMonth)).toEqual([12, 1, 5]);
  });

  test("a month two keys cover is counted once", () => {
    const months = monthsForSelection([
      quarterKey(2026, 3),
      monthKey(2026, 8),
      monthKey(2026, 8),
    ]);
    expect(months).toHaveLength(3);
    expect(months.map((month) => month.periodMonth)).toEqual([7, 8, 9]);
  });

  test("an unreadable key is skipped rather than throwing", () => {
    expect(monthsForSelection(["not-a-period", monthKey(2026, 5)])).toEqual([
      { periodYear: 2026, periodMonth: 5 },
    ]);
  });
});

describe("defaultPeriodKeys", () => {
  test("the month frame starts on the current month", () => {
    expect(defaultPeriodKeys("month", NOW)).toEqual(["2026-10"]);
  });

  test("the quarter frame starts on the current quarter", () => {
    expect(defaultPeriodKeys("quarter", NOW)).toEqual(["2026-Q4"]);
  });

  test("the year frame starts on the current year", () => {
    expect(defaultPeriodKeys("year", NOW)).toEqual(["2026"]);
  });

  test("the current quarter is the one the current month falls in", () => {
    expect(
      defaultPeriodKeys("quarter", new Date("2026-03-01T00:00:00.000Z")),
    ).toEqual(["2026-Q1"]);
    expect(
      defaultPeriodKeys("quarter", new Date("2026-07-01T00:00:00.000Z")),
    ).toEqual(["2026-Q3"]);
  });
});

describe("periodOptions", () => {
  test("each frame offers a bounded number of options", () => {
    expect(periodOptions("month", NOW)).toHaveLength(
      PERIOD_OPTION_WINDOW.month,
    );
    expect(periodOptions("quarter", NOW)).toHaveLength(
      PERIOD_OPTION_WINDOW.quarter,
    );
    expect(periodOptions("year", NOW)).toHaveLength(PERIOD_OPTION_WINDOW.year);
  });

  test("the month window is the three calendar years ending with this year", () => {
    const options = periodOptions("month", NOW);
    expect(options[0]).toBe("2026-12");
    expect(options.at(-1)).toBe("2024-01");
    expect(options).toContain("2026-01");
    expect(options).not.toContain("2027-01");
  });

  test("the quarter window is the same three years", () => {
    const options = periodOptions("quarter", NOW);
    expect(options[0]).toBe("2026-Q4");
    expect(options.at(-1)).toBe("2024-Q1");
    expect(options).not.toContain("2027-Q1");
  });

  test("the year window is seven years, biased to the past", () => {
    const options = periodOptions("year", NOW);
    expect(options).toEqual([
      "2027",
      "2026",
      "2025",
      "2024",
      "2023",
      "2022",
      "2021",
    ]);
  });
});

describe("period labels", () => {
  // The labels only format dates, so an empty catalogue is enough.
  const formatter = (locale: string) =>
    createFormatter({ locale, messages: {}, onError: () => {} });
  const en = periodLabeler(formatter("en"));
  const vi = periodLabeler(formatter("vi"));

  test("a month reads as its name and year, not raw numbers", () => {
    expect(en.periodMonth(2026, 10)).toBe("October 2026");
    expect(vi.periodMonth(2026, 10)).toBe("tháng 10 năm 2026");
  });

  test("a quarter reads as the months it covers", () => {
    expect(en.periodQuarter(2026, 3)).toBe("Jul – Sep 2026");
    expect(en.periodQuarter(2026, 1)).toBe("Jan – Mar 2026");
    expect(vi.periodQuarter(2026, 3)).toContain("2026");
  });

  test("a year reads as its year", () => {
    expect(en.periodYear(2026)).toBe("2026");
    expect(vi.periodYear(2026)).toBe("2026");
  });

  test("several periods read as one joined label", () => {
    expect(en.periodSummary(["October 2026", "November 2026"])).toContain(
      "October 2026",
    );
    expect(en.periodSummary(["October 2026", "November 2026"])).toContain(
      "November 2026",
    );
    expect(en.periodSummary([])).toBe("—");
  });
});
