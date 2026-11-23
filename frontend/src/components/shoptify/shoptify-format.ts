/**
 * Shopify money and SKU display helpers.
 *
 * The API carries money as integer minor units; these helpers render it in
 * the active locale through the shared `useMesFormat` decimal formatter.
 */

import { useMesFormat } from "@/lib/mes/i18n/format";

/** `1234` → `12.34` in English; `12,34` in Vietnamese. */
export function useMoneyFormatter() {
  const format = useMesFormat();
  return (minor: number | null | undefined, currency?: string): string => {
    if (minor === null || minor === undefined) return "—";
    const value = format.decimal(minor / 100);
    return currency ? `${value} ${currency}` : value;
  };
}

/** A boolean state as a compact badge label key. */
export function booleanLabel(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}
