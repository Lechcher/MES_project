/**
 * Pure date-math tests for the schedule grid.
 *
 * Covers every scale's column layout, bar clipping at the range edges,
 * multi-day spans, duration-preserving shifts, strict `DD/MM/YYYY` parsing,
 * and month/year navigation — the grid components consume these results
 * verbatim, so the math has to be right without React.
 */

import { describe, expect, test } from "bun:test";
import type { ScheduledTask } from "@/lib/mes/queries/types";
import {
  columnsFor,
  customRange,
  defaultRange,
  formatDmy,
  isCanonical,
  parseDmy,
  placeBar,
  rangeFromParams,
  rangeParams,
  shiftByColumns,
  step,
  windowFor,
} from "./schedule-range";

/** 09:00 local on the given day. */
function at(day: number, hour = 9): Date {
  return new Date(2026, 9, day, hour, 0, 0, 0); // October 2026
}

function barOf(start: Date | null, end: Date | null): ScheduledTask {
  return {
    id: "t1",
    taskCode: "T-1",
    title: "Ticket",
    description: null,
    project: null,
    taskType: "DAILY",
    priority: "MEDIUM",
    state: "REQ",
    createdBy: null,
    assignedTo: null,
    department: null,
    startDate: start ? start.toISOString() : null,
    endDate: end ? end.toISOString() : null,
    extendedDeadline: null,
    progressPercentage: 0,
    isUrgentHourly: false,
    isExtensionRequested: false,
    isOverdue: false,
    badges: [],
    approvedBy: null,
    approvedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: start ? start.toISOString() : "2026-10-01T00:00:00.000Z",
    updatedAt: start ? start.toISOString() : "2026-10-01T00:00:00.000Z",
  };
}

describe("windowFor", () => {
  test("week starts on Monday and spans seven days", () => {
    const range = windowFor("WEEK", at(21, 15)); // Wednesday 21 Oct 2026
    expect(range.from.getDay()).toBe(1);
    expect(range.from.getDate()).toBe(19);
    expect(diffInDays(range.to, range.from)).toBe(7);
  });

  test("month and year windows are calendar-aligned", () => {
    const month = windowFor("MONTH", at(21, 15));
    expect(month.from.getDate()).toBe(1);
    expect(month.from.getMonth()).toBe(9);
    expect(month.to.getMonth()).toBe(10);

    const year = windowFor("YEAR", at(21, 15));
    expect(year.from.getMonth()).toBe(0);
    expect(year.from.getDate()).toBe(1);
    expect(year.to.getFullYear()).toBe(year.from.getFullYear() + 1);
  });

  test("day window is one local day", () => {
    const day = windowFor("DAY", at(21, 15));
    expect(day.from.getHours()).toBe(0);
    expect(diffInDays(day.to, day.from)).toBe(1);
  });

  test("the default view is the current week", () => {
    const range = defaultRange();
    expect(range.scale).toBe("WEEK");
    expect(isCanonical(range)).toBe(true);
    expect(range.from.getTime()).toBeLessThanOrEqual(Date.now());
    expect(range.to.getTime()).toBeGreaterThan(Date.now());
  });
});

function diffInDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** `parseDmy` with the impossible-date check already covered above. */
function dmy(value: string): Date {
  const date = parseDmy(value);
  if (!date) throw new Error(`unparseable date: ${value}`);
  return date;
}

