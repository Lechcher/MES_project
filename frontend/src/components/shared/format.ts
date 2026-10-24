/**
 * Locale-independent formatting helpers shared by the app screens.
 *
 * Dates, times, and decimals are locale-aware and live in
 * `src/lib/mes/i18n/format.ts` (`useMesFormat`); only helpers that render
 * identically in every locale stay here.
 */

/** Render JSON audit payloads compactly and safely. */
export function formatJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text === undefined) return "—";
    return text.length > 240 ? `${text.slice(0, 237)}…` : text;
  } catch {
    return String(value);
  }
}

/** `YYYY-MM-DD` for `<input type="date">` values. */
export function toDateInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/** UTC midnight ISO string for a `YYYY-MM-DD` input value. */
export function dateInputToIso(value: string): string {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

/** UTC end-of-day ISO string for a `YYYY-MM-DD` input value. */
export function dateInputToEndOfDayIso(value: string): string {
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}
