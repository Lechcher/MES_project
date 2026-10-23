"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TaskCompletionDialog } from "@/components/jobs/task-completion-dialog";
import { TaskCompletionReview } from "@/components/jobs/task-completion-review";
import { ExportButton } from "@/components/shared/export-action";
import { InlineAlert } from "@/components/shared/query-states";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { Button } from "@/components/ui/button";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { canApproveOrReturn, canCancelTicket } from "@/lib/mes/queries/access";
import {
  ACCEPT_TASK_MUTATION,
  CANCEL_TASK_MUTATION,
  EXPLAIN_LATE_SUBMISSION_MUTATION,
  LOG_TASK_PROGRESS_MUTATION,
  PRINT_TASK_SLIP_MUTATION,
  REQUEST_EXTENSION_MUTATION,
} from "@/lib/mes/queries/jobs";
import type { RoleCode, TaskDetail } from "@/lib/mes/queries/types";
import { useMutation } from "@/lib/mes/session";

type Feedback = { tone: "error" | "success"; message: string } | null;

/**
 * Lifecycle actions for a ticket, offered only when valid for the ticket's
 * current state and the viewer's role:
 * `REQ → ACT → PEN → {APP | REJ}`; `OVERDUE` needs a late-submission
 * explanation; `CAN` is reachable at any non-terminal time with a mandatory
 * reason. Complete is locked while the ticket is overdue.
 */
