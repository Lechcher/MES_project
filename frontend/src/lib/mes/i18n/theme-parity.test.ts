/**
 * Locale parity for the theme selector copy.
 *
 * Every message key the theme selector adds must exist in both catalogues: a
 * key that only one locale declares renders a missing-message warning for the
 * viewers who chose the other language, and a half-translated preference
 * control is worse than one that is not translated at all. This test fails
 * the moment a key is added to a single catalogue.
 */

import { describe, expect, test } from "bun:test";
import en from "../../../../messages/en.json";
import vi from "../../../../messages/vi.json";

/** The namespace the theme selector writes into. */
const SECTION = "theme";

type Catalogue = Record<string, Record<string, unknown>>;

/** Flatten the namespace's keys into a comparable list. */
function keysIn(catalogue: Catalogue, section: string): string[] {
  const namespace = (catalogue as Record<string, Record<string, unknown>>)
    .shell?.[section] as Record<string, unknown>;
  if (!namespace) return [];
  return Object.keys(namespace).sort();
}

describe("Theme selector messages", () => {
  test("shell.theme declares the same keys in English and Vietnamese", () => {
    expect(keysIn(en as unknown as Catalogue, SECTION)).toEqual(
      keysIn(vi as unknown as Catalogue, SECTION),
    );
  });

  test("both catalogues declare the selector's label and three modes", () => {
    for (const catalogue of [en, vi]) {
      const shell = (catalogue as unknown as { shell: Record<string, never> })
        .shell;
      const namespace = (shell?.[SECTION] ?? {}) as Record<string, string>;
      expect(namespace.switchTheme).toBeDefined();
      expect(Object.keys(namespace).length).toBeGreaterThanOrEqual(4);
    }
  });

  test("neither catalogue leaves a theme message empty", () => {
    for (const [label, catalogue] of [
      ["en", en],
      ["vi", vi],
    ] as const) {
      const shell = (catalogue as unknown as { shell: Record<string, never> })
        .shell;
      const namespace = (shell?.[SECTION] ?? {}) as Record<string, string>;
      for (const [key, value] of Object.entries(namespace)) {
        expect(typeof value, `${label}.${key} is not a string`).toBe("string");
        expect(
          String(value).trim().length,
          `messages/${label}.json shell.${SECTION}.${key} is empty`,
        ).toBeGreaterThan(0);
      }
    }
  });

  test("Vietnamese copy actually differs from English", () => {
    // A catalogue that merely mirrors English is a placeholder, not a
    // translation, and the parity check above would hide it.
    const enShell = (en as unknown as { shell: Record<string, never> }).shell;
    const viShell = (vi as unknown as { shell: Record<string, never> }).shell;
    let identical = 0;
    let total = 0;
    for (const [key, value] of Object.entries(
      (enShell?.[SECTION] ?? {}) as Record<string, string>,
    )) {
      total += 1;
      if (viShell?.[SECTION]?.[key] === value) identical += 1;
    }
    expect(total).toBeGreaterThan(0);
    expect(identical).toBe(0);
  });
});
