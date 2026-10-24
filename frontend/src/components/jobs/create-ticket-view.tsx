"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { InlineAlert, LoadingState } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

function todayAt(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function isoDay(date: string, endOfDay = false): string {
  return new Date(
    `${date}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`,
  ).toISOString();
}

/** Create Ticket form — task types, deadline slots, project, and Auto-forking. */
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
  const [assignedToId, setAssignedToId] = useState("");
  const [hourlySlot, setHourlySlot] = useState<string>(HOURLY_SLOTS[1]);
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

  useEffect(() => {
    if (!assignedToId && viewer?.id) setAssignedToId(viewer.id);
  }, [viewer, assignedToId]);

  const departments = departmentsQuery.data?.departments ?? [];
  const projects = projectsQuery.data?.projects.nodes ?? [];
  const users = usersQuery.data?.users.nodes ?? [];

  const selectedDepartment = departments.find(
    (department) => department.id === departmentId,
  );

  const assigneeOptions = useMemo(() => {
    const active = users.filter((user) => user.isActive !== false);
    if (!departmentId) return active;
    const scoped = active.filter(
      (user) => user.department?.id === departmentId,
    );
    return scoped.length > 0 ? scoped : active;
  }, [users, departmentId]);

  const deadlinePreview = useMemo(() => {
    if (taskType === "HOURLY") return fmt.dateTime(todayAt(hourlySlot));
    if (taskType === "DAILY") return fmt.dateTime(todayAt(dailySlot));
    if (startDate && endDate) {
      return `${fmt.dateTime(isoDay(startDate))} → ${fmt.dateTime(isoDay(endDate, true))}`;
    }
    return t("selectStartEnd");
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

    let start: string | undefined;
    let end: string | undefined;
    if (taskType === "HOURLY") {
      end = todayAt(hourlySlot);
    } else if (taskType === "DAILY") {
      end = todayAt(dailySlot);
    } else {
      if (!startDate || !endDate) {
        setFeedback({
          tone: "error",
          message: t("needRange"),
        });
        return;
      }
      start = isoDay(startDate);
      end = isoDay(endDate, true);
    }

    try {
      await createTask.run({
        input: {
          title: title.trim(),
          description: description.trim() || undefined,
          projectId: projectId === "GENERAL_OPERATIONS" ? undefined : projectId,
          taskType,
          priority,
          assignedToId: assignedToId || undefined,
          departmentId: departmentId || undefined,
          startDate: start,
          endDate: end,
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
                    setAssignedToId(viewer.id);
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
                <Select
                  value={assignedToId}
                  onValueChange={(value) => setAssignedToId(value ?? "")}
                  items={Object.fromEntries([
                    ...(canListUsers
                      ? []
                      : [[viewer.id, t("self", { name: viewer.fullName })]]),
                    ...assigneeOptions.map((user) => [
                      user.id,
                      `${user.fullName}${user.department ? ` · ${user.department.name}` : ""}`,
                    ]),
                  ])}
                >
                  <SelectTrigger id="ticket-assignee" className="w-full">
                    <SelectValue placeholder={viewer.fullName} />
                  </SelectTrigger>
                  <SelectContent>
                    {canListUsers ? null : (
                      <SelectItem value={viewer.id}>
                        {t("self", { name: viewer.fullName })}
                      </SelectItem>
                    )}
                    {assigneeOptions.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                        {user.department ? ` · ${user.department.name}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                      {slot}
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
                  <Input
                    id="ticket-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ticket-end">{t("endDate")}</Label>
                  <Input
                    id="ticket-end"
                    type="date"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
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

            <Separator />

            <div className="flex items-start gap-3">
              <Switch
                id="ticket-auto-forking"
                checked={selectedDepartment?.autoForkingEnabled ?? false}
                disabled
              />
              <div>
                <Label htmlFor="ticket-auto-forking">{t("autoForking")}</Label>
                <p className="text-xs text-muted-foreground">
                  {selectedDepartment
                    ? selectedDepartment.autoForkingEnabled
                      ? t("autoForkingEnabled", {
                          name: selectedDepartment.name,
                        })
                      : t("autoForkingDisabled", {
                          name: selectedDepartment.name,
                        })
                    : t("autoForkingPick")}{" "}
                  {t("autoForkingNote")}
                </p>
              </div>
            </div>
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
