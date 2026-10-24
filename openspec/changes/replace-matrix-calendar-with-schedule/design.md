# Design

## Context

- `frontend/src/components/planning/matrix-calendar.tsx` renders `matrixCalendar`
  as a month × day `Table`; it is read-only and month-locked.
- Tasks already carry everything a schedule needs (`backend/src/db/schema.ts`
  `tasks`): `taskType` (`HOURLY | DAILY | MULTI_DAY`), `priority`
  (`LOW..URGENT`), `assignedTo`, `departmentId`, `startDate`, `endDate`,
  `progressPercentage`, `isUrgentHourly`, `deletedAt`. No migration.
- The API has no edit/delete/move for tasks and no file upload path; GraphQL
  runs over JSON (`frontend/src/app/api/mes/graphql/route.ts`).
- Data fetching is `useApiQuery` + live areas (`lib/mes/queries/use-api.ts`);
  exports use `useServerExport` / `ExportButton` returning an artifact URL.
- Role helpers live in `lib/mes/queries/access.ts` (frontend) and
  `graphql/access.ts` `OPERATIONS` (backend, server-authoritative).
- `@neodrag/solid` is installed but unused; React needs `@neodrag/react@next`.

## Goals / Non-Goals

**Goals:** one Schedule component tree replacing the matrix calendar; server
enforced write scope; drag/copy with optimistic update and rollback; import and
export via the existing report engine.

**Non-Goals:** resizing bars by dragging edges (edit dates in the editor);
recurring shifts; new ticket states; offline editing; a global state library;
virtualization beyond what one department needs (revisit above ~200 rows).

## Decisions

### D1. Component breakdown

```
components/planning/schedule/
  schedule-view.tsx      // container: range state, queries, permissions
  schedule-toolbar.tsx   // ‹ Today ›, scale toggle, DD/MM/YYYY range, dept, Import/Export/New
  schedule-grid.tsx      // CSS grid: sticky employee column + time columns + rows
  ticket-bar.tsx         // one bar; neodrag; category styling; context menu
  task-editor-dialog.tsx // Dialog + Tabs (Details / Time / Notes), stars, state tag
  import-dialog.tsx      // template download, upload, preview table, commit
  schedule-range.ts      // pure date math (scale → columns, bar placement, snapping)
  schedule-range.test.ts
```

`planning-view.tsx` swaps `MatrixCalendarView` for `ScheduleView`;
`matrix-calendar.tsx` is deleted. Six UI files plus one pure module keeps each
under the 500-line rule. All controls use existing shadcn primitives (`Dialog`,
`Tabs`, `Select`, `Input`, `Button`, `Badge`, `DropdownMenu`, `Table`).

### D2. Data structures

```ts
// lib/mes/queries/types.ts
export type ScheduleScale = "DAY" | "WEEK" | "MONTH" | "YEAR";

export interface ScheduleRange {
  scale: ScheduleScale;
  from: Date; // inclusive, local midnight
  to: Date;   // exclusive
}

export interface ScheduledTask {
  id: string;
  taskCode: string;
  title: string;
  description: string | null;
  taskType: TaskType;      // HOURLY | DAILY | MULTI_DAY = the 3 categories
  priority: Priority;      // LOW..URGENT = 1..4 stars
  state: TicketStateCode;
  startDate: string | null;
  endDate: string | null;
  progressPercentage: number;
  isUrgentHourly: boolean;
  assignedTo: UserBrief | null;
  department: DepartmentBrief | null;
}

export interface UpdateTaskInput {
  taskId: string;
  title?: string;
  description?: string | null;
  taskType?: TaskType;
  priority?: Priority;
  assignedToId?: string;
  departmentId?: string;
  startDate?: string;
  endDate?: string;
  isUrgentHourly?: boolean;
}

export interface TaskImportRow {
  line: number;
  values: Record<string, string>;
  errors: string[];
}
```

GraphQL additions (contract mirrored into `API_CONTACT_SPECIFICATION.md`):

```graphql
input ScheduleInput { departmentId: ID, fromDate: DateTime!, toDate: DateTime!, state: TicketStateCode }
input UpdateTaskInput { taskId: ID!, title: String, description: String, taskType: TaskType,
  priority: Priority, assignedToId: ID, departmentId: ID, startDate: DateTime,
  endDate: DateTime, isUrgentHourly: Boolean }
input DuplicateTaskInput { taskId: ID!, assignedToId: ID, startDate: DateTime }
input ImportFileInput { fileName: String!, contentBase64: String! }
type TaskImportRow { line: Int!, values: JSON!, errors: [String!]! }
type TaskImportPreview { rows: [TaskImportRow!]!, validCount: Int!, errorCount: Int! }

extend type Query { scheduledTasks(input: ScheduleInput!): [Task!]! }
extend type Mutation {
  updateTask(input: UpdateTaskInput!): Task!
  deleteTask(taskId: ID!): Boolean!
  duplicateTask(input: DuplicateTaskInput!): Task!
  previewTaskImport(file: ImportFileInput!): TaskImportPreview!
  commitTaskImport(file: ImportFileInput!): [Task!]!
  exportSchedule(input: ScheduleInput!, format: ExportFormat = XLSX): ExportResult!
  taskImportTemplate(format: ExportFormat = XLSX): ExportResult!
}
```

If the schema has no `JSON` scalar, `values` becomes `[KeyValue!]!`; decide
when editing `schema.ts`.

### D3. State management: URL + server cache, no store

- Range state (`scale`, `from`, `departmentId`) lives in URL search params
  (`useSearchParams` + `router.replace`) so views are shareable and survive
  reload. Default: `scale=WEEK`, `from` = Monday of today.
