/**
 * Assignee selection identity for the create form's combobox.
 *
 * Pure so the uniqueness rules are unit-testable without mounting React: the
 * preselected default and the dropdown list deliver the same employee as two
 * distinct objects, and the combobox must treat them as one selection —
 * otherwise a second click appends a chip under a key React already used.
 */

/** The shape every assignee option and every selection entry shares. */
export interface AssigneeIdentifiable {
  id: string;
}

/**
 * Two selections are the same employee when their ids match.
 *
 * This is the equality the multi-select combobox needs: Base UI compares a
 * picked item against the selection with `Object.is` unless told otherwise,
 * which treats the preselected creator and their dropdown entry as two people.
 */
export function isSameAssignee(
  a: AssigneeIdentifiable,
  b: AssigneeIdentifiable,
): boolean {
  return a.id === b.id;
}

/**
 * Keeps the first occurrence of each employee id, preserving selection order.
 *
 * Ticket creation maps the selection to one ticket per employee "in the chosen
 * order", so a duplicate drops its later copy rather than reordering.
 */
export function dedupeAssignees<T extends AssigneeIdentifiable>(
  assignees: T[],
): T[] {
  const seen = new Set<string>();
  return assignees.filter((assignee) => {
    if (seen.has(assignee.id)) return false;
    seen.add(assignee.id);
    return true;
  });
}
