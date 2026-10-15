/**
 * Inverse charcoal footer — the only dark surface on the page (`DESIGN.md`).
 */
export function Footer() {
  return (
    <footer className="mt-auto bg-inverse-canvas text-inverse-ink-muted">
      <div className="mx-auto flex w-full max-w-[1312px] flex-col gap-2 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-inverse-ink">MES Prototype</p>
        <p className="text-xs">
          Project planning, attendance, leave, and performance management —
          mock data only.
        </p>
      </div>
    </footer>
  );
}
