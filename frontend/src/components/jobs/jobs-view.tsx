"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { ExportButton } from "@/components/shared/export-action";
import { PaginationBar } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { SecondaryBadge } from "@/components/shared/secondary-badge";
import { StateBadge } from "@/components/shared/state-badge";
import { useDebouncedValue } from "@/components/shared/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canCreateTicket } from "@/lib/mes/queries/access";
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import {
  EXPORT_TASKS_MUTATION,
  PROJECTS_QUERY,
  TASKS_QUERY,
} from "@/lib/mes/queries/jobs";
import {
  TICKET_STATE_CODES,
  TICKET_STATES,
} from "@/lib/mes/queries/registries";
import type {
  Connection,
  DepartmentDetail,
  Priority,
  ProjectRef,
  RoleCode,
  TaskFilter,
  TaskSummary,
  TaskType,
  TicketStateCode,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useRoleCode, useViewer } from "@/lib/mes/session";

const PAGE_LIMIT = 20;

const DAYS = [
  { key: "yesterday", offset: -1 },
  { key: "today", offset: 0 },
  { key: "tomorrow", offset: 1 },
] as const;

type DayKey = (typeof DAYS)[number]["key"] | "all";

type PriorityValue = Priority | "ALL";
type TypeValue = TaskType | "ALL";
type StateValue = TicketStateCode | "ALL";

function dayRange(day: DayKey): {
  endDateAfter?: string;
  endDateBefore?: string;
} {
  if (day === "all") return {};
  const offset = DAYS.find((entry) => entry.key === day)?.offset ?? 0;
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() + offset);
  const after = target.toISOString();
  const before = new Date(target.getTime() + 86_400_000).toISOString();
  return { endDateAfter: after, endDateBefore: before };
}

/**
 * Jobs ticket list — role-scoped reads, day context, filters, and pagination.
 * The server applies the viewer's data scope; the UI never widens it.
 */