export function TaskActions({
  task,
  role,
  viewerId,
  onChanged,
}: {
  task: TaskDetail;
  role: RoleCode | null;
  viewerId: string;
  onChanged: () => void;
}) {
  const t = useTranslations("jobs.actions");
  const accept = useMutation<unknown>(ACCEPT_TASK_MUTATION);
  const errorText = useErrorText();
  const logProgress = useMutation<unknown>(LOG_TASK_PROGRESS_MUTATION);
  const cancel = useMutation<unknown>(CANCEL_TASK_MUTATION);
  const extension = useMutation<unknown>(REQUEST_EXTENSION_MUTATION);
  const lateSubmission = useMutation<unknown>(EXPLAIN_LATE_SUBMISSION_MUTATION);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [dialog, setDialog] = useState<
    "progress" | "extension" | "late" | "cancel" | null
  >(null);
  // A completion request is opened from the Complete button and decided through
  // its own review surface, not through the direct approve/return mutations.
  const [completing, setCompleting] = useState(false);

  const isOwn = task.assignedTo?.id === viewerId;
  const isOverdue = task.isOverdue || task.state === "OVERDUE";
  const approver = canApproveOrReturn(role);

  const canAccept = task.state === "REQ" && (isOwn || role !== "EMPLOYEE");
  const canLogProgress = task.state === "ACT";
  // Resubmission after a return is the same completion flow, so a `REJ` ticket
  // offers Complete as well.
  const canComplete =
    (task.state === "ACT" || task.state === "REJ") && !isOverdue;
  const canReportLate =
    task.state === "OVERDUE" || (task.state === "ACT" && isOverdue);
  const canRequestExtension = task.state === "ACT" && !isOverdue;
  const canApproveReturn = task.state === "PEN" && approver;
  // The ticket's pending journey entry, when one exists. Only then is there a
  // decision to take; a ticket moved to `PEN` some other way has none.
  const pendingRequest = task.journey.find((entry) => entry.state === "PEN");
  const canCancel =
    task.state !== "APP" &&
    task.state !== "CAN" &&
    canCancelTicket(role, isOwn);

  const perform = async (action: () => Promise<unknown>, message: string) => {
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: "success", message });
      onChanged();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  const anyAction =
    canLogProgress ||
    canComplete ||
    canAccept ||
    canReportLate ||
    canRequestExtension ||
    canCancel;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {canAccept ? (
          <Button
            size="sm"
            disabled={accept.loading}
            onClick={() =>
              perform(() => accept.run({ taskId: task.id }), t("accepted"))
            }
          >
            {t("accept")}
          </Button>
        ) : null}

        {canLogProgress ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog("progress")}
          >
            {t("logProgress")}
          </Button>
        ) : null}

        {canComplete ? (
          <Button size="sm" onClick={() => setCompleting(true)}>
            {t("complete")}
          </Button>
        ) : null}

        {canReportLate ? (
          <Button size="sm" onClick={() => setDialog("late")}>
            {t("reportLate")}
          </Button>
        ) : null}

        {canRequestExtension ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog("extension")}
          >
            {t("requestExtension")}
          </Button>
        ) : null}

        {canApproveReturn && pendingRequest ? (
          <TaskCompletionReview
            request={pendingRequest}
            onChanged={onChanged}
          />
        ) : null}

        <ExportButton
          mutation={PRINT_TASK_SLIP_MUTATION}
          resultKey="printTaskSlip"
          label={t("printSlip")}
          variables={{ taskId: task.id }}
        />

        {canCancel ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDialog("cancel")}
          >
            {t("cancelTicket")}
          </Button>
        ) : null}
      </div>

      {!anyAction ? (
        <p className="text-xs text-muted-foreground">{t("noActions")}</p>
      ) : null}

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}

      <ReasonDialog
        open={dialog === "progress"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("progressTitle")}
        description={t("progressDescription")}
        fields={[
          {
            name: "newPercentage",
            label: t("progressPercentage"),
            type: "number",
            required: true,
            defaultValue: String(task.progressPercentage),
          },
          { name: "logComment", label: t("comment"), type: "textarea" },
        ]}
        confirmLabel={t("saveProgress")}
        onSubmit={async (values) => {
          await logProgress.run({
            input: {
              taskId: task.id,
              newPercentage: Number(values.newPercentage),
              logComment: values.logComment || undefined,
            },
          });
          setFeedback({ tone: "success", message: t("progressLogged") });
          onChanged();
          return true;
        }}
      />

      <ReasonDialog
        open={dialog === "extension"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("extensionTitle")}
        description={t("extensionDescription")}
        fields={[
          {
            name: "requestedDeadline",
            label: t("newDeadline"),
            type: "datetime-local",
            required: true,
          },
          {
            name: "reason",
            label: t("reasonMandatory"),
            type: "textarea",
            required: true,
          },
        ]}
        confirmLabel={t("submitExtension")}
        onSubmit={async (values) => {
          await extension.run({
            input: {
              taskId: task.id,
              requestedDeadline: new Date(
                values.requestedDeadline,
              ).toISOString(),
              reason: values.reason,
            },
          });
          setFeedback({
            tone: "success",
            message: t("extensionRequested"),
          });
          onChanged();
          return true;
        }}
      />

      <ReasonDialog
        open={dialog === "late"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("lateTitle")}
        description={t("lateDescription")}
        fields={[
          {
            name: "reason",
            label: t("lateReason"),
            type: "textarea",
            required: true,
          },
        ]}
        confirmLabel={t("submitExplanation")}
        onSubmit={async (values) => {
          await lateSubmission.run({
            input: { taskId: task.id, reason: values.reason },
          });
          setFeedback({
            tone: "success",
            message: t("lateRecorded"),
          });
          onChanged();
          return true;
        }}
      />

      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(open) => !open && setDialog(null)}
        title={t("cancelTitle")}
        description={t("cancelDescription")}
        fields={[
          {
            name: "reason",
            label: t("cancelReason"),
            type: "textarea",
            required: true,
          },
        ]}
        confirmLabel={t("cancelConfirm")}
        tone="destructive"
        onSubmit={async (values) => {
          await cancel.run({
            input: { taskId: task.id, reason: values.reason },
          });
          setFeedback({ tone: "success", message: t("cancelled") });
          onChanged();
          return true;
        }}
      />

      <TaskCompletionDialog
        task={task}
        open={completing}
        onOpenChange={setCompleting}
        onSubmitted={onChanged}
      />
    </section>
  );
}