describe("columnsFor", () => {
  test("day scale yields 24 hour columns", () => {
    const cols = columnsFor(windowFor("DAY", at(21)));
    expect(cols).toHaveLength(24);
    expect(cols[0].getHours()).toBe(0);
    expect(cols[23].getHours()).toBe(23);
  });

  test("week scale yields the seven days", () => {
    const cols = columnsFor(windowFor("WEEK", at(21)));
    expect(cols).toHaveLength(7);
    expect(cols.map((col) => col.getDate())).toEqual([
      19, 20, 21, 22, 23, 24, 25,
    ]);
  });

  test("month scale yields one column per day of the month", () => {
    const cols = columnsFor(windowFor("MONTH", at(21)));
    expect(cols).toHaveLength(31);
    expect(cols[0].getDate()).toBe(1);
    expect(cols[30].getDate()).toBe(31);
  });

  test("year scale yields twelve first-of-month columns", () => {
    const cols = columnsFor(windowFor("YEAR", at(21)));
    expect(cols).toHaveLength(12);
    expect(cols[0].getMonth()).toBe(0);
    expect(cols[11].getMonth()).toBe(11);
    for (const col of cols) expect(col.getDate()).toBe(1);
  });

  test("a custom range yields exactly the entered days", () => {
    const range = customRange(dmy("01/11/2026"), dmy("15/11/2026"));
    const cols = columnsFor(range);
    expect(cols).toHaveLength(15);
    expect(cols[0].getDate()).toBe(1);
    expect(cols[14].getDate()).toBe(15);
  });
});

describe("placeBar", () => {
  const week = windowFor("WEEK", at(21)); // Mon 19 – Mon 26 Oct 2026
  const cols = columnsFor(week);

  test("a same-day ticket occupies one column", () => {
    expect(placeBar(barOf(at(21, 9), at(21, 17)), cols, "WEEK")).toEqual({
      start: 2,
      span: 1,
    });
  });

  test("a multi-day ticket spans its days", () => {
    const start = at(19, 9);
    const end = new Date(2026, 9, 21, 17, 0, 0, 0);
    expect(placeBar(barOf(start, end), cols, "WEEK")).toEqual({
      start: 0,
      span: 3,
    });
  });

  test("a midnight end date is inclusive", () => {
    const start = at(20, 8);
    const end = new Date(2026, 9, 22, 0, 0, 0, 0);
    expect(placeBar(barOf(start, end), cols, "WEEK")).toEqual({
      start: 1,
      span: 3,
    });
  });

  test("bars are clipped at both range edges", () => {
    // Starts the week before, ends the week after.
    const before = barOf(new Date(2026, 9, 16, 9, 0, 0), at(20, 17));
    expect(placeBar(before, cols, "WEEK")).toEqual({ start: 0, span: 2 });

    const after = barOf(at(24, 9), new Date(2026, 9, 28, 17, 0, 0));
    expect(placeBar(after, cols, "WEEK")).toEqual({ start: 5, span: 2 });
  });

  test("tickets outside the range and tickets without a start cannot be placed", () => {
    expect(
      placeBar(barOf(new Date(2026, 10, 3, 9), null), cols, "WEEK"),
    ).toBeNull();
    expect(placeBar(barOf(null, null), cols, "WEEK")).toBeNull();
  });

  test("the day scale places bars by hour slot", () => {
    const dayCols = columnsFor(windowFor("DAY", at(21)));
    const urgent = barOf(
      new Date(2026, 9, 21, 14, 0, 0),
      new Date(2026, 9, 21, 15, 0, 0),
    );
    expect(placeBar(urgent, dayCols, "DAY")).toEqual({ start: 14, span: 1 });

    const late = barOf(new Date(2026, 9, 21, 22, 0, 0), null);
    expect(placeBar(late, dayCols, "DAY")).toEqual({ start: 22, span: 1 });
  });

  test("the year scale places bars by month", () => {
    const yearCols = columnsFor(windowFor("YEAR", at(21)));
    const quarter = barOf(
      new Date(2026, 2, 15, 9, 0, 0),
      new Date(2026, 4, 30, 17, 0, 0),
    );
    expect(placeBar(quarter, yearCols, "YEAR")).toEqual({ start: 2, span: 3 });
  });
});

