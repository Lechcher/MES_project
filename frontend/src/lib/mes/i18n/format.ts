/**
 * Locale-aware formatting for the MES screens.
 *
 * Dates, times, and numbers follow the active locale (see `./config.ts`), so a
 * Vietnamese viewer reads `25/10/2026` and `1,5` where an English viewer reads
 * `10/25/2026` and `1.5`. `useMesFormat` returns the memoized helper set every
 * screen uses; the byte helper is exported standalone so a component that only
 * formats a file size does not need the whole hook.
 */

import { type DateTimeFormatOptions, useFormatter } from "next-intl";
import { useMemo } from "react";

const DATE_OPTIONS: DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const DATE_TIME_OPTIONS: DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const TIME_OPTIONS: DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const MONTH_YEAR_OPTIONS: DateTimeFormatOptions = {
  month: "long",
  year: "numeric",
};

const MONTH_SHORT_OPTIONS: DateTimeFormatOptions = {
  month: "short",
};

const YEAR_OPTIONS: DateTimeFormatOptions = {
  year: "numeric",
};

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Human-readable byte count for attachment sizes.
 *
 * Binary units (1 KiB = 1024 B) because the sizes come from files, and one
 * decimal at most — "1,5 MB" in Vietnamese, "1.5 MB" in English.
 */
export function formatBytes(bytes: number, separator = "."): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rendered =
    value === Math.trunc(value) ? String(value) : value.toFixed(1);
  return `${rendered.replace(".", separator)} ${units[unit]}`;
}

export interface MesFormat {
  /** `10/25/2026` in English; `25/10/2026` in Vietnamese. */
  date(value?: string | null): string;
  /** `10/25/2026, 14:30`. */
  dateTime(value?: string | null): string;
  /** `14:30`. */
  time(value?: string | null): string;
  /** `October 2026`; `tháng 10 2026`. */
  monthYear(date: Date): string;
  /** `Mon`; `T2`. */
  weekdayShort(date: Date): string;
  /** `Oct`; `thg 10`. */
  monthShort(date: Date): string;
  /** At most one decimal; the separator follows the active locale. */
  decimal(value?: number | null): string;
  /** Byte sizes such as `1.5 MB` / `1,5 MB`. */
  bytes(value?: number | null): string;
  /** `October 2026`; `tháng 10 2026`. */
  periodMonth(periodYear: number, periodMonth: number): string;
  /** `Jul – Sep 2026`; the quarter's months in the locale's month names. */
  periodQuarter(periodYear: number, quarter: number): string;
  /** `2026`. */
  periodYear(periodYear: number): string;
  /** The selected periods' labels, joined into one label. */
  periodSummary(labels: readonly string[]): string;
}

/** The formatter next-intl hands the screens. */
export type MesFormatter = ReturnType<typeof useFormatter>;

/**
 * The labels a period selection needs, built from a locale's formatter.
 *
 * The month names come from the locale, so a selected month reads `October
 * 2026` in English and `tháng 10 2026` in Vietnamese rather than a raw
 * `2026-10`.
 */
export function periodLabeler(
  format: MesFormatter,
): Pick<
  MesFormat,
  "periodMonth" | "periodQuarter" | "periodYear" | "periodSummary"
> {
  const yearOf = (periodYear: number): string =>
    format.dateTime(new Date(Date.UTC(periodYear, 0, 1)), YEAR_OPTIONS);

  return {
    periodMonth: (periodYear: number, periodMonth: number) =>
      format.dateTime(
        new Date(
          Date.UTC(periodYear, Math.min(12, Math.max(1, periodMonth)) - 1, 1),
        ),
        MONTH_YEAR_OPTIONS,
      ),
    periodQuarter: (periodYear: number, quarter: number) => {
      const bounded = Math.min(4, Math.max(1, Math.trunc(quarter)));
      const firstMonth = (bounded - 1) * 3 + 1;
      const from = format.dateTime(
        new Date(Date.UTC(periodYear, firstMonth - 1, 1)),
        MONTH_SHORT_OPTIONS,
      );
      const to = format.dateTime(
        new Date(Date.UTC(periodYear, firstMonth + 1, 1)),
        MONTH_SHORT_OPTIONS,
      );
      return `${from} – ${to} ${yearOf(periodYear)}`;
    },
    periodYear: (periodYear: number) => yearOf(periodYear),
    periodSummary: (labels: readonly string[]) => {
      if (labels.length === 0) return "—";
      return format.list([...labels], { type: "conjunction", style: "long" });
    },
  };
}

/**
 * The memoized formatter set every screen uses.
 *
 * The active locale comes from the `LocaleProvider`, so the same screen renders
 * differently for each viewer without a reload.
 */
/** The decimal separator the formatter's own locale uses. */
function separatorFrom(format: ReturnType<typeof useFormatter>): string {
  const sample = format.number(1.5, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const separator = sample.replace(/[\d\s\u00a0]/g, "").at(-1);
  return separator ?? ".";
}

export function useMesFormat(): MesFormat {
  const format = useFormatter();

  return useMemo(() => {
    // The separator comes from the locale's own number formatting, so the byte
    // helper agrees with `decimal` without a second locale source.
    const separator = separatorFrom(format);
    return {
      date: (value?: string | null) => {
        const date = toDate(value);
        return date ? format.dateTime(date, DATE_OPTIONS) : "—";
      },
      dateTime: (value?: string | null) => {
        const date = toDate(value);
        return date ? format.dateTime(date, DATE_TIME_OPTIONS) : "—";
      },
      time: (value?: string | null) => {
        const date = toDate(value);
        return date ? format.dateTime(date, TIME_OPTIONS) : "—";
      },
      monthYear: (date: Date) => format.dateTime(date, MONTH_YEAR_OPTIONS),
      weekdayShort: (date: Date) => format.dateTime(date, { weekday: "short" }),
      monthShort: (date: Date) => format.dateTime(date, { month: "short" }),
      decimal: (value?: number | null) => {
        if (value === null || value === undefined || Number.isNaN(value)) {
          return "—";
        }
        return Number.isInteger(value)
          ? format.number(value)
          : format.number(value, {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
            });
      },
      bytes: (value?: number | null) =>
        value === null || value === undefined || Number.isNaN(value)
          ? "—"
          : formatBytes(value, separator),
      ...periodLabeler(format),
    };
  }, [format]);
}
