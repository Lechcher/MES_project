"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  dedupeAssignees,
  isSameAssignee,
} from "@/components/jobs/assignee-selection";
import {
  addOneHour,
  taskPayloadFrom,
} from "@/components/planning/schedule/task-dates";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { DatePicker } from "@/components/shared/date-picker";
import { InlineAlert, LoadingState } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canCreateTicket } from "@/lib/mes/queries/access";
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import { CREATE_TASK_MUTATION, PROJECTS_QUERY } from "@/lib/mes/queries/jobs";
import { USERS_QUERY } from "@/lib/mes/queries/settings";
import type {
  Connection,
  DepartmentDetail,
  Priority,
  ProjectRef,
  RoleCode,
  TaskType,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation, useRoleCode, useViewer } from "@/lib/mes/session";

const HOURLY_SLOTS = ["10:30", "14:00", "16:30"] as const;
const DAILY_SLOTS = ["17:00", "18:00"] as const;

/** The deadline an hourly slot closes at: one hour after it starts. */
function hourlyEndSlot(slot: string): string {
  return addOneHour(slot);
}

/** Local `YYYY-MM-DD` for today. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Create Ticket form — task types, deadline slots, and project. */
export function CreateTicketView() {
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const router = useRouter();
  const fmt = useMesFormat();
  const t = useTranslations("jobs.create");
  const tList = useTranslations("jobs.list");
  const tCommon = useTranslations("common");
  const labels = useDomainLabels();
  const errorText = useErrorText();

  const canCreate = canCreateTicket(role);
  const canListUsers =
    role === "SUPER_ADMIN" || role === "TECH_LEAD" || role === "HR_MANAGER";

  const departmentsQuery = useApiQuery<{ departments: DepartmentDetail[] }>(
    DEPARTMENTS_QUERY,
    {},
    { enabled: canCreate, liveArea: "users" },
  );
  const projectsQuery = useApiQuery<{ projects: Connection<ProjectRef> }>(
    PROJECTS_QUERY,
    { filter: { isActive: true } },
    { enabled: canCreate },
  );
  const usersQuery = useApiQuery<{ users: Connection<UserRef> }>(
    USERS_QUERY,
    { limit: 200 },
    { enabled: canCreate && canListUsers, liveArea: "users" },
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("DAILY");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [projectId, setProjectId] = useState("GENERAL_OPERATIONS");
  const [departmentId, setDepartmentId] = useState("");
  const [assignees, setAssignees] = useState<UserRef[]>([]);
  /** The viewer as an assignee option: the default selection. */
  const viewerOption = useMemo<UserRef | null>(() => {
    if (!viewer) return null;
    return {
      id: viewer.id,
      userCode: viewer.userCode,
      fullName: viewer.fullName,
      email: viewer.email,
      department: viewer.department,
      isActive: true,
    };
  }, [viewer]);
  const assigneeTouched = useRef(false);
  const assigneeAnchor = useComboboxAnchor();
  const [hourlySlot, setHourlySlot] = useState<string>(HOURLY_SLOTS[0]);
  const [dailySlot, setDailySlot] = useState<string>(DAILY_SLOTS[0]);
  const [isUrgentHourly, setIsUrgentHourly] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const createTask = useMutation<unknown>(CREATE_TASK_MUTATION);

  // Default the department to the viewer's own department once data arrives.
  useEffect(() => {
    if (!departmentId && viewer?.department?.id) {
      setDepartmentId(viewer.department.id);
    }
  }, [viewer, departmentId]);

  // Default the assignee selection to the viewer until the creator picks
  // their own set (an emptied selection stays empty so it can be refused).
  useEffect(() => {
    if (!assigneeTouched.current && assignees.length === 0 && viewerOption) {
      setAssignees([viewerOption]);
    }
  }, [assignees, viewerOption]);

  const departments = departmentsQuery.data?.departments ?? [];
  const projects = projectsQuery.data?.projects.nodes ?? [];
  const users = usersQuery.data?.users.nodes ?? [];

  const assigneeOptions = useMemo(() => {
    const active = users.filter((user) => user.isActive !== false);
    // Roles without the user-list permission may only assign to themselves.
    if (!canListUsers) return viewerOption ? [viewerOption] : [];
    if (!departmentId) return active;
    const scoped = active.filter(
      (user) => user.department?.id === departmentId,
    );
    return scoped.length > 0 ? scoped : active;
  }, [users, departmentId, canListUsers, viewerOption]);

  const deadlinePreview = useMemo(() => {
    // The same rule set the schedule reads back, so the preview shows the
    // dates the ticket will really be saved with.
    const payload =
      taskType === "HOURLY"
        ? taskPayloadFrom({
            taskType,
            day: today(),
            startHour: hourlySlot,
            endHour: hourlyEndSlot(hourlySlot),
          })
        : taskType === "DAILY"
          ? taskPayloadFrom({ taskType, day: today(), deadline: dailySlot })
          : startDate && endDate
            ? taskPayloadFrom({ taskType, day: startDate, endDay: endDate })
            : null;
    if (!payload) return t("selectStartEnd");
    if (taskType === "HOURLY") {
      return `${fmt.time(payload.startDate)}–${fmt.time(payload.endDate)}`;
    }
    if (taskType === "DAILY") return fmt.dateTime(payload.endDate);
    return `${fmt.date(payload.startDate)} → ${fmt.date(payload.endDate)}`;
    // `fmt` and `t` are included so a language switch recomputes the preview.
  }, [taskType, hourlySlot, dailySlot, startDate, endDate, fmt, t]);

  if (!viewer) return null;

  if (!canCreate) {
    return (
      <div>
        <AppPageHeader eyebrow={labels.module("jobs")} title={t("title")} />
        <InlineAlert tone="error">{t("forbidden")}</InlineAlert>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);

    // One rule set decides the dates for every category: `DAILY` is one day,
    // `HOURLY` an hour pair inside one day, and `MULTI_DAY` the only category
    // that spans days. A range that does not fit its category is refused.
    const dates =
      taskType === "HOURLY"
        ? taskPayloadFrom({
            taskType,
            day: today(),
            startHour: hourlySlot,
            endHour: hourlyEndSlot(hourlySlot),
          })
        : taskType === "DAILY"
          ? taskPayloadFrom({ taskType, day: today(), deadline: dailySlot })
          : startDate && endDate
            ? taskPayloadFrom({ taskType, day: startDate, endDay: endDate })
            : null;
    if (!dates) {
      // A multi-day range with a blank end is "missing"; an end that is not
      // after its start, or an hourly pair that cannot fit one day, is invalid.
      const missingRange = taskType === "MULTI_DAY" && (!startDate || !endDate);
      setFeedback({
        tone: "error",
        message: missingRange ? t("needRange") : t("invalidRange"),
      });
      return;
    }

    try {
      if (assignees.length === 0) {
        setFeedback({ tone: "error", message: t("assigneeRequired") });
        return;
      }
      await createTask.run({
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          projectId: projectId === "GENERAL_OPERATIONS" ? undefined : projectId,
          taskType,
          priority,
          // One ticket per selected employee, in the chosen order.
          assignedToIds: assignees.map((user) => user.id),
          departmentId: departmentId || undefined,
          startDate: dates.startDate,
          endDate: dates.endDate,
          isUrgentHourly: taskType === "HOURLY" ? isUrgentHourly : false,
        },
      });
      setFeedback({ tone: "success", message: t("created") });
      router.push("/jobs");
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const loadingOptions =
    departmentsQuery.loading || projectsQuery.loading || usersQuery.loading;

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("jobs")}
        title={t("title")}
        description={t("description")}
      />

      {feedback ? (
        <div className="mb-4">
          <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
        </div>
      ) : null}

      {departmentsQuery.error ? (
        <div className="mb-4">
          <InlineAlert tone="error">
            {errorText(departmentsQuery.error)}
          </InlineAlert>
        </div>
      ) : null}
      {projectsQuery.error ? (
        <div className="mb-4">
          <InlineAlert tone="error">
            {errorText(projectsQuery.error)}
          </InlineAlert>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex max-w-3xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("detailsCard")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1 md:col-span-2">
                <Label htmlFor="ticket-title">{t("titleLabel")}</Label>
                <Input
                  id="ticket-title"
                  value={title}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="ticket-type">{t("typeLabel")}</Label>
                <Select
                  value={taskType}
                  onValueChange={(value) => setTaskType(value as TaskType)}
                  items={Object.fromEntries(
                    (["HOURLY", "DAILY", "MULTI_DAY"] as TaskType[]).map(
                      (value) => [value, labels.taskType(value)],
                    ),
                  )}
                >
                  <SelectTrigger id="ticket-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOURLY">
                      {labels.taskType("HOURLY")}
                    </SelectItem>
                    <SelectItem value="DAILY">
                      {labels.taskType("DAILY")}
                    </SelectItem>
                    <SelectItem value="MULTI_DAY">
                      {labels.taskType("MULTI_DAY")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="ticket-priority">{t("priorityLabel")}</Label>
                <Select
                  value={priority}
                  onValueChange={(value) => setPriority(value as Priority)}
                  items={Object.fromEntries(
                    (["LOW", "MEDIUM", "HIGH", "URGENT"] as Priority[]).map(
                      (value) => [value, labels.priority(value)],
                    ),
                  )}
                >
                  <SelectTrigger id="ticket-priority" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["LOW", "MEDIUM", "HIGH", "URGENT"] as Priority[]).map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {labels.priority(value)}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="ticket-project">{t("projectLabel")}</Label>
                <Select
                  value={projectId}
                  onValueChange={(value) =>
                    setProjectId(value ?? "GENERAL_OPERATIONS")
                  }
                  items={{
                    GENERAL_OPERATIONS: tList("generalOperations"),
                    ...Object.fromEntries(
                      projects.map((project) => [project.id, project.name]),
                    ),
                  }}
                >
                  <SelectTrigger id="ticket-project" className="w-full">
                    <SelectValue placeholder={tList("generalOperations")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GENERAL_OPERATIONS">
                      {tList("generalOperations")}
                    </SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="ticket-department">
                  {t("departmentLabel")}
                </Label>
                <Select
                  value={departmentId}
                  onValueChange={(value) => {
                    setDepartmentId(value ?? "");
                    // A new department re-scopes the assignees, so the
                    // selection restarts from the creator.
                    assigneeTouched.current = true;
                    setAssignees(viewerOption ? [viewerOption] : []);
                  }}
                  items={Object.fromEntries(
                    departments.map((department) => [
                      department.id,
                      department.name,
                    ]),
                  )}
                >
                  <SelectTrigger id="ticket-department" className="w-full">
                    <SelectValue placeholder={t("selectDepartment")} />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="ticket-assignee">{t("assigneeLabel")}</Label>
                <Combobox
                  multiple
                  autoHighlight
                  items={assigneeOptions}
                  value={assignees}
                  onValueChange={(next) => {
                    assigneeTouched.current = true;
                    setAssignees(dedupeAssignees(next));
                  }}
                  itemToStringLabel={(user) =>
                    `${user.fullName}${user.department ? ` · ${user.department.name}` : ""}`
                  }
                  itemToStringValue={(user) => user.id}
                  isItemEqualToValue={isSameAssignee}
                >
                  <ComboboxChips ref={assigneeAnchor} className="w-full">
                    <ComboboxValue>
                      {(values) => (
                        <>
                          {values.map((user: UserRef) => (
                            <ComboboxChip key={user.id}>
                              {user.fullName}
                            </ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            id="ticket-assignee"
                            placeholder={t("assigneePlaceholder")}
                          />
                        </>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={assigneeAnchor}>
                    <ComboboxEmpty>{t("assigneeEmpty")}</ComboboxEmpty>
                    <ComboboxList>
                      {(user: UserRef) => (
                        <ComboboxItem key={user.id} value={user}>
                          {user.fullName}
                          {user.department ? ` · ${user.department.name}` : ""}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <p className="text-xs text-muted-foreground">
                  {t("assigneeHint")}
                </p>
              </div>

              <div className="grid gap-1 md:col-span-2">
                <Label htmlFor="ticket-description">
                  {t("descriptionLabel")}
                </Label>
                <Textarea
                  id="ticket-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("deadlineCard")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {taskType === "HOURLY" ? (
              <div className="flex flex-col gap-2">
                <Label>{t("hourlySlot")}</Label>
                <div className="flex flex-wrap gap-2">
                  {HOURLY_SLOTS.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      size="sm"
                      variant={hourlySlot === slot ? "default" : "outline"}
                      onClick={() => setHourlySlot(slot)}
                    >
                      {slot}–{hourlyEndSlot(slot)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {taskType === "DAILY" ? (
              <div className="flex flex-col gap-2">
                <Label>{t("dailyDeadline")}</Label>
                <div className="flex flex-wrap gap-2">
                  {DAILY_SLOTS.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      size="sm"
                      variant={dailySlot === slot ? "default" : "outline"}
                      onClick={() => setDailySlot(slot)}
                    >
                      {slot}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {taskType === "MULTI_DAY" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1">
                  <Label htmlFor="ticket-start">{t("startDate")}</Label>
                  <DatePicker
                    id="ticket-start"
                    value={startDate}
                    onChange={setStartDate}
                    placeholder={t("selectStartEnd")}
                    invalid={
                      startDate !== "" && endDate !== "" && startDate > endDate
                    }
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ticket-end">{t("endDate")}</Label>
                  <DatePicker
                    id="ticket-end"
                    value={endDate}
                    onChange={setEndDate}
                    placeholder={t("selectStartEnd")}
                    invalid={
                      startDate !== "" && endDate !== "" && startDate > endDate
                    }
                  />
                </div>
              </div>
            ) : null}

            {taskType === "HOURLY" ? (
              <div className="flex items-center gap-3">
                <Switch
                  id="ticket-urgent-hourly"
                  checked={isUrgentHourly}
                  onCheckedChange={setIsUrgentHourly}
                />
                <Label htmlFor="ticket-urgent-hourly">
                  {t("urgentHourly")}
                </Label>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {t("deadlinePreview", { preview: deadlinePreview })}
            </p>
          </CardContent>
        </Card>

        {loadingOptions ? (
          <LoadingState label={t("loadingOptions")} rows={1} />
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={createTask.loading}>
            {createTask.loading ? t("submitting") : t("submit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/jobs")}
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
