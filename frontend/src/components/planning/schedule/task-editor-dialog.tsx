"use client";

import { cn } from "cn";
import { Copy, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { TaskActions } from "@/components/jobs/task-actions";
import { InlineAlert } from "@/components/shared/query-states";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { TASK_TYPE_LABELS } from "@/lib/mes/queries/registries";
import type {
  Priority,
  RoleCode,
  ScheduledTask,
  TaskType,
  UpdateTaskInput,
  UserRef,
} from "@/lib/mes/queries/types";
import {
  addOneHour,
  deriveTimesForCategory,
  isTaskIntervalValid,
  seedTimesForTask,
  taskPayloadFrom,
  toDateInput,
  toDateTimeInput,
} from "./task-dates";

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STARS_BY_PRIORITY: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

export interface TaskCreateInput {
  title: string;
  description: string | null;
  taskType: TaskType;
  priority: Priority;
  assignedToId: string | null;
  departmentId: string | null;
  startDate: string | null;
  endDate: string | null;
  isUrgentHourly: boolean;
}

/** The local `datetime-local` strings the editor's controls drive. */
interface Interval {
  startText: string;
  endText: string;
}

const EMPTY_INTERVAL: Interval = { startText: "", endText: "" };

/**
 * The schedule's task editor: one page holding title, category, priority,
 * assignee, time and notes, the priority as one to four stars, the assignee
 * from the visible rows, and — on an existing ticket — the state tag with
 * exactly the transitions the viewer may perform. Writers also get duplicate
 * and a confirmed delete; everyone else reads the ticket and keeps their own
 * lifecycle actions.
 *
 * Time is one `datetime-local` pair for every category; the category decides
 * what the controls offer — a single day for `DAILY`, a start and an end day
 * for `MULTI_DAY`, and a start and an end hour on that day for `HOURLY` — so
 * `DAILY` and `HOURLY` never own an end day.
 */
export function TaskEditorDialog({
  open,
  onOpenChange,
  task,
  prefill,
  assignees,
  canWrite,
  role,
  viewerId,
  onChanged,
  onCreate,
  onUpdate,
  onDelete,
  onDuplicate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: ScheduledTask | null;
  prefill: { assigneeId: string | null; start: Date | null } | null;
  assignees: UserRef[];
  canWrite: boolean;
  role: RoleCode | null;
  viewerId: string;
  onChanged: () => void;
  onCreate: (input: TaskCreateInput) => Promise<void>;
  onUpdate: (input: UpdateTaskInput) => Promise<void>;
  onDelete: (task: ScheduledTask) => Promise<void>;
  onDuplicate: (task: ScheduledTask) => Promise<void>;
}) {
  const t = useTranslations("planning.schedule.editor");
  const common = useTranslations("common");
  const labels = useDomainLabels();
  const errorText = useErrorText();

  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("DAILY");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [assignedToId, setAssignedToId] = useState("");
  const [interval, setInterval] = useState<Interval>(EMPTY_INTERVAL);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isCreate = task === null;

  // Seed the form when a different ticket opens (create → prefill).
  // biome-ignore lint/correctness/useExhaustiveDependencies: reseeding on `task` identity would wipe in-progress edits on every live refetch; the ticket's id is the reseeding key
  useEffect(() => {
    if (!open) return;
    setError(null);
    setConfirmingDelete(false);
    if (task) {
      setTitle(task.title);
      setTaskType(task.taskType);
      setPriority(task.priority);
      setAssignedToId(task.assignedTo?.id ?? "");
      setInterval(seedTimesForTask(task, null));
      setDescription(task.description ?? "");
    } else {
      setTitle("");
      setTaskType("DAILY");
      setPriority("MEDIUM");
      setAssignedToId(prefill?.assigneeId ?? "");
      // A click on an empty cell opens the editor on that cell's time.
      setInterval(
        seedTimesForTask(
          {
            taskType: "DAILY",
            startDate: null,
            endDate: null,
          },
          prefill ?? null,
        ),
      );
      setDescription("");
    }
  }, [open, task?.id, prefill]);

  const assignedTo = assignees.find((user) => user.id === assignedToId) ?? null;

  const { startText, endText } = interval;
  const startDate = startText ? new Date(startText) : null;
  const intervalValid = isTaskIntervalValid(taskType, startText, endText);
  // The same rule set the Jobs create form writes through, so the two surfaces
  // cannot drift: one helper turns the editor's fields into saved dates.
  const dates = taskPayloadFrom({
    taskType,
    day: startText.slice(0, 10),
    startHour: startText.slice(11, 16),
    endHour: endText.slice(11, 16),
    endDay: endText.slice(0, 10),
  });

  const setType = (value: TaskType) => {
    setTaskType(value);
    setInterval((current) =>
      deriveTimesForCategory(value, current.startText, current.endText),
    );
  };

  /** Move the interval by whole days, keeping the time of day. */
  const shiftDays = (field: "start" | "end", days: number) =>
    setInterval((current) => {
      const value = field === "start" ? current.startText : current.endText;
      const date = value ? new Date(value) : null;
      if (!date) return current;
      date.setDate(date.getDate() + days);
      return field === "start"
        ? {
            startText: toDateTimeInput(date.toISOString()),
            endText: current.endText,
          }
        : {
            startText: current.startText,
            endText: toDateTimeInput(date.toISOString()),
          };
    });

  const close = () => onOpenChange(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
      setBusy(false);
      return;
    }
    setBusy(false);
  };

  const save = () => {
    if (title.trim().length === 0) {
      setError(t("titleRequired"));
      return;
    }
    if (dates === null) {
      setError(t("endBeforeStart"));
      return;
    }

    if (isCreate) {
      return run(async () => {
        await onCreate({
          title: title.trim(),
          description: description.trim() || null,
          taskType,
          priority,
          assignedToId: assignedToId || null,
          departmentId: assignedTo?.department?.id ?? null,
          startDate: dates.startDate,
          endDate: dates.endDate,
          isUrgentHourly: taskType === "HOURLY",
        });
        close();
      });
    }
    if (!task) return;
    return run(async () => {
      await onUpdate({
        taskId: task.id,
        title: title.trim(),
        description: description.trim() || null,
        taskType,
        priority,
        assignedToId: assignedToId || null,
        departmentId: assignedTo?.department?.id ?? task.department?.id ?? null,
        startDate: dates.startDate,
        endDate: dates.endDate,
        isUrgentHourly: taskType === "HOURLY",
      });
      close();
    });
  };

  const allocatedHours =
    dates && taskType === "HOURLY"
      ? Math.round(
          ((new Date(dates.endDate).getTime() -
            new Date(dates.startDate).getTime()) /
            3_600_000) *
            10,
        ) / 10
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate
              ? t("createTitle")
              : t("editTitle", { code: task?.taskCode ?? "" })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("title")} · {t("category")} · {t("priority")} · {t("assignee")} ·{" "}
            {t("start")} · {t("end")} · {t("notes")}
          </DialogDescription>
        </DialogHeader>

        {task && !isCreate ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <StateBadge code={task.state} compact />
              <span className="text-xs text-muted-foreground">
                {t("progress", { percent: task.progressPercentage })}
              </span>
            </span>
            <Button
              size="xs"
              variant="ghost"
              nativeButton={false}
              render={<Link href={`/jobs/tasks/${task.id}`} />}
            >
              {t("openDetail")}
            </Button>
          </div>
        ) : null}

        {/* One page, all fields: the dialog body scrolls instead of tabbing,
            and horizontally when it is wider than the screen. */}
        <div className="grid max-h-[65vh] gap-4 overflow-x-auto overflow-y-auto">
          <div className="grid gap-1">
            <Label htmlFor="task-title">{t("title")}</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!canWrite}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label htmlFor="task-category">{t("category")}</Label>
              <Select
                value={taskType}
                onValueChange={(value) => setType(value as TaskType)}
                disabled={!canWrite}
                items={Object.fromEntries(
                  (Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => [
                    type,
                    labels.taskType(type),
                  ]),
                )}
              >
                <SelectTrigger id="task-category" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {labels.taskType(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="task-assignee">{t("assignee")}</Label>
              <Select
                value={assignedToId}
                onValueChange={(value) => setAssignedToId(value ?? "")}
                disabled={!canWrite}
                items={{
                  "": t("unassigned"),
                  ...Object.fromEntries(
                    assignees.map((user) => [user.id, user.fullName]),
                  ),
                }}
              >
                <SelectTrigger id="task-assignee" className="w-full" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("unassigned")}</SelectItem>
                  {assignees.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.fullName} ({user.userCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1">
            <Label>{t("priority")}</Label>
            <div className="flex items-center gap-1">
              {PRIORITIES.map((candidate) => {
                const filled =
                  STARS_BY_PRIORITY[candidate] <= STARS_BY_PRIORITY[priority];
                return (
                  <button
                    key={candidate}
                    type="button"
                    disabled={!canWrite}
                    aria-label={t("priorityStars", {
                      count: STARS_BY_PRIORITY[candidate],
                      label: labels.priority(candidate),
                    })}
                    aria-pressed={priority === candidate}
                    onClick={() => setPriority(candidate)}
                    className={cn(
                      "rounded-sm p-0.5 disabled:cursor-not-allowed disabled:opacity-50",
                      priority === candidate && "outline outline-ring",
                    )}
                  >
                    <Star
                      className={cn(
                        "size-5",
                        filled
                          ? "fill-[#f1c21b] text-[#f1c21b]"
                          : "text-muted-foreground",
                      )}
                      aria-hidden
                    />
                  </button>
                );
              })}
              <span className="ml-1 text-xs text-muted-foreground">
                {labels.priority(priority)}
              </span>
            </div>
          </div>

          <fieldset
            className="grid gap-3 border border-border p-3"
            disabled={!canWrite}
          >
            <legend className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("time")}
            </legend>

            {taskType === "DAILY" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="task-day">{t("startDay")}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="task-day"
                      type="date"
                      value={startText ? startText.slice(0, 10) : ""}
                      onChange={(event) => {
                        const day = event.target.value;
                        if (!day) {
                          setInterval(EMPTY_INTERVAL);
                          return;
                        }
                        setInterval({
                          startText: `${day}T00:00`,
                          endText: `${day}T23:59`,
                        });
                      }}
                      className="w-full"
                    />
                    <DayShift
                      label={t("previousDay")}
                      onClick={() => shiftDays("start", -1)}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <span className="text-xs text-muted-foreground">
                    {t("endDayOnlyForMultiDay")}
                  </span>
                  <p className="text-sm font-medium">
                    {startDate
                      ? t("endsAtEndOfDay", { day: toDateInput(startDate) })
                      : t("selectDay")}
                  </p>
                </div>
              </div>
            ) : null}

            {taskType === "MULTI_DAY" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="task-start-day">{t("startDay")}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="task-start-day"
                      type="date"
                      value={startText ? startText.slice(0, 10) : ""}
                      onChange={(event) => {
                        const day = event.target.value;
                        if (!day) {
                          setInterval({ ...interval, startText: "" });
                          return;
                        }
                        const endDay = endText ? endText.slice(0, 10) : day;
                        setInterval({
                          startText: `${day}T00:00`,
                          endText:
                            endDay >= day ? `${endDay}T23:59` : `${day}T23:59`,
                        });
                      }}
                      className="w-full"
                    />
                    <DayShift
                      label={t("previousDay")}
                      onClick={() => shiftDays("start", -1)}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="task-end-day">{t("endDay")}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="task-end-day"
                      type="date"
                      value={endText ? endText.slice(0, 10) : ""}
                      min={startText ? startText.slice(0, 10) : undefined}
                      onChange={(event) => {
                        const day = event.target.value;
                        if (!day) {
                          setInterval({ ...interval, endText: "" });
                          return;
                        }
                        const startDay = startText
                          ? startText.slice(0, 10)
                          : day;
                        if (day < startDay) {
                          setError(t("endBeforeStart"));
                          return;
                        }
                        setError(null);
                        setInterval({
                          startText: `${startDay}T00:00`,
                          endText: `${day}T23:59`,
                        });
                      }}
                      className="w-full"
                    />
                    <DayShift
                      label={t("nextDay")}
                      onClick={() => shiftDays("end", 1)}
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {taskType === "HOURLY" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="task-hour-day">{t("day")}</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="task-hour-day"
                      type="date"
                      value={startText ? startText.slice(0, 10) : ""}
                      onChange={(event) => {
                        const day = event.target.value;
                        if (!day) {
                          setInterval(EMPTY_INTERVAL);
                          return;
                        }
                        const time = startText
                          ? startText.slice(11, 16)
                          : "08:00";
                        setInterval({
                          startText: `${day}T${time}`,
                          endText: `${day}T${time}`,
                        });
                      }}
                      className="w-full"
                    />
                    <DayShift
                      label={t("previousDay")}
                      onClick={() => shiftDays("start", -1)}
                    />
                  </div>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="task-start-hour">{t("startHour")}</Label>
                  <Input
                    id="task-start-hour"
                    type="time"
                    value={startText ? startText.slice(11, 16) : ""}
                    onChange={(event) => {
                      const time = event.target.value;
                      if (!time || !startText) return;
                      const day = startText.slice(0, 10);
                      setInterval({
                        startText: `${day}T${time}`,
                        // Keep the end hour when it is still later, otherwise
                        // fall back to the next hour.
                        endText:
                          endText && endText.slice(11, 16) > time
                            ? `${day}T${endText.slice(11, 16)}`
                            : `${day}T${addOneHour(time)}`,
                      });
                    }}
                    className="w-full"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="task-end-hour">{t("endHour")}</Label>
                  <Input
                    id="task-end-hour"
                    type="time"
                    value={endText ? endText.slice(11, 16) : ""}
                    onChange={(event) => {
                      const time = event.target.value;
                      if (!time || !startText) return;
                      const day = startText.slice(0, 10);
                      setInterval({ startText, endText: `${day}T${time}` });
                    }}
                    className="w-full"
                  />
                </div>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {taskType === "HOURLY"
                ? allocatedHours !== null && allocatedHours > 0
                  ? t("allocatedHours", { hours: allocatedHours })
                  : t("selectHours")
                : taskType === "MULTI_DAY" &&
                    startText &&
                    endText &&
                    intervalValid
                  ? t("daySpan", {
                      days:
                        countDays(endText.slice(0, 10)) -
                        countDays(startText.slice(0, 10)) +
                        1,
                    })
                  : t("selectRange")}
            </p>
          </fieldset>

          <div className="grid gap-1">
            <Label htmlFor="task-notes">{t("notes")}</Label>
            <Textarea
              id="task-notes"
              rows={4}
              placeholder={t("notesPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!canWrite}
            />
          </div>
        </div>

        {task && !isCreate ? (
          <TaskActions
            task={{
              ...task,
              progressLogs: [],
              stateTransitions: [],
              requests: [],
              journey: [],
              attachments: [],
            }}
            role={role}
            viewerId={viewerId}
            onChanged={onChanged}
          />
        ) : null}

        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {task && canWrite && !confirmingDelete ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 data-icon="inline-start" />
                {t("delete")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await onDuplicate(task);
                    close();
                  })
                }
              >
                <Copy data-icon="inline-start" />
                {t("duplicate")}
              </Button>
            </>
          ) : null}

          {task && canWrite && confirmingDelete ? (
            <span className="mr-auto flex items-center gap-2">
              <span className="text-xs text-destructive">
                {t("deleteConfirmTitle", { code: task.taskCode })}{" "}
                {t("deleteConfirmBody")}
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await onDelete(task);
                    close();
                  })
                }
              >
                {t("deleteConfirm")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmingDelete(false)}
              >
                {common("cancel")}
              </Button>
            </span>
          ) : null}

          <span className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={close}>
              {common("cancel")}
            </Button>
            {canWrite ? (
              <Button size="sm" disabled={busy} onClick={save}>
                {isCreate ? t("create") : t("save")}
              </Button>
            ) : null}
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A small nudge button beside a day input, for stepping a date. */
function DayShift({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="shrink-0 px-2"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/** A local `datetime-local` string, or `null` when it does not parse. */
function parseLocal(value: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days from the epoch, so a day count is DST-proof. */
function countDays(day: string): number {
  const date = parseLocal(`${day}T00:00`);
  return date ? Math.round(date.getTime() / 86_400_000) : 0;
}