describe("shiftByColumns", () => {
  test("a day-column shift preserves the duration and the time of day", () => {
    const task = barOf(at(19, 9), new Date(2026, 9, 21, 17, 0, 0));
    const moved = shiftByColumns(task, 2, "WEEK");
    expect(moved.startDate).toBe(new Date(2026, 9, 21, 9).toISOString());
    expect(moved.endDate).toBe(new Date(2026, 9, 23, 17).toISOString());
  });

  test("a day-scale shift moves by hours", () => {
    const task = barOf(
      new Date(2026, 9, 21, 14, 0, 0),
      new Date(2026, 9, 21, 15, 0, 0),
    );
    const moved = shiftByColumns(task, 2, "DAY");
    expect(moved.startDate).toBe(new Date(2026, 9, 21, 16).toISOString());
    expect(moved.endDate).toBe(new Date(2026, 9, 21, 17).toISOString());
  });

  test("a year-scale shift moves by months", () => {
    const task = barOf(
      new Date(2026, 2, 15, 9, 0, 0),
      new Date(2026, 4, 30, 17, 0, 0),
    );
    const moved = shiftByColumns(task, 3, "YEAR");
    expect(moved.startDate).toBe(new Date(2026, 5, 15, 9).toISOString());
    expect(moved.endDate).toBe(new Date(2026, 7, 30, 17).toISOString());
  });

  test("a ticket without an end date keeps the shift and an empty end", () => {
    const task = barOf(at(19, 9), null);
    const moved = shiftByColumns(task, 1, "WEEK");
    expect(moved.startDate).toBe(new Date(2026, 9, 20, 9).toISOString());
    expect(moved.endDate).toBe("");
  });
});

describe("parseDmy and formatDmy", () => {
  test("parses DD/MM/YYYY in local time", () => {
    const date = parseDmy("05/11/2026");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(5);
  });

  test("rejects impossible and malformed dates", () => {
    expect(parseDmy("31/02/2026")).toBeNull();
    expect(parseDmy("2026/11/05")).toBeNull();
    expect(parseDmy("5/11/2026")).toBeNull();
    expect(parseDmy("05/13/2026")).toBeNull();
    expect(parseDmy("")).toBeNull();
  });

  test("formats back to DD/MM/YYYY", () => {
    expect(formatDmy(new Date(2026, 10, 5))).toBe("05/11/2026");
    expect(formatDmy(new Date(2026, 0, 31))).toBe("31/01/2026");
  });
});

describe("step", () => {
  test("month scale steps to the following calendar month", () => {
    const october = windowFor("MONTH", at(21));
    const november = step(october, 1);
    expect(november.from.getMonth()).toBe(10);
    expect(november.to.getMonth()).toBe(11);
    expect(columnsFor(november)).toHaveLength(30);
    expect(step(november, -1).from.getMonth()).toBe(9);
  });

  test("year scale steps to the following calendar year", () => {
    const y2026 = windowFor("YEAR", at(21));
    const y2027 = step(y2026, 1);
    expect(y2027.from.getFullYear()).toBe(2027);
    expect(y2027.to.getFullYear()).toBe(2028);
    expect(step(y2027, -1).from.getFullYear()).toBe(2026);
  });

  test("week and day scales step by seven days and one day", () => {
    const week = windowFor("WEEK", at(21));
    expect(step(week, 1).from.getDate()).toBe(26);
    const day = windowFor("DAY", at(21));
    expect(step(day, -1).from.getDate()).toBe(20);
  });

  test("a custom range slides by its own length", () => {
    const range = customRange(dmy("01/11/2026"), dmy("15/11/2026"));
    const next = step(range, 1);
    expect(next.from.getDate()).toBe(16);
    expect(next.from.getMonth()).toBe(10);
    expect(columnsFor(next)).toHaveLength(15);
    expect(isCanonical(range)).toBe(false);
  });
});

describe("URL round-trip", () => {
  test("canonical ranges serialize without `to` and restore", () => {
    const range = windowFor("WEEK", at(21));
    const params = rangeParams(range);
    expect(params.to).toBeUndefined();
    expect(rangeFromParams(params.scale, params.from, null)).toEqual(range);
  });

  test("custom ranges keep their exact window", () => {
    const range = customRange(dmy("01/11/2026"), dmy("15/11/2026"));
    const params = rangeParams(range);
    expect(params.to).toBe("2026-11-15");
    expect(rangeFromParams(params.scale, params.from, params.to)).toEqual(
      range,
    );
  });

  test("invalid params fall back to the default week", () => {
    const fallback = rangeFromParams("NOPE", "31/02/2026", null);
    expect(fallback.scale).toBe("WEEK");
    expect(isCanonical(fallback)).toBe(true);
  });
});
