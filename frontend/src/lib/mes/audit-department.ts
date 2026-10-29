/**
 * Department resolution for the audit surface's per-department employee grain.
 *
 * Pure so the defaulting rule is unit-testable without data: a chosen
 * department wins, the viewer's own department is the fallback so the scope
 * opens on real rows rather than a prompt, and neither leaves `null` for the
 * caller to turn into a "choose a department" prompt.
 */

/**
 * The department the per-department grain should read.
 *
 * Takes precedence in order: the viewer's explicit choice, then their own
 * department, then `null` when neither is known.
 */
export function effectiveDepartmentId(
  selectedDepartmentId: string | null | undefined,
  viewerDepartmentId: string | null | undefined,
): string | null {
  if (
    typeof selectedDepartmentId === "string" &&
    selectedDepartmentId.length > 0
  ) {
    return selectedDepartmentId;
  }
  if (typeof viewerDepartmentId === "string" && viewerDepartmentId.length > 0) {
    return viewerDepartmentId;
  }
  return null;
}
