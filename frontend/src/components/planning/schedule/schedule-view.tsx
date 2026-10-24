"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useServerExport } from "@/components/shared/export-action";
import {
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import {
  canWriteSchedule,
  seesCompanyCalendar,
} from "@/lib/mes/queries/access";
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import { CREATE_TASK_MUTATION } from "@/lib/mes/queries/jobs";
import {
  DELETE_TASK_MUTATION,
  DUPLICATE_TASK_MUTATION,
  EXPORT_SCHEDULE_MUTATION,
  MATRIX_CALENDAR_QUERY,
  PRINT_ATTENDANCE_CALENDAR_MUTATION,
  SCHEDULED_TASKS_QUERY,
  UPDATE_TASK_MUTATION,
} from "@/lib/mes/queries/planning";
import type {
  DepartmentRef,
  MatrixCalendar,
  MatrixCalendarDay,
  RoleCode,
  ScheduledTask,
  ScheduleRange,
  TicketStateCode,
  UpdateTaskInput,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation, useViewer } from "@/lib/mes/session";
import { ImportDialog } from "./import-dialog";
import { ScheduleGrid, type ScheduleGridRow } from "./schedule-grid";
import {
  addDays,
  columnsFor,
  customRange,
  rangeFromParams,
  rangeParams,
  shiftByColumns,
  step,
  toIsoDate,
  windowFor,
} from "./schedule-range";
import { ScheduleToolbar } from "./schedule-toolbar";
import { type TaskCreateInput, TaskEditorDialog } from "./task-editor-dialog";
import type { TicketBarMove } from "./ticket-bar";

/**
 * The Planning Schedule container (design D3): the visible range, scale and
 * department filter live in the URL so views are shareable; server data
 * arrives through the live `tickets` and `leave` areas; and an in-flight
 * drag is held in a `pending` patch map that wins over the query data until
 * the mutation settles — so a failed move rolls the bar back visually.
 */
export function ScheduleView({ role }: { role: RoleCode | null }) {
  // `useSearchParams` suspends during prerender; the boundary keeps the page
  // dynamic-render-safe while the params resolve.
  return (
    <Suspense fallback={<LoadingState rows={4} />}>
      <ScheduleViewInner role={role} />
    </Suspense>
  );
}

interface EditorState {
  open: boolean;
  task: ScheduledTask | null;
  prefill: { assigneeId: string | null; start: Date | null } | null;
}

function ScheduleViewInner({ role }: { role: RoleCode | null }) {
  const t = useTranslations("planning.schedule");
  const tEditor = useTranslations("planning.schedule.editor");
  const errorText = useErrorText();
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const viewerDeptId = viewer?.department?.id ?? null;
  const viewerId = viewer?.id ?? "";
  const companyScope = seesCompanyCalendar(role);
  const canWrite = canWriteSchedule(role, viewerDeptId);

  /* ── URL-driven range and department filter ─────────────────────── */

  const range = useMemo(
    () =>
      rangeFromParams(
        searchParams.get("scale"),
        searchParams.get("from"),
        searchParams.get("to"),
      ),
    [searchParams],
  );

  const departmentId = companyScope
    ? (searchParams.get("dept") ?? "")
    : (viewerDeptId ?? "");

  const applyParams = useCallback(
    (nextRange: ScheduleRange, nextDepartmentId: string | null) => {
      const params = rangeParams(nextRange);
      const query = new URLSearchParams({
        scale: params.scale,
        from: params.from,
      });
      if (params.to) query.set("to", params.to);
      const dept = nextDepartmentId ?? departmentId;
      if (dept) query.set("dept", dept);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [departmentId, pathname, router],
  );

  const onScaleChange = (scale: ScheduleRange["scale"]) =>
    applyParams(windowFor(scale, range.from), null);
  const onNavigate = (dir: -1 | 1) => applyParams(step(range, dir), null);
  const onToday = () => applyParams(windowFor(range.scale, new Date()), null);
  const onCustomRange = (from: Date, to: Date) =>
    applyParams(customRange(from, to), null);
  const onDepartmentChange = (id: string) => applyParams(range, id);

  /* ── Server data ─────────────────────────────────────────────────── */

  const scheduleInput = useMemo(
    () => ({
      departmentId: departmentId || null,
      fromDate: toIsoDate(range.from),
      toDate: toIsoDate(range.to),
    }),
    [departmentId, range],
  );

  const calendarInput = useMemo(
    () => ({
      departmentId: departmentId || null,
      fromDate: toIsoDate(range.from),
      toDate: toIsoDate(addDays(range.to, -1)),
    }),
    [departmentId, range],
  );

  const tasksQuery = useApiQuery<{ scheduledTasks: ScheduledTask[] }>(
    SCHEDULED_TASKS_QUERY,
    { input: scheduleInput },
    { liveArea: "tickets" },
  );
  const calendarQuery = useApiQuery<{ matrixCalendar: MatrixCalendar | null }>(
    MATRIX_CALENDAR_QUERY,
    { input: calendarInput },
    { liveArea: "leave" },
  );
  const departmentsQuery = useApiQuery<{ departments: DepartmentRef[] }>(
    companyScope ? DEPARTMENTS_QUERY : null,
    {},
    { liveArea: "users" },
  );

  const update =
    useMutation<Record<string, ScheduledTask | null>>(UPDATE_TASK_MUTATION);
  const remove =
    useMutation<Record<string, boolean | null>>(DELETE_TASK_MUTATION);
  const duplicate = useMutation<Record<string, ScheduledTask | null>>(
    DUPLICATE_TASK_MUTATION,
  );
  const create =
    useMutation<Record<string, ScheduledTask | null>>(CREATE_TASK_MUTATION);

  const exportAction = useServerExport(
    EXPORT_SCHEDULE_MUTATION,
    "exportSchedule",
  );
  const printAction = useServerExport(
    PRINT_ATTENDANCE_CALENDAR_MUTATION,
    "printAttendanceCalendar",
  );

  /* ── Optimistic drag state ───────────────────────────────────────── */

  const [pending, setPending] = useState(
    () => new Map<string, Partial<ScheduledTask>>(),
  );
  const [moveError, setMoveError] = useState<string | null>(null);

  const tasks = useMemo(() => {
    const base = tasksQuery.data?.scheduledTasks ?? [];
    return base.map((task) =>
      pending.has(task.id) ? { ...task, ...pending.get(task.id) } : task,
    );
  }, [tasksQuery.data, pending]);

  const refreshTasks = useCallback(() => {
    tasksQuery.refetch();
    calendarQuery.refetch();
  }, [tasksQuery, calendarQuery]);

  const moveTask = useCallback(
    async (task: ScheduledTask, move: TicketBarMove) => {
      const dates = shiftByColumns(task, move.delta, range.scale);
      const targetId = move.user.id || null;
      setMoveError(null);

      // The pending patch keeps the bar where it was dropped until the
      // mutation settles; clearing it rolls a failure back to the query data.
      if (!move.copy) {
        const patch: Partial<ScheduledTask> = {
          assignedTo: targetId ? move.user : null,
          startDate: dates.startDate || task.startDate,
          endDate: dates.endDate || task.endDate,
        };
        setPending((prev) => new Map(prev).set(task.id, patch));
      }

      try {
        if (move.copy) {
          await duplicate.run({
            input: {
              taskId: task.id,
              assignedToId: targetId,
              startDate: dates.startDate || undefined,
            },
          });
        } else {
          const input: UpdateTaskInput = { taskId: task.id };
          if (targetId !== task.assignedTo?.id) input.assignedToId = targetId;
          if (dates.startDate) input.startDate = dates.startDate;
          if (dates.endDate) input.endDate = dates.endDate;
          await update.run({ input });
        }
      } catch (cause) {
        setMoveError(errorText(cause));
      } finally {
        setPending((prev) => {
          const next = new Map(prev);
          next.delete(task.id);
          return next;
        });
        refreshTasks();
      }
    },
    [duplicate, errorText, range.scale, refreshTasks, update],
  );

  /* ── Grid rows: matrix rows + marks + merged tasks ────────────────── */

  const rows = useMemo<ScheduleGridRow[]>(() => {
    const calendar = calendarQuery.data?.matrixCalendar ?? null;
    const marksByUser = new Map<string, Map<string, MatrixCalendarDay>>();
    for (const row of calendar?.rows ?? []) {
      const marks = new Map<string, MatrixCalendarDay>();
      for (const day of row.days) marks.set(day.workDate.slice(0, 10), day);
      marksByUser.set(row.user.id, marks);
    }

    const tasksByUser = new Map<string, ScheduledTask[]>();
    const unassigned: ScheduledTask[] = [];
    for (const task of tasks) {
      const key = task.assignedTo?.id;
      if (!key) {
        unassigned.push(task);
        continue;
      }
      const list = tasksByUser.get(key) ?? [];
      list.push(task);
      tasksByUser.set(key, list);
    }

    const gridRows = (calendar?.rows ?? []).map((row) => ({
      user: row.user,
      departmentName: row.user.department?.name ?? null,
      marks: marksByUser.get(row.user.id) ?? new Map(),
      tasks: tasksByUser.get(row.user.id) ?? [],
    }));

    if (unassigned.length > 0) {
      gridRows.push({
        user: {
          id: "",
          userCode: "—",
          fullName: tEditor("unassigned"),
          email: "",
          department: null,
        },
        departmentName: null,
        marks: new Map(),
        tasks: unassigned,
      });
    }
    return gridRows;
  }, [calendarQuery.data, tasks, tEditor]);

  const assignees = useMemo(
    () => rows.map((row) => row.user).filter((user) => user.id !== ""),
    [rows],
  );

  const canWriteTask = useCallback(
    (task: ScheduledTask) =>
      canWriteSchedule(role, viewerDeptId, task.department?.id),
    [role, viewerDeptId],
  );

  /* ── Dialogs ─────────────────────────────────────────────────────── */

  const [editor, setEditor] = useState<EditorState>({
    open: false,
    task: null,
    prefill: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [exportStateFilter, setExportStateFilter] = useState("ALL");

  const openEditor = (task: ScheduledTask) =>
    setEditor({ open: true, task, prefill: null });
  const openCreate = (user: UserRef, column: Date) => {
    if (!canWrite) return;
    setEditor({
      open: true,
      task: null,
      prefill: { assigneeId: user.id || null, start: column },
    });
  };

  const handleCreate = useCallback(
    async (input: TaskCreateInput) => {
      await create.run({
        input: {
          title: input.title,
          description: input.description ?? undefined,
          taskType: input.taskType,
          priority: input.priority,
          assignedToId: input.assignedToId ?? undefined,
          departmentId: input.departmentId ?? undefined,
          startDate: input.startDate ?? undefined,
          endDate: input.endDate ?? undefined,
          isUrgentHourly: input.isUrgentHourly,
        },
      });
      refreshTasks();
    },
    [create, refreshTasks],
  );

  const handleUpdate = useCallback(
    async (input: UpdateTaskInput) => {
      await update.run({ input });
      refreshTasks();
    },
    [refreshTasks, update],
  );

  const handleDelete = useCallback(
    async (task: ScheduledTask) => {
      await remove.run({ taskId: task.id });
      refreshTasks();
    },
    [refreshTasks, remove],
  );

  const handleDuplicate = useCallback(
    async (task: ScheduledTask) => {
      await duplicate.run({ input: { taskId: task.id } });
      refreshTasks();
    },
    [duplicate, refreshTasks],
  );

  const onExport = (format: "PDF" | "XLSX" | "CSV") => {
    void exportAction.execute({
      input: {
        ...scheduleInput,
        state:
          exportStateFilter !== "ALL"
            ? (exportStateFilter as TicketStateCode)
            : null,
      },
      format,
    });
  };

  const editorCanWrite = editor.task
    ? canWriteTask(editor.task)
    : canWriteSchedule(role, viewerDeptId);

  const loading =
    (tasksQuery.loading || calendarQuery.loading) && rows.length === 0;

  return (
    <div className="grid gap-4">
      <ScheduleToolbar
        range={range}
        onNavigate={onNavigate}
        onToday={onToday}
        onScaleChange={onScaleChange}
        onCustomRange={onCustomRange}
        departments={departmentsQuery.data?.departments ?? []}
        departmentId={departmentId}
        onDepartmentChange={onDepartmentChange}
        showDepartmentFilter={companyScope}
        canWrite={canWrite}
        onNew={() => setEditor({ open: true, task: null, prefill: null })}
        onImport={() => setImportOpen(true)}
        onExport={onExport}
        exportLoading={exportAction.loading}
        exportState={exportStateFilter}
        onExportStateChange={setExportStateFilter}
        onPrint={() => void printAction.execute({ input: calendarInput })}
        printLoading={printAction.loading}
      />

      <p className="text-xs text-muted-foreground">
        {canWrite ? t("dragHint") : t("readOnlyHint")}
      </p>

      {moveError ? (
        <InlineAlert tone="error">
          {t("moveFailed")} {moveError}
        </InlineAlert>
      ) : null}

      {tasksQuery.error ? (
        <ErrorState error={tasksQuery.error} onRetry={tasksQuery.refetch} />
      ) : null}
      {calendarQuery.error ? (
        <ErrorState
          error={calendarQuery.error}
          onRetry={calendarQuery.refetch}
        />
      ) : null}
      {loading ? <LoadingState label={t("loading")} rows={6} /> : null}

      {!tasksQuery.error && !calendarQuery.error && !loading ? (
        <ScheduleGrid
          range={range}
          cols={columnsFor(range)}
          rows={rows}
          canWrite={canWrite}
          canWriteTask={canWriteTask}
          onCellClick={openCreate}
          onOpenTask={openEditor}
          onMoveTask={(task, move) => void moveTask(task, move)}
          onDuplicateTask={(task) => void handleDuplicate(task)}
          onDeleteTask={(task) => void handleDelete(task)}
        />
      ) : null}

      <TaskEditorDialog
        open={editor.open}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
        task={editor.task}
        prefill={editor.prefill}
        assignees={assignees}
        canWrite={editorCanWrite}
        role={role}
        viewerId={viewerId}
        onChanged={refreshTasks}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => refreshTasks()}
      />
    </div>
  );
}