export function JobsView() {
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const t = useTranslations("jobs.list");
  const labels = useDomainLabels();
  const fmt = useMesFormat();

  const [day, setDay] = useState<DayKey>("today");
  const [state, setState] = useState<StateValue>("ALL");
  const [priority, setPriority] = useState<PriorityValue>("ALL");
  const [taskType, setTaskType] = useState<TypeValue>("ALL");
  const [overdue, setOverdue] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [projectId, setProjectId] = useState("ALL");
  const [departmentId, setDepartmentId] = useState("ALL");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);

  const search = useDebouncedValue(searchInput, 300);

  const canFilterOrg = role !== null && role !== "EMPLOYEE";

  const departmentsQuery = useApiQuery<{
    departments: DepartmentDetail[];
  }>(DEPARTMENTS_QUERY, {}, { enabled: canFilterOrg, liveArea: "users" });
  const projectsQuery = useApiQuery<{ projects: Connection<ProjectRef> }>(
    PROJECTS_QUERY,
    { filter: { isActive: true } },
    { enabled: canFilterOrg },
  );

  const filter = useMemo<TaskFilter>(() => {
    const base: TaskFilter = {
      ...dayRange(day),
      state: state === "ALL" ? undefined : state,
      priority: priority === "ALL" ? undefined : priority,
      taskType: taskType === "ALL" ? undefined : taskType,
      isOverdue: overdue ? true : undefined,
      isUrgentHourly: urgent ? true : undefined,
      projectId: projectId === "ALL" ? undefined : projectId,
      departmentId: departmentId === "ALL" ? undefined : departmentId,
      search: search.trim() ? search.trim() : undefined,
    };
    return base;
  }, [
    day,
    state,
    priority,
    taskType,
    overdue,
    urgent,
    projectId,
    departmentId,
    search,
  ]);

  const { data, loading, error, refetch } = useApiQuery<{
    tasks: Connection<TaskSummary>;
  }>(
    TASKS_QUERY,
    {
      filter,
      orderBy: "CREATED_AT_DESC",
      offset,
      limit: PAGE_LIMIT,
    },
    { liveArea: "tickets" },
  );

  const tasks = data?.tasks;

  const resetPage = () => setOffset(0);

  if (!viewer) return null;

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("jobs")}
        title={t("title")}
        description={t("roleScoped", {
          role: role ? labels.role(role) : "—",
        })}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/jobs/quick-add" />}
            >
              {t("quickAdd")}
            </Button>
            <ExportButton
              mutation={EXPORT_TASKS_MUTATION}
              resultKey="exportTasks"
              label={t("exportXlsx")}
              variables={{ filter, format: "XLSX" }}
            />
            <ExportButton
              mutation={EXPORT_TASKS_MUTATION}
              resultKey="exportTasks"
              label={t("exportCsv")}
              variables={{ filter, format: "CSV" }}
            />
            {canCreateTicket(role) ? (
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/jobs/new" />}
              >
                <Plus data-icon="inline-start" />
                {t("createNew")}
              </Button>
            ) : null}
          </>
        }
      />

      {/* 1-Click Day Navigation Bar */}
      <section aria-label={t("dayContext")} className="mb-4">
        <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">
          {t("dayContext")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {DAYS.map((entry) => (
            <Button
              key={entry.key}
              variant={day === entry.key ? "default" : "outline"}
              size="sm"
              aria-pressed={day === entry.key}
              onClick={() => {
                setDay(entry.key);
                resetPage();
              }}
            >
              [{t(entry.key)}]
            </Button>
          ))}
          <Button
            variant={day === "all" ? "default" : "outline"}
            size="sm"
            aria-pressed={day === "all"}
            onClick={() => {
              setDay("all");
              resetPage();
            }}
          >
            {t("allDays")}
          </Button>
        </div>
      </section>

      {/* Filters */}
      <section className="mb-4 grid gap-3 border border-border p-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="jobs-state">{t("stateLabel")}</Label>
          <Select
            value={state}
            onValueChange={(value) => {
              setState(value as StateValue);
              resetPage();
            }}
            items={{
              ALL: t("allStates"),
              ...Object.fromEntries(
                TICKET_STATES.map((state) => [
                  state.code,
                  labels.ticketState(state.code),
                ]),
              ),
            }}
          >
            <SelectTrigger id="jobs-state" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allStates")}</SelectItem>
              {TICKET_STATE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {labels.ticketState(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-1">
          <Label htmlFor="jobs-priority">{t("priorityLabel")}</Label>
          <Select
            value={priority}
            onValueChange={(value) => {
              setPriority(value as PriorityValue);
              resetPage();
            }}
            items={{
              ALL: t("allPriorities"),
              ...Object.fromEntries(
                (["LOW", "MEDIUM", "HIGH", "URGENT"] as Priority[]).map(
                  (value) => [value, labels.priority(value)],
                ),
              ),
            }}
          >
            <SelectTrigger id="jobs-priority" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allPriorities")}</SelectItem>
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
          <Label htmlFor="jobs-type">{t("typeLabel")}</Label>
          <Select
            value={taskType}
            onValueChange={(value) => {
              setTaskType(value as TypeValue);
              resetPage();
            }}
            items={{
              ALL: t("allTypes"),
              ...Object.fromEntries(
                (["HOURLY", "DAILY", "MULTI_DAY"] as TaskType[]).map(
                  (value) => [value, labels.taskType(value)],
                ),
              ),
            }}
          >
            <SelectTrigger id="jobs-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allTypes")}</SelectItem>
              {(["HOURLY", "DAILY", "MULTI_DAY"] as TaskType[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {labels.taskType(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canFilterOrg ? (
          <div className="grid gap-1">
            <Label htmlFor="jobs-project">{t("projectLabel")}</Label>
            <Select
              value={projectId}
              onValueChange={(value) => {
                setProjectId(value ?? "ALL");
                resetPage();
              }}
              items={{
                ALL: t("allProjects"),
                ...Object.fromEntries(
                  (projectsQuery.data?.projects.nodes ?? []).map((project) => [
                    project.id,
                    project.name,
                  ]),
                ),
              }}
            >
              <SelectTrigger id="jobs-project" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("allProjects")}</SelectItem>
                {(projectsQuery.data?.projects.nodes ?? []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {canFilterOrg ? (
          <div className="grid gap-1">
            <Label htmlFor="jobs-department">{t("departmentLabel")}</Label>
            <Select
              value={departmentId}
              onValueChange={(value) => {
                setDepartmentId(value ?? "ALL");
                resetPage();
              }}
              items={{
                ALL: t("allDepartments"),
                ...Object.fromEntries(
                  (departmentsQuery.data?.departments ?? []).map(
                    (department) => [department.id, department.name],
                  ),
                ),
              }}
            >
              <SelectTrigger id="jobs-department" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("allDepartments")}</SelectItem>
                {(departmentsQuery.data?.departments ?? []).map(
                  (department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid gap-1">
          <Label htmlFor="jobs-search">{t("searchLabel")}</Label>
          <Input
            id="jobs-search"
            value={searchInput}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => {
              setSearchInput(event.target.value);
              resetPage();
            }}
          />
        </div>

        <div className="flex items-end gap-2">
          <Button
            variant={overdue ? "default" : "outline"}
            size="sm"
            aria-pressed={overdue}
            onClick={() => {
              setOverdue((value) => !value);
              resetPage();
            }}
          >
            {t("overdueOnly")}
          </Button>
          <Button
            variant={urgent ? "default" : "outline"}
            size="sm"
            aria-pressed={urgent}
            onClick={() => {
              setUrgent((value) => !value);
              resetPage();
            }}
          >
            {t("urgentHourly")}
          </Button>
        </div>
      </section>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {loading && !tasks ? (
        <LoadingState label={t("loading")} rows={6} />
      ) : null}

      {tasks && tasks.nodes.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : null}

      {tasks && tasks.nodes.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("colTitle")}</TableHead>
                <TableHead className="w-28">{t("colState")}</TableHead>
                <TableHead className="w-20">{t("colPriority")}</TableHead>
                <TableHead className="w-24">{t("colType")}</TableHead>
                <TableHead className="w-20">{t("colProgress")}</TableHead>
                <TableHead className="w-40">{t("colAssignee")}</TableHead>
                <TableHead className="w-40">{t("colDepartment")}</TableHead>
                <TableHead className="w-40">{t("colProject")}</TableHead>
                <TableHead className="w-28">{t("colDeadline")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.nodes.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Link
                        href={`/jobs/tasks/${task.id}`}
                        className="text-foreground hover:text-primary"
                      >
                        {task.title}
                      </Link>
                      {task.badges.map((badge) => (
                        <SecondaryBadge
                          key={badge}
                          badge={badge}
                          progressPercentage={task.progressPercentage}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StateBadge code={task.state} />
                      {task.isOverdue && task.state !== "OVERDUE" ? (
                        <span className="text-xs text-destructive">
                          {t("overdueMark")}
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {labels.priority(task.priority)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {labels.taskType(task.taskType)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {task.progressPercentage}%
                  </TableCell>
                  <TableCell className="text-xs">
                    {task.assignedTo?.fullName ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {task.department?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {task.project?.name ?? t("generalOperations")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {fmt.dateTime(task.endDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationBar
            className="mt-4"
            pageInfo={tasks.pageInfo}
            limit={PAGE_LIMIT}
            onOffsetChange={setOffset}
          />
        </>
      ) : null}
    </div>
  );
}
