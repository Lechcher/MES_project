"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TaskRequestReview } from "@/components/jobs/task-request-review";
import { LeaveRequestsSection } from "@/components/planning/leave-requests";
import { PenaltyLeaveSection } from "@/components/planning/penalty-leave";
import { ExportButton } from "@/components/shared/export-action";
import { SectionHeader } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canAssignPenaltyLeave } from "@/lib/mes/queries/access";
import {
  APPROVE_TASK_MUTATION,
  PRINT_TASK_SLIP_MUTATION,
  RETURN_TASK_MUTATION,
  TASKS_QUERY,
  TASKS_WITH_REQUESTS_QUERY,
} from "@/lib/mes/queries/jobs";
import type {
  Connection,
  RoleCode,
  TaskRequest,
  TaskSummary,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

interface ApprovalTask extends TaskSummary {
  requests: TaskRequest[];
}

/**
 * Approval Board: the work-approval queue (`PEN` reports with approve/return),
 * the pending extension / late-submission request queue, the leave-approval
 * queue, and — for `SUPER_ADMIN`/`HR_MANAGER` — penalty-leave assignment.
 */
export function ApprovalBoard({
  role,
  isCompanyScope,
}: {
  role: RoleCode | null;
  isCompanyScope: boolean;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("planning.board");
  const tCommon = useTranslations("common");
  const labels = useDomainLabels();
  const errorText = useErrorText();
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);
  const [returning, setReturning] = useState<TaskSummary | null>(null);

  const approve = useMutation<unknown>(APPROVE_TASK_MUTATION);
  const returnTask = useMutation<unknown>(RETURN_TASK_MUTATION);

  const workQueue = useApiQuery<{ tasks: Connection<TaskSummary> }>(
    TASKS_QUERY,
    {
      filter: { state: "PEN" },
      orderBy: "END_DATE_ASC",
      offset: 0,
      limit: 100,
    },
    { liveArea: "tickets" },
  );

  const activeRequests = useApiQuery<{ tasks: Connection<ApprovalTask> }>(
    TASKS_WITH_REQUESTS_QUERY,
    { filter: { state: "ACT" }, offset: 0, limit: 100 },
    { liveArea: "tickets" },
  );
  const overdueRequests = useApiQuery<{ tasks: Connection<ApprovalTask> }>(
    TASKS_WITH_REQUESTS_QUERY,
    { filter: { state: "OVERDUE" }, offset: 0, limit: 100 },
    { liveArea: "tickets" },
  );

  const refreshWork = () => {
    workQueue.refetch();
    activeRequests.refetch();
    overdueRequests.refetch();
  };

  const pendingRequests = [
    ...(activeRequests.data?.tasks.nodes ?? []),
    ...(overdueRequests.data?.tasks.nodes ?? []),
  ].flatMap((task) =>
    task.requests
      .filter((request) => request.status === "PENDING")
      .map((request) => ({ task, request })),
  );

  const leaveApprovalTitle = isCompanyScope
    ? t("leaveApprovalSystemWide")
    : t("leaveApprovalDepartment");

  const approveTicket = async (task: TaskSummary) => {
    setFeedback(null);
    try {
      await approve.run({ taskId: task.id });
      setFeedback({
        tone: "success",
        message: t("approvedMsg"),
      });
      refreshWork();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}

      <section>
        <SectionHeader
          title={
            isCompanyScope
              ? t("workApprovalSystemWide")
              : t("workApprovalDepartment")
          }
          description={t("workApprovalDescription")}
          action={
            <Button variant="outline" size="sm" onClick={refreshWork}>
              {tCommon("refresh")}
            </Button>
          }
        />
        <ApprovalBoardGate query={workQueue}>
          {workQueue.data && workQueue.data.tasks.nodes.length === 0 ? (
            <EmptyState
              title={t("emptyWorkTitle")}
              description={t("emptyWorkDescription")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colTitle")}</TableHead>
                  <TableHead className="w-40">{t("colAssignee")}</TableHead>
                  <TableHead className="w-40">{t("colDepartment")}</TableHead>
                  <TableHead className="w-40">{t("colSubmitted")}</TableHead>
                  <TableHead className="w-28">{t("colState")}</TableHead>
                  <TableHead className="w-56">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workQueue.data?.tasks.nodes.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="text-sm">{task.title}</TableCell>
                    <TableCell className="text-xs">
                      {task.assignedTo?.fullName ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {task.department?.name ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt.dateTime(task.updatedAt)}
                    </TableCell>
                    <TableCell>
                      <StateBadge code={task.state} compact />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="xs"
                          disabled={approve.loading}
                          onClick={() => approveTicket(task)}
                        >
                          {t("approve")}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setReturning(task)}
                        >
                          {t("return")}
                        </Button>
                        <ExportButton
                          mutation={PRINT_TASK_SLIP_MUTATION}
                          resultKey="printTaskSlip"
                          label={t("print")}
                          variables={{ taskId: task.id }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ApprovalBoardGate>
      </section>

      <section>
        <SectionHeader
          title={t("requestsTitle")}
          description={t("requestsDescription")}
        />
        <ApprovalBoardGate query={activeRequests} also={overdueRequests}>
          {pendingRequests.length === 0 ? (
            <EmptyState
              title={t("emptyRequestsTitle")}
              description={t("emptyRequestsDescription")}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colTitle")}</TableHead>
                  <TableHead className="w-40">{t("colType")}</TableHead>
                  <TableHead className="w-40">
                    {t("colRequestedDeadline")}
                  </TableHead>
                  <TableHead>{t("colReason")}</TableHead>
                  <TableHead className="w-24">{t("colState")}</TableHead>
                  <TableHead className="w-40">{t("colReview")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map(({ task, request }) => (
                  <TableRow key={request.id}>
                    <TableCell className="text-sm">{task.title}</TableCell>
                    <TableCell className="text-xs">
                      {labels.taskRequestType(request.requestType)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmt.dateTime(request.requestedDeadline)}
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-xs">
                      {request.reason}
                    </TableCell>
                    <TableCell>
                      <StateBadge code={task.state} compact />
                    </TableCell>
                    <TableCell>
                      <TaskRequestReview
                        request={request}
                        onChanged={refreshWork}
                        compact
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ApprovalBoardGate>
      </section>

      <LeaveRequestsSection
        role={role}
        status="PENDING"
        title={leaveApprovalTitle}
        description={t("leaveSectionDescription")}
      />

      {canAssignPenaltyLeave(role) ? <PenaltyLeaveSection /> : null}

      <ReasonDialog
        open={returning !== null}
        onOpenChange={(open) => !open && setReturning(null)}
        title={t("returnTitle")}
        description={t("returnDescription")}
        fields={[
          {
            name: "reason",
            label: t("returnReason"),
            type: "textarea",
            required: true,
          },
        ]}
        confirmLabel={t("returnConfirm")}
        onSubmit={async (values) => {
          if (!returning) return false;
          await returnTask.run({ taskId: returning.id, reason: values.reason });
          setFeedback({
            tone: "success",
            message: t("returnedMsg"),
          });
          refreshWork();
          return true;
        }}
      />
    </div>
  );
}

/** Render loading/error for one or two queries and defer otherwise. */
function ApprovalBoardGate({
  query,
  also,
  children,
}: {
  query: {
    loading: boolean;
    error: unknown;
    data: unknown;
    refetch: () => void;
  };
  also?: {
    loading: boolean;
    error: unknown;
    data: unknown;
    refetch: () => void;
  };
  children: React.ReactNode;
}) {
  const loading =
    (query.loading && !query.data) || (also?.loading && !also.data);
  const error = query.error ?? also?.error ?? null;
  const refetch = () => {
    query.refetch();
    also?.refetch();
  };

  return (
    <>
      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading ? <LoadingState rows={3} /> : null}
      {!loading && !error ? children : null}
    </>
  );
}
