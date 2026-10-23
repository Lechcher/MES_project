"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { TaskActions } from "@/components/jobs/task-actions";
import { TaskJourney } from "@/components/jobs/task-journey";
import { TaskRequestReview } from "@/components/jobs/task-request-review";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { AttachmentList } from "@/components/shared/attachment-preview";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { SecondaryBadge } from "@/components/shared/secondary-badge";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { canApproveOrReturn } from "@/lib/mes/queries/access";
import { TASK_QUERY } from "@/lib/mes/queries/jobs";
import { multiDayMilestone } from "@/lib/mes/queries/registries";

import type { RoleCode, TaskDetail } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/** Ticket detail: full information, lifecycle actions, logs, and requests. */
export function TaskDetailView() {
  const params = useParams<{ id: string }>();
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const fmt = useMesFormat();
  const t = useTranslations("jobs.detail");
  const tList = useTranslations("jobs.list");
  const labels = useDomainLabels();

  const { data, loading, error, refetch } = useApiQuery<{
    task: TaskDetail | null;
  }>(
    TASK_QUERY,
    { id: params.id },
    {
      enabled: Boolean(params.id),
      liveArea: "tickets",
    },
  );

  if (!viewer) return null;

  const task = data?.task ?? null;
  const approver = canApproveOrReturn(role);

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("jobs")}
        title={task?.title ?? t("fallbackTitle")}
        description={task?.title ?? t("loading")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/jobs" />}
            >
              {t("backToList")}
            </Button>
            {task ? <StateBadge code={task.state} /> : null}
          </>
        }
      />

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading && !data ? <LoadingState label={t("loadingTicket")} /> : null}

      {!loading && !error && task === null ? (
        <EmptyState
          title={t("unavailableTitle")}
          description={t("unavailableDescription")}
        />
      ) : null}

      {task ? (
        <div className="flex flex-col gap-6">
          {task.badges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {task.badges.map((badge) => (
                <SecondaryBadge
                  key={badge}
                  badge={badge}
                  progressPercentage={task.progressPercentage}
                />
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("stateCard")}</CardTitle>
                <CardDescription>
                  {labels.ticketState(task.state)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {task.isOverdue ? (
                  <span className="text-sm font-medium text-destructive">
                    {t("overdueNote")}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("onTrack")}
                  </span>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("priorityCard")}</CardTitle>
                <CardDescription>
                  {labels.priority(task.priority)}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                {labels.taskType(task.taskType)}
                {task.isUrgentHourly ? t("urgentHourlySuffix") : ""}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("progressCard")}</CardTitle>
                {/* A tilde marks an estimate: the percentage is derived from the
                    stage ledger, not entered by hand. */}
                <CardDescription>~{task.progressPercentage}%</CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                {stageLedgerLabel(task, t)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("deadlineCard")}</CardTitle>
                <CardDescription>
                  {fmt.dateTime(task.extendedDeadline ?? task.endDate)}
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm">
                {task.extendedDeadline
                  ? t("extendedFrom", { date: fmt.dateTime(task.endDate) })
                  : (task.project?.name ?? tList("generalOperations"))}
              </CardContent>
            </Card>
          </div>

          <dl className="grid gap-3 border border-border p-4 text-sm md:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">{t("assignee")}</dt>
              <dd>{task.assignedTo?.fullName ?? t("unassigned")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("department")}
              </dt>
              <dd>{task.department?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("project")}</dt>
              <dd>{task.project?.name ?? tList("generalOperations")}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("created")}</dt>
              <dd>{fmt.dateTime(task.createdAt)}</dd>
            </div>
          </dl>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("description")}</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              {task.description ?? t("noDescription")}
            </p>
          </section>

          <Separator />

          <section>
            <h2 className="mb-3 text-sm font-semibold">{t("lifecycle")}</h2>
            <TaskActions
              task={task}
              role={role}
              viewerId={viewer.id}
              onChanged={refetch}
            />
          </section>

          <Separator />

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("journeyTitle")}</h2>
            <TaskJourney entries={task.journey} />
          </section>

          <Separator />

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("progressLog")}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t("colWhen")}</TableHead>
                  <TableHead className="w-40">{t("colWho")}</TableHead>
                  <TableHead className="w-32">{t("colChange")}</TableHead>
                  <TableHead>{t("colComment")}</TableHead>
                  <TableHead className="w-28">{t("colVerified")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {task.progressLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {fmt.dateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.user.fullName}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.previousPercentage}% → {log.newPercentage}%
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.logComment ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.isVerifiedByManager ? t("yes") : t("no")}
                    </TableCell>
                  </TableRow>
                ))}
                {task.progressLogs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-4 text-center text-muted-foreground"
                    >
                      {t("noProgress")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("transitions")}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t("colWhen")}</TableHead>
                  <TableHead className="w-32">{t("colFromTo")}</TableHead>
                  <TableHead className="w-40">{t("colActor")}</TableHead>
                  <TableHead>{t("colReason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {task.stateTransitions.map((transition) => (
                  <TableRow key={transition.id}>
                    <TableCell className="font-mono text-xs">
                      {fmt.dateTime(transition.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {transition.fromState
                        ? labels.ticketState(transition.fromState)
                        : "—"}{" "}
                      → {labels.ticketState(transition.toState)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {transition.actor?.fullName ?? t("systemActor")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {transition.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {task.stateTransitions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-4 text-center text-muted-foreground"
                    >
                      {t("noTransitions")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("requests")}</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t("colType")}</TableHead>
                  <TableHead className="w-40">
                    {t("colRequestedDeadline")}
                  </TableHead>
                  <TableHead>{t("colReason")}</TableHead>
                  <TableHead className="w-28">{t("colStatus")}</TableHead>
                  {approver ? (
                    <TableHead className="w-40">{t("colReview")}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {task.requests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="text-xs">
                      {labels.taskRequestType(request.requestType)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt.dateTime(request.requestedDeadline)}
                    </TableCell>
                    <TableCell className="text-xs">{request.reason}</TableCell>
                    <TableCell className="text-xs">
                      <StateBadgeStatus status={request.status} />
                    </TableCell>
                    {approver ? (
                      <TableCell>
                        <TaskRequestReview
                          request={request}
                          onChanged={refetch}
                          compact
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
                {task.requests.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={approver ? 5 : 4}
                      className="py-4 text-center text-muted-foreground"
                    >
                      {t("noRequests")}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("attachments")}</h2>
            <AttachmentList attachments={task.attachments} />
          </section>
        </div>
      ) : null}
    </div>
  );
}

function StateBadgeStatus({ status }: { status: string }) {
  const labels = useDomainLabels();
  const tone =
    status === "APPROVED"
      ? { borderColor: "#24a148", color: "#24a148" }
      : status === "REJECTED"
        ? { borderColor: "#da1e28", color: "#da1e28" }
        : { borderColor: "#0f62fe", color: "#0f62fe" };
  return (
    <span
      className="inline-flex items-center border px-2 py-0.5 text-xs"
      style={tone}
    >
      {labels.approvalStatus(status)}
    </span>
  );
}

/**
 * The progress card's stage-ledger line.
 *
 * The percentage above is derived from the journey, so this line says where the
 * number came from: how many stages are approved, and against how many were
 * planned (or that the total is still open-ended). A multi-day ticket with no
 * journey at all keeps the legacy milestone label, which still describes rows
 * recorded before this model.
 */
function stageLedgerLabel(
  task: TaskDetail,
  t: ReturnType<typeof useTranslations>,
) {
  const approved = task.journey.filter(
    (entry) => entry.state === "APP" && entry.scope === "MILESTONE",
  ).length;
  const planned = task.plannedStageCount;

  if (approved > 0) {
    return (
      t("progressStageLedger", { approved }) +
      (planned && planned > 0
        ? ` ${t("progressStagePlanned", { planned })}`
        : ` — ${t("progressStageOpenEnded")}`)
    );
  }

  if (task.taskType === "MULTI_DAY") {
    const legacy = multiDayMilestone(task.progressPercentage);
    if (legacy) {
      return t("progressLegacyMilestone", { label: legacy });
    }
    return t("belowMilestone");
  }

  return task.assignedTo?.fullName ?? t("unassigned");
}
