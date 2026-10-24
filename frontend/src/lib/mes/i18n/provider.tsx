"use client";

/**
 * Client locale provider.
 *
 * Holds the active locale, starting at the English default so the first
 * client render matches the server-rendered English baseline. On mount it
 * adopts the `mes_locale` cookie; a change updates the running interface
 * without a reload, writes the cookie for later visits, and keeps
 * `document.documentElement.lang` in step. The server tree never reads the
 * cookie, so the static/partial-prerender classifications are untouched.
 */

import { NextIntlClientProvider } from "next-intl";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import en from "../../../../messages/en.json";
import vi from "../../../../messages/vi.json";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type MesLocale,
  readMesLocaleCookie,
} from "./config";

/** One catalogue per supported locale, keyed by locale. */
const CATALOGUES = { en, vi } as const;

/**
 * The Intl locale tag each catalogue formats with. English keeps the en-GB
 * conventions the app has always used; Vietnamese follows its own.
 */
const INTL_LOCALES: Record<MesLocale, "en-GB" | "vi"> = {
  en: "en-GB",
  vi: "vi",
};

interface LocaleChoice {
  locale: MesLocale;
  /** Apply a locale now and remember it for later visits. */
  setLocale: (locale: MesLocale) => void;
}

const LocaleContext = createContext<LocaleChoice | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<MesLocale>(DEFAULT_LOCALE);

  // Adopt a stored choice once, after hydration.
  useEffect(() => {
    const stored = readMesLocaleCookie(document.cookie);
    setLocaleState((current) => (stored === current ? current : stored));
  }, []);

  // Keep the document's declared language in step with the active locale.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: MesLocale) => {
    setLocaleState(next);
    // The design pins a plain, script-readable cookie (path=/, SameSite=Lax,
    // one year) rather than the Cookie Store API, so the preference survives
    // in every browser the prototype targets.
    // biome-ignore lint/suspicious/noDocumentCookie: deliberate cookie write per the locale design
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  // Dates render in the viewer's own timezone, exactly as the previous
  // `toLocaleDateString` calls did; naming it explicitly keeps next-intl's
  // formatter deterministic instead of falling back to the environment zone.
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider
        locale={INTL_LOCALES[locale]}
        timeZone={timeZone}
        messages={CATALOGUES[locale]}
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

/** The viewer's locale choice, for the language switcher. */
export function useLocaleChoice(): LocaleChoice {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocaleChoice must be used within LocaleProvider");
  }
  return value;
}
