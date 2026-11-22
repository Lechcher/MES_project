/**
 * Assignee selection tests.
 *
 * Covers the identity contract the create form's combobox relies on without
 * mounting React: the preselected creator and their own dropdown entry are two
 * distinct objects describing the same employee, and the selection must hold
 * that employee once. The toggle mirrors Base UI's multiple-selection decision
 * (`@base-ui/react` `combobox/root/AriaCombobox.js`): an item already in the
 * selection is removed, a new one appended.
 */

import { describe, expect, test } from "bun:test";
import { dedupeAssignees, isSameAssignee } from "./assignee-selection";

const alice = { id: "u-1", userCode: "E001", fullName: "Alice" };
const aliceCopy = { id: "u-1", userCode: "E001", fullName: "Alice" };
const bob = { id: "u-2", userCode: "E002", fullName: "Bob" };

/** The same remove-or-append step Base UI performs on a picked item. */
function toggleMultiple<T extends { id: string }>(selected: T[], item: T): T[] {
  const isCurrentlySelected = selected.some((each) =>
    isSameAssignee(each, item),
  );
  return isCurrentlySelected
    ? selected.filter((each) => !isSameAssignee(each, item))
    : [...selected, item];
}

describe("assignee equality", () => {
  test("the same employee as two distinct objects compares equal", () => {
    expect(isSameAssignee(alice, aliceCopy)).toBe(true);
  });

  test("different employees do not compare equal", () => {
    expect(isSameAssignee(alice, bob)).toBe(false);
  });
});

describe("assignee toggle", () => {
  test("re-selecting an assigned employee removes them instead of appending", () => {
    // The default selection is a locally built object; the picked item is the
    // same employee from the option list.
    expect(toggleMultiple([alice], aliceCopy)).toEqual([]);
  });

  test("picking a new employee appends to the selection", () => {
    expect(toggleMultiple([alice], bob)).toEqual([alice, bob]);
  });
});

describe("assignee de-duplication", () => {
  test("keeps the first occurrence of each id in selection order", () => {
    expect(dedupeAssignees([alice, bob, aliceCopy])).toEqual([alice, bob]);
  });

  test("leaves an already-clean selection untouched", () => {
    expect(dedupeAssignees([alice, bob])).toEqual([alice, bob]);
    expect(dedupeAssignees([])).toEqual([]);
  });
});
