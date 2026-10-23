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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STARS_BY_PRIORITY: Record<Priority, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

/** Local `datetime-local` value (`YYYY-MM-DDTHH:MM`) from an ISO string. */
function toDateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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

/**
 * The schedule's task editor: Details / Time / Notes tabs, the priority as
 * one to four stars, the assignee from the visible rows, and — on an
 * existing ticket — the state tag with exactly the transitions the viewer
 * may perform. Writers also get duplicate and a confirmed delete; everyone
 * else reads the ticket and keeps their own lifecycle actions.
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
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
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
      setStartText(toDateTimeInput(task.startDate));
      setEndText(toDateTimeInput(task.endDate));
      setDescription(task.description ?? "");
    } else {
      setTitle("");
      setTaskType("DAILY");
      setPriority("MEDIUM");
      setAssignedToId(prefill?.assigneeId ?? "");
      setStartText(
        prefill?.start ? toDateTimeInput(prefill.start.toISOString()) : "",
      );
      setEndText("");
      setDescription("");
    }
  }, [open, task?.id, prefill]);

  const assignedTo = assignees.find((user) => user.id === assignedToId) ?? null;

  const allocatedHours = (() => {
    if (!startText || !endText) return null;
    const start = new Date(startText);
    const end = new Date(endText);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    const hours = (end.getTime() - start.getTime()) / 3_600_000;
    return hours >= 0 ? Math.round(hours * 10) / 10 : null;
  })();

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
    const start = startText ? new Date(startText) : null;
    const end = endText ? new Date(endText) : null;
    if (start && end && Number.isNaN(end.getTime()) === false && end < start) {
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
          startDate: start ? start.toISOString() : null,
          endDate: end ? end.toISOString() : null,
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
        startDate: start ? start.toISOString() : null,
        endDate: end ? end.toISOString() : null,
        isUrgentHourly: taskType === "HOURLY",
      });
      close();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate
              ? t("createTitle")
              : t("editTitle", { code: task?.taskCode ?? "" })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("tabDetails")} · {t("tabTime")} · {t("tabNotes")}
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

        <Tabs defaultValue="details">
          <TabsList>
            <TabsTrigger value="details">{t("tabDetails")}</TabsTrigger>
            <TabsTrigger value="time">{t("tabTime")}</TabsTrigger>
            <TabsTrigger value="notes">{t("tabNotes")}</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="mt-3 grid gap-3">
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
                  onValueChange={(value) => setTaskType(value as TaskType)}
                  disabled={!canWrite}
                  items={Object.fromEntries(
                    (Object.keys(TASK_TYPE_LABELS) as TaskType[]).map(
                      (type) => [type, labels.taskType(type)],
                    ),
                  )}
                >
                  <SelectTrigger
                    id="task-category"
                    className="w-full"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map(
                      (type) => (
                        <SelectItem key={type} value={type}>
                          {labels.taskType(type)}
                        </SelectItem>
                      ),
                    )}
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
                  <SelectTrigger
                    id="task-assignee"
                    className="w-full"
                    size="sm"
                  >
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
          </TabsContent>

          <TabsContent value="time" className="mt-3 grid gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="task-start">{t("start")}</Label>
                <Input
                  id="task-start"
                  type="datetime-local"
                  value={startText}
                  onChange={(event) => setStartText(event.target.value)}
                  disabled={!canWrite}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="task-end">{t("end")}</Label>
                <Input
                  id="task-end"
                  type="datetime-local"
                  value={endText}
                  onChange={(event) => setEndText(event.target.value)}
                  disabled={!canWrite}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {allocatedHours !== null
                ? t("allocatedHours", { hours: allocatedHours })
                : t("notesPlaceholder")}
            </p>
          </TabsContent>

          <TabsContent value="notes" className="mt-3 grid gap-1">
            <Label htmlFor="task-notes">{t("notes")}</Label>
            <Textarea
              id="task-notes"
              rows={4}
              placeholder={t("notesPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={!canWrite}
            />
          </TabsContent>
        </Tabs>

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
