/**
 * Locale parity for the Jobs completion-request copy.
 *
 * Every message key the completion flow adds must exist in both catalogues: a
 * key that only one locale declares renders a missing-message warning for the
 * viewers who chose the other language, and a screen that is half-translated is
 * worse than one that is not translated at all. This test fails the moment a
 * key is added to a single catalogue.
 */

import { describe, expect, test } from "bun:test";
import en from "../../../../messages/en.json";
import vi from "../../../../messages/vi.json";

/** The namespaces this change writes into. */
const SECTIONS = ["actions", "detail", "review", "attachments"] as const;

type Catalogue = Record<string, Record<string, never>>;

/** Flatten a namespace's keys into a comparable list. */
function keysIn(catalogue: Catalogue, section: string): string[] {
  const namespace = (catalogue as Record<string, Record<string, unknown>>)[
    "jobs"
  ]?.[section];
  if (!namespace) return [];
  return Object.keys(namespace).sort();
}

describe("Jobs completion-request messages", () => {
  for (const section of SECTIONS) {
    test(`jobs.${section} declares the same keys in English and Vietnamese`, () => {
      expect(keysIn(en as unknown as Catalogue, section)).toEqual(
        keysIn(vi as unknown as Catalogue, section),
      );
    });
  }

  test("both catalogues declare the completion-scope labels", () => {
    const scopesIn = (catalogue: Record<string, unknown>) =>
      Object.keys(
        ((catalogue.enums as Record<string, unknown>).completionScopes ??
          {}) as Record<string, unknown>,
      ).sort();
    expect(scopesIn(en)).toEqual(["FULL_JOB", "MILESTONE"]);
    expect(scopesIn(vi)).toEqual(["FULL_JOB", "MILESTONE"]);
  });

  test("neither catalogue leaves a Jobs message empty", () => {
    for (const [label, catalogue] of [
      ["en", en],
      ["vi", vi],
    ] as const) {
      const jobs = (catalogue as unknown as { jobs: Record<string, never> })
        .jobs;
      for (const section of SECTIONS) {
        const namespace = jobs[section];
        for (const [key, value] of Object.entries(namespace ?? {})) {
          expect(typeof value).toBe("string");
          expect(String(value).trim().length).toBeGreaterThan(0);
          if (String(value).trim().length === 0) {
            throw new Error(
              `messages/${label}.json jobs.${section}.${key} is empty`,
            );
          }
        }
      }
    }
  });

  test("Vietnamese copy actually differs from English", () => {
    // A catalogue that merely mirrors English is a placeholder, not a
    // translation, and the parity check above would hide it.
    const jobsEn = (en as unknown as { jobs: Record<string, never> }).jobs;
    const jobsVi = (vi as unknown as { jobs: Record<string, never> }).jobs;
    let identical = 0;
    let total = 0;
    for (const section of SECTIONS) {
      for (const [key, value] of Object.entries(jobsEn[section] ?? {})) {
        total += 1;
        if (jobsVi[section]?.[key] === value) identical += 1;
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(identical).toBe(0);
  });
});
