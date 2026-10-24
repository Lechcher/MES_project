import type { MesLocale } from "./src/lib/mes/i18n/config";

/**
 * Typed message catalogues for next-intl.
 *
 * `messages/en.json` is the source of truth: every key the UI may request is
 * typed from its shape, so an invented key fails `tsc` while a real one
 * passes. `messages/vi.json` mirrors the same key set (a catalogue parity
 * test enforces this), so one augmentation covers every locale.
 */
declare module "next-intl" {
  interface AppConfig {
    /**
     * The catalogue locales plus the `en-GB` Intl tag the English catalogue
     * formats with, preserving the date/time conventions the app has always
     * used (day before month, 24-hour clock) instead of US ones.
     */
    Locale: MesLocale | "en-GB";
    Messages: typeof import("./messages/en.json");
  }
}
