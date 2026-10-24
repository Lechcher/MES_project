/**
 * Domain label bridge tests.
 *
 * The bridge resolves through the catalogue first, the registry's canonical
 * English name second, and the code itself last, so an unknown value always
 * passes through unchanged instead of being blanked.
 */

import { describe, expect, test } from "bun:test";
import { labelFor, PRIORITY_LABELS } from "../queries/registries";
import {
  type DomainTranslatorFn,
  resolveDomainLabel,
  resolveTaskStateBadgeLabel,
} from "./labels";

/** A translator whose catalogue knows only `priorities.MEDIUM`. */
const partialCatalogue: DomainTranslatorFn = Object.assign(
  (key: string) => (key === "priorities.MEDIUM" ? "Trung bình" : key),
  { has: (key: string) => key === "priorities.MEDIUM" },
);

/** A translator whose catalogue is empty (the pre-localization behavior). */
const emptyCatalogue: DomainTranslatorFn = Object.assign((key: string) => key, {
  has: () => false,
});

describe("domain labels bridge fallback", () => {
  test("an unknown code is returned unchanged", () => {
    expect(
      resolveDomainLabel(
        emptyCatalogue,
        "priorities",
        "UNKNOWN_CODE",
        undefined,
      ),
    ).toBe("UNKNOWN_CODE");
    expect(
      resolveDomainLabel(
        partialCatalogue,
        "ticketStates",
        "non-enum-string",
        undefined,
      ),
    ).toBe("non-enum-string");
  });

  test("a known code falls back to the registry name without a catalogue message", () => {
    expect(
      resolveDomainLabel(emptyCatalogue, "priorities", "MEDIUM", "Medium"),
    ).toBe("Medium");
  });

  test("a catalogue message wins over the registry name", () => {
    expect(
      resolveDomainLabel(partialCatalogue, "priorities", "MEDIUM", "Medium"),
    ).toBe("Trung bình");
  });

  test("the live progress badge interpolates its percentage", () => {
    expect(
      resolveTaskStateBadgeLabel(partialCatalogue, "PROGRESS_UPDATE", 45),
    ).toBe("Active — Progress Update (45%)");
    expect(
      resolveTaskStateBadgeLabel(emptyCatalogue, "URGENT_PROCESSING"),
    ).toBe("Active — Urgent Processing");
    expect(resolveTaskStateBadgeLabel(emptyCatalogue, "UNKNOWN_BADGE")).toBe(
      "UNKNOWN_BADGE",
    );
  });

  test("the registry's own pass-through stays intact", () => {
    expect(labelFor("UNKNOWN_CODE", PRIORITY_LABELS)).toBe("UNKNOWN_CODE");
    expect(labelFor("non-enum-string", {})).toBe("non-enum-string");
  });
});