- Server data: `useApiQuery(SCHEDULED_TASKS_QUERY, { input }, { liveArea: "tickets" })`
  plus the existing `matrixCalendar` query for leave/attendance marks.
- Optimistic drag: `ScheduleView` holds `pending: Map<taskId, Partial<ScheduledTask>>`
  merged over query data; cleared on success (refetch) or failure (rollback +
  toast). No Zustand/Redux: one screen, one owner.
- Editor/import dialog open state is local `useState` in `ScheduleView`.

### D4. Grid geometry is pure and tested

`schedule-range.ts` owns all date math so the UI stays dumb:

```ts
export function columnsFor(r: ScheduleRange): Date[];          // hours | days | months
export function placeBar(t: ScheduledTask, cols: Date[], scale: ScheduleScale):
  { start: number; span: number } | null;                       // clipped to range
export function shiftByColumns(t: ScheduledTask, delta: number, scale: ScheduleScale):
  { startDate: string; endDate: string };                       // preserves duration
export function parseDmy(s: string): Date | null;               // "DD/MM/YYYY", rejects 31/02
export function step(r: ScheduleRange, dir: -1 | 1): ScheduleRange;
```

Grid uses CSS Grid (`grid-template-columns: 14rem repeat(n, minmax(var(--col),1fr))`)
with bars as `grid-column: start / span n` inside a per-row grid, so placement
needs no measurement. Columns snap because each bar's position is an integer
column index.

### D5. Drag with `@neodrag/react`

Each bar uses neodrag's `useDraggable` with a grid snap of `[colWidth, rowHeight]`
read from the grid's `ResizeObserver`, `bounds` = grid body, and
`disabled` when `!canWrite`. On drag end:

```ts
const dx = Math.round(offset.x / colWidth);
const dy = Math.round(offset.y / rowHeight);
const target = rows[rowIndex + dy];
if (!dx && !dy) return reset();
const dates = shiftByColumns(task, dx, scale);
const copy = event.altKey;
mutate(copy ? DUPLICATE_TASK : UPDATE_TASK, {
  input: copy
    ? { taskId: task.id, assignedToId: target.id, startDate: dates.startDate }
    : { taskId: task.id, assignedToId: target.id, ...dates },
});
```

The bar's transform resets after drop; its new position comes from merged
state, so DOM and data never disagree. Keyboard alternative: bar context menu
"Move…"/"Duplicate" opens the editor (accessibility).

Alternatives: native HTML5 DnD (no snapping, poor touch); dnd-kit (larger,
user asked for Neodrag).

### D6. Category styling

One map, no per-category components:

```ts
const CATEGORY = {
  DAILY:     { icon: CalendarDays, className: "border-l-4 border-l-primary" },
  MULTI_DAY: { icon: CalendarRange, className: "border-l-4 border-l-[#8a3ffc]" }, // + progress bar
  HOURLY:    { icon: Zap,          className: "border-l-4 border-l-destructive" }, // + hour slot
} satisfies Record<TaskType, { icon: LucideIcon; className: string }>;
```

Fill color stays the ticket-state color from `TICKET_STATE_BY_CODE` (as the
matrix calendar did); category is the left stripe + icon, so state and category
read independently. Colors per `DESIGN.md` (Carbon palette, 0px radius).

### D7. Permissions

Frontend helper `canWriteSchedule(role, departmentId?, viewerDeptId?)` in
`access.ts` hides New/Import, disables drag, and makes the editor read-only.
Backend is authoritative: new ops added to `OPERATIONS` with roles
`SUPER_ADMIN, TECH_LEAD, HR_MANAGER, DEPT_HEAD`; resolvers additionally check
`DEPT_HEAD` department on both the existing task and the target assignee.
`scheduledTasks` reuses the `tasks` scoping.

### D8. Import/export on the backend

- Frontend reads the file with `File.arrayBuffer()` → base64 and sends
  `ImportFileInput`; reject > 2 MB client-side and server-side.
- Backend parses CSV (small split on lines with quoted-field support, already
  needed for CSV export) and XLSX via `exceljs`; resolves `assigneeEmail` to a
  user, `category` to `TaskType`, dates `DD/MM/YYYY`, and checks scope per row.
  Preview and commit share one `parseTaskImport()`; commit runs it again (never
  trusts the preview) and inserts in one transaction.
- `exportSchedule` and `taskImportTemplate` reuse `reports/exports.ts`
  artifact writing; PDF via `pdf-lib`. Frontend uses `useServerExport`.

### D9. Localization

All new copy under `planning.schedule.*` in `messages/en.json` and `vi.json`
(category names include "Công việc trong ngày", "Công việc dài ngày", "Công việc
gấp trong giờ"). State/priority labels come from `useDomainLabels`. Dates
display via `useMesFormat`; the range inputs always use `DD/MM/YYYY`.

## Risks / Trade-offs

- [Year scale with many tasks gets dense] → month columns; bars show code only
  under a width threshold, full detail in tooltip.
- [Optimistic move races a live update] → pending map wins until the mutation
  settles, then refetch is the source of truth.
- [Base64 inflates uploads ~33%] → 2 MB cap is ample for roster-sized plans.
- [`@neodrag/react@next` is pre-release] → pin exact version; drag logic is
  isolated in `ticket-bar.tsx` for easy swap.
- [Removing the matrix calendar UI] → `matrixCalendar` API and A4 print stay;
  the Schedule toolbar keeps the "Print attendance calendar" action.

## Migration Plan

Single PR: backend ops first (with tests), then frontend swap. Rollback = revert
the PR; no data migration, soft-deleted tasks remain recoverable via
`deleted_at`.
