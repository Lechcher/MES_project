/**
 * The Performance period selection.
 *
 * One selection names a time frame and the periods of that frame the viewer
 * picked; one function expands it into the ordered, de-duplicated months every
 * Performance read covers. The KPI tables are keyed by `(periodYear,
 * periodMonth)`, so a quarter or a year has to be assembled from its months.
 * Pure so the expansion and the option window are unit-testable without data.
 */

/** The audit time frames the surface offers. A Week frame is absent by design. */
export const AUDIT_TIME_FRAMES = ["month", "quarter", "year"] as const;

export type AuditTimeFrame = (typeof AUDIT_TIME_FRAMES)[number];

/** One monthly period a Performance read covers. */
export interface AuditPeriod {
  periodYear: number;
  /** 1-12. */
  periodMonth: number;
}

/**
 * One period selection.
 *
 * A key is `YYYY-MM` for the month frame, `YYYY-Qn` for the quarter frame, and
 * `YYYY` for the year frame. The frame names the unit the picker offers; the
 * expansion reads each key by its own shape, so a selection that mixes shapes
 * still covers exactly the months it names.
 */
export interface PeriodSelection {
  frame: AuditTimeFrame;
  keys: string[];
}

/** How many options each frame's picker offers. */
export const PERIOD_OPTION_WINDOW = {
  month: 36,
  quarter: 12,
  year: 7,
} as const satisfies Record<AuditTimeFrame, number>;

const MONTH_KEY = /^(\d{4})-(\d{2})$/;
const QUARTER_KEY = /^(\d{4})-Q([1-4])$/;
const YEAR_KEY = /^(\d{4})$/;

/** The calendar quarter (1-4) a month falls in. */
export function quarterOf(periodMonth: number): number {
  return Math.floor((clampMonth(periodMonth) - 1) / 3) + 1;
}

function clampMonth(periodMonth: number): number {
  if (!Number.isFinite(periodMonth)) return 1;
  return Math.min(12, Math.max(1, Math.trunc(periodMonth)));
}

function clampYear(periodYear: number): number {
  return Number.isFinite(periodYear)
    ? Math.trunc(periodYear)
    : new Date().getUTCFullYear();
}

/** The key a month is addressed by. */
export function monthKey(periodYear: number, periodMonth: number): string {
  return `${clampYear(periodYear)}-${String(clampMonth(periodMonth)).padStart(2, "0")}`;
}

/** The key a quarter is addressed by. */
export function quarterKey(periodYear: number, quarter: number): string {
  const bounded = Math.min(4, Math.max(1, Math.trunc(quarter)));
  return `${clampYear(periodYear)}-Q${bounded}`;
}

/** The key a year is addressed by. */
export function yearKey(periodYear: number): string {
  return String(clampYear(periodYear));
}

function parseMonthKey(key: string): AuditPeriod | null {
  const match = MONTH_KEY.exec(key);
  if (!match) return null;
  const periodMonth = Number(match[2]);
  if (periodMonth < 1 || periodMonth > 12) return null;
  return { periodYear: Number(match[1]), periodMonth };
}

function parseQuarterKey(
  key: string,
): { periodYear: number; quarter: number } | null {
  const match = QUARTER_KEY.exec(key);
  if (!match) return null;
  return { periodYear: Number(match[1]), quarter: Number(match[2]) };
}

function parseYearKey(key: string): number | null {
  const match = YEAR_KEY.exec(key);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * The months a selection covers, oldest first, without duplicates.
 *
 * Each key is expanded by its own shape: a month key covers one month, a
 * quarter key covers the three months of its quarter (quarters never straddle
 * a year), and a year key covers its twelve months. A month two keys cover —
 * a quarter and a month inside it — is counted once.
 */
export function monthsForSelection(keys: readonly string[]): AuditPeriod[] {
  const months: AuditPeriod[] = [];
  const seen = new Set<string>();

  const add = (periodYear: number, periodMonth: number): void => {
    const identity = `${periodYear}-${periodMonth}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    months.push({ periodYear, periodMonth });
  };

  for (const key of keys) {
    const month = parseMonthKey(key);
    if (month) {
      add(month.periodYear, month.periodMonth);
      continue;
    }

    const quarter = parseQuarterKey(key);
    if (quarter) {
      const firstMonth = (quarter.quarter - 1) * 3 + 1;
      for (let offset = 0; offset < 3; offset += 1) {
        add(quarter.periodYear, firstMonth + offset);
      }
      continue;
    }

    const year = parseYearKey(key);
    if (year === null) continue;
    for (let periodMonth = 1; periodMonth <= 12; periodMonth += 1) {
      add(year, periodMonth);
    }
  }

  return months.sort(
    (a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth,
  );
}

/** The current period of a frame — the selection a fresh screen starts from. */
export function defaultPeriodKeys(
  frame: AuditTimeFrame,
  now: Date = new Date(),
): string[] {
  const periodYear = now.getUTCFullYear();
  const periodMonth = now.getUTCMonth() + 1;

  if (frame === "month") return [monthKey(periodYear, periodMonth)];
  if (frame === "quarter")
    return [quarterKey(periodYear, quarterOf(periodMonth))];
  return [yearKey(periodYear)];
}

/**
 * The periods a frame's picker offers, newest first.
 *
 * The window is bounded so the list stays usable and a selection cannot ask
 * for an unbounded number of reads: 36 months (the three calendar years ending
 * with the current year), 12 quarters (the same three years), and 7 years
 * (five before the current year and one after). The window is derived from the
 * current date rather than from the data, so it needs no read to render and
 * cannot change when a summary is recorded.
 */
export function periodOptions(
  frame: AuditTimeFrame,
  now: Date = new Date(),
): string[] {
  const periodYear = now.getUTCFullYear();

  if (frame === "month") {
    const options: string[] = [];
    for (let year = periodYear; year >= periodYear - 2; year -= 1) {
      for (let month = 12; month >= 1; month -= 1) {
        options.push(monthKey(year, month));
      }
    }
    return options;
  }

  if (frame === "quarter") {
    const options: string[] = [];
    for (let year = periodYear; year >= periodYear - 2; year -= 1) {
      for (let quarter = 4; quarter >= 1; quarter -= 1) {
        options.push(quarterKey(year, quarter));
      }
    }
    return options;
  }

  const options: string[] = [];
  for (let year = periodYear + 1; year >= periodYear - 5; year -= 1) {
    options.push(yearKey(year));
  }
  return options;
}
