/**
 * Effective-department resolution tests.
 *
 * Covers the precedence that keeps the per-department grain from opening on a
 * prompt when the viewer's own department is known, and from narrowing to
 * nothing when a department was never chosen.
 */

import { describe, expect, test } from "bun:test";
import { effectiveDepartmentId } from "./audit-department";

describe("effectiveDepartmentId", () => {
  test("a chosen department wins over the viewer's own", () => {
    expect(effectiveDepartmentId("d-chosen", "d-viewer")).toBe("d-chosen");
  });

  test("falls back to the viewer's own department", () => {
    // The scope then opens on real rows instead of a prompt state.
    expect(effectiveDepartmentId(null, "d-viewer")).toBe("d-viewer");
    expect(effectiveDepartmentId(undefined, "d-viewer")).toBe("d-viewer");
  });

  test("an empty selection falls back rather than narrowing everything away", () => {
    expect(effectiveDepartmentId("", "d-viewer")).toBe("d-viewer");
  });

  test("null when neither a choice nor a viewer department is known", () => {
    // The caller renders the choose-a-department prompt for this case.
    expect(effectiveDepartmentId(null, null)).toBeNull();
    expect(effectiveDepartmentId(undefined, undefined)).toBeNull();
    expect(effectiveDepartmentId("", "")).toBeNull();
  });

  test("a chosen department survives a viewer with no department of their own", () => {
    expect(effectiveDepartmentId("d-chosen", null)).toBe("d-chosen");
  });

  test("precedence holds for every combination", () => {
    const cases: [string | null, string | null, string | null][] = [
      ["a", "b", "a"],
      [null, "b", "b"],
      ["a", null, "a"],
      [null, null, null],
      ["", "b", "b"],
      ["a", "", "a"],
      ["", "", null],
    ];
    for (const [selected, viewer, expected] of cases) {
      expect(effectiveDepartmentId(selected, viewer)).toBe(expected);
    }
  });
});
