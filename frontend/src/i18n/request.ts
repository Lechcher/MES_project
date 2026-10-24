import { getRequestConfig } from "next-intl/server";

/**
 * The server renders the English baseline for every route.
 *
 * The active locale is resolved in the browser by the client
 * `LocaleProvider` (see `src/lib/mes/i18n/provider.tsx`), which reads the
 * `mes_locale` cookie and supplies the matching catalogue to
 * `NextIntlClientProvider`. Keeping the server locale static preserves the
 * Cache Components / partial-prerender classifications.
 */
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../../messages/en.json")).default,
}));
