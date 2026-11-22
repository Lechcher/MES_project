/**
 * `YYYY-MM-DD` boundary helpers for the calendar pickers.
 *
 * The pickers keep the app's existing string values at their seams, so the
 * conversion lives here, in local time: a picked day renders as the same
 * `YYYY-MM-DD` it started as, with no UTC drift. (Parsing with `new
 * Date(string)` would land on UTC midnight and can display the previous day
 * west of Greenwich.)
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Format a `Date` as `YYYY-MM-DD` in local time. */
export function toIsoDateValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse a `YYYY-MM-DD` value into a local-midnight `Date`, or `undefined`. */
export function parseIsoDateValue(
  value: string | null | undefined,
): Date | undefined {
  if (!value) return undefined;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return undefined;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return undefined;
  // Reject impossible calendar days (for example 2026-02-30), which `Date`
  // would otherwise roll over into March.
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return undefined;
  }
  return date;
}

/** One side of a date range as the app stores it: a `YYYY-MM-DD` string. */
export interface DateRangeValue {
  from: string;
  to: string;
}

/** Convert a range value into the `Date` pair the Calendar understands. */
export function rangeToDates(range: DateRangeValue): {
  from: Date | undefined;
  to: Date | undefined;
} {
  return {
    from: parseIsoDateValue(range.from),
    to: parseIsoDateValue(range.to),
  };
}

/** Convert a Calendar range selection back into the app's range value. */
export function datesToRange(
  selection:
    | {
        from?: Date | undefined;
        to?: Date | undefined;
      }
    | undefined,
): DateRangeValue {
  return {
    from: selection?.from ? toIsoDateValue(selection.from) : "",
    to: selection?.to ? toIsoDateValue(selection.to) : "",
  };
}

/** Human-readable range for the trigger: `From → To`, with gaps shown as `—`. */
export function formatRangeLabel(
  range: DateRangeValue,
  format: (value: string) => string,
): string {
  const from = range.from ? format(range.from) : "—";
  const to = range.to ? format(range.to) : "—";
  return `${from} → ${to}`;
}
