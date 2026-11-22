/**
 * `YYYY-MM-DD` boundary tests for the calendar pickers' seams.
 *
 * The pickers hand the app the same string values the old `<input type="date">`
 * did, so the conversions must round-trip exactly, in local time, and reject
 * what the old native input refused.
 */

import { describe, expect, test } from "bun:test";
import {
  datesToRange,
  parseIsoDateValue,
  rangeToDates,
  toIsoDateValue,
} from "./date-values";

describe("parseIsoDateValue", () => {
  test("parses a valid value to local midnight", () => {
    const date = parseIsoDateValue("2026-10-28");
    expect(date).toBeDefined();
    if (!date) return;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9); // October
    expect(date.getDate()).toBe(28);
    expect(date.getHours()).toBe(0);
  });

  test("returns undefined for an empty value", () => {
    expect(parseIsoDateValue("")).toBeUndefined();
    expect(parseIsoDateValue(null)).toBeUndefined();
    expect(parseIsoDateValue(undefined)).toBeUndefined();
  });

  test("returns undefined for malformed and impossible dates", () => {
    expect(parseIsoDateValue("28/10/2026")).toBeUndefined();
    expect(parseIsoDateValue("2026-13-01")).toBeUndefined();
    expect(parseIsoDateValue("not-a-date")).toBeUndefined();
    // February 30th would silently roll into March; refuse it instead.
    expect(parseIsoDateValue("2026-02-30")).toBeUndefined();
  });
});

describe("toIsoDateValue", () => {
  test("formats local date parts, zero-padded", () => {
    expect(toIsoDateValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDateValue(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  test("round-trips whatever parseIsoDateValue accepts", () => {
    for (const iso of [
      "2026-01-01",
      "2026-02-28",
      "2026-10-28",
      "2027-07-04",
    ]) {
      const parsed = parseIsoDateValue(iso);
      expect(parsed).toBeDefined();
      if (!parsed) continue;
      expect(toIsoDateValue(parsed)).toBe(iso);
    }
  });
});

describe("range conversions", () => {
  test("converts both sides and back", () => {
    const value = { from: "2026-10-01", to: "2026-10-31" };
    const dates = rangeToDates(value);
    expect(dates.from).toBeDefined();
    expect(dates.to).toBeDefined();
    expect(datesToRange(dates)).toEqual(value);
  });

  test("keeps an unset side empty through a conversion", () => {
    expect(rangeToDates({ from: "", to: "2026-10-31" })).toEqual({
      from: undefined,
      to: expect.any(Date),
    });
    expect(datesToRange({ from: new Date(2026, 9, 1) })).toEqual({
      from: "2026-10-01",
      to: "",
    });
    expect(datesToRange(undefined)).toEqual({ from: "", to: "" });
  });
});
