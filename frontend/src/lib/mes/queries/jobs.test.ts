/**
 * Query-selection contract tests for `TASK_QUERY`.
 *
 * A selection set is the whole contract between a component and the API: a
 * field the component reads but the query never selects arrives as `undefined`
 * and crashes at the point of use. `TaskCompletionReview` renders a journey
 * entry's `task.id`, so the `journey` selection has to carry `task` — an
 * omission that is invisible to the type system, because the client's
 * `TaskCompletionRequest` declares `task` as non-nullable.
 */

import { describe, expect, test } from "bun:test";
import { TASK_QUERY } from "./jobs";

/** The balanced body of `<field> { ... }`, with the braces removed. */
function selectionBodyOf(query: string, field: string): string {
  const start = query.indexOf(`${field} {`);
  expect(start, `${field} is selected`).toBeGreaterThan(-1);
  const bodyStart = start + field.length + 2; // past `field {`
  let depth = 0;
  for (let index = start + field.length; index < query.length; index += 1) {
    if (query[index] === "{") depth += 1;
    if (query[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return query.slice(bodyStart, index);
      }
    }
  }
  throw new Error(`${field} is not a balanced selection set`);
}

/**
 * The field names a selection body asks for, at its own depth only — a nested
 * set is not a field of this one.
 */
function fieldNamesOf(body: string): string[] {
  const names: string[] = [];
  let depth = 0;
  // A field at this depth ends the line; selection-set openers are followed by
  // a `{`, and `${...}` interpolations carry no field names of interest.
  const lines = body.replace(/\$\{[^}]*\}/g, "").split("\n");
  for (const line of lines) {
    const opener = line.match(/^\s*(\w+)\s*\{/);
    if (opener && depth === 0) names.push(opener[1]);
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth > 0) continue;
    const leaf = line.match(/^\s*(\w+)\s*$/);
    if (leaf) names.push(leaf[1]);
  }
  return names;
}

describe("TASK_QUERY journey entries", () => {
  const body = selectionBodyOf(TASK_QUERY, "journey");
  const fields = fieldNamesOf(body);

  test("select the ticket the entry belongs to", () => {
    // Without this, `request.task` is `undefined` and the review surface
    // crashes the moment it tries to attach a required-fix file.
    expect(fields).toContain("task");
  });

  test("select the ticket's id, which the attachment field needs", () => {
    const ticketFields = fieldNamesOf(selectionBodyOf(body, "task"));
    expect(ticketFields).toContain("id");
    expect(ticketFields).toContain("taskCode");
  });

  test("select everything else the review surface dereferences", () => {
    for (const required of [
      "id",
      "scope",
      "title",
      "state",
      "reviewComment",
      "reviewedAt",
      "createdAt",
      "updatedAt",
      "user",
      "reviewedBy",
      "attachments",
      "decisionAttachments",
    ]) {
      expect(fields, `journey selects ${required}`).toContain(required);
    }
  });
});
