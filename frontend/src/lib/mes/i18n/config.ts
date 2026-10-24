/**
 * Locale contract for the MES frontend.
 *
 * English is the default; Vietnamese is opt-in per viewer. The active locale
 * lives in the `mes_locale` cookie (path `/`, `SameSite=Lax`, one-year
 * max-age, script-readable so the client can set it) and is applied in the
 * browser by the client `LocaleProvider`. The server always renders the
 * English baseline (see `src/i18n/request.ts`).
 */

export const MES_LOCALES = ["en", "vi"] as const;

export type MesLocale = (typeof MES_LOCALES)[number];

export const DEFAULT_LOCALE: MesLocale = "en";

/** Cookie carrying the viewer's language choice across visits. */
export const LOCALE_COOKIE = "mes_locale";

export function isMesLocale(value: string): value is MesLocale {
  return (MES_LOCALES as readonly string[]).includes(value);
}

/**
 * Resolve a raw `mes_locale` cookie value to a supported locale.
 *
 * A missing, empty, or unrecognized value falls back to English, so a
 * stale or hand-edited cookie can never break the interface.
 */
export function parseMesLocale(raw: string | undefined | null): MesLocale {
  if (!raw) return DEFAULT_LOCALE;
  const value = raw.trim();
  return isMesLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * Read the locale from a `document.cookie`-style string (`"a=1; mes_locale=vi"`).
 *
 * Pure on purpose so the fallback behavior is unit-testable without a DOM:
 * a missing or unknown value resolves to English.
 */
export function readMesLocaleCookie(cookieSource: string): MesLocale {
  for (const part of cookieSource.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== LOCALE_COOKIE) continue;
    return parseMesLocale(part.slice(separator + 1));
  }
  return DEFAULT_LOCALE;
}
