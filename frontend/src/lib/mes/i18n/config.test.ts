import { describe, expect, test } from "bun:test";
import { DEFAULT_LOCALE, parseMesLocale, readMesLocaleCookie } from "./config";

describe("locale cookie parsing", () => {
  test("falls back to English for a missing value", () => {
    expect(parseMesLocale(undefined)).toBe("en");
    expect(parseMesLocale(null)).toBe("en");
    expect(parseMesLocale("")).toBe("en");
    expect(readMesLocaleCookie("")).toBe("en");
    expect(readMesLocaleCookie("session=abc; theme=light")).toBe("en");
  });

  test("falls back to English for an unknown value", () => {
    expect(parseMesLocale("fr")).toBe("en");
    expect(parseMesLocale("VIETNAMESE")).toBe("en");
    expect(readMesLocaleCookie("mes_locale=fr")).toBe("en");
    expect(readMesLocaleCookie("mes_locale=vi-VN")).toBe("en");
  });

  test("adopts a stored supported locale", () => {
    expect(parseMesLocale("vi")).toBe("vi");
    expect(readMesLocaleCookie("mes_locale=vi")).toBe("vi");
    expect(readMesLocaleCookie("session=abc; mes_locale=vi; theme=light")).toBe(
      "vi",
    );
  });

  test("trims surrounding whitespace and the default stays English", () => {
    expect(readMesLocaleCookie("mes_locale= vi ")).toBe("vi");
    expect(readMesLocaleCookie("mes_locale=en")).toBe(DEFAULT_LOCALE);
  });
});
