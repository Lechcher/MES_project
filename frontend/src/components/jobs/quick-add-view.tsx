"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
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
import { ACCEPT_TASK_MUTATION, TASKS_QUERY } from "@/lib/mes/queries/jobs";
import type { Connection, TaskSummary } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation, useViewer } from "@/lib/mes/session";

const CUTOFF = "08:30";

function todayRange() {
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Daily Quick-add — the day's unconfirmed REQ tickets with quick-accept. */
export function QuickAddView() {
  const viewer = useViewer();
  const t = useTranslations("jobs.quickAdd");
  const tList = useTranslations("jobs.list");
  const labels = useDomainLabels();
  const fmt = useMesFormat();
  const errorText = useErrorText();
  const [actingId, setActingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const range = todayRange();
  const { data, loading, error, refetch } = useApiQuery<{
    tasks: Connection<TaskSummary>;
  }>(
    TASKS_QUERY,
    {
      filter: { state: "REQ", ...range },
      orderBy: "END_DATE_ASC",
      offset: 0,
      limit: 50,
    },
    { liveArea: "tickets" },
  );
  const accept = useMutation<unknown>(ACCEPT_TASK_MUTATION);

  const tasks = data?.tasks;

  if (!viewer) return null;

  const quickAccept = async (taskId: string) => {
    setActingId(taskId);
    setFeedback(null);
    try {
      await accept.run({ taskId });
      setFeedback({ tone: "success", message: t("accepted") });
      refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("jobs")}
        title={t("title")}
        description={t("description", { cutoff: CUTOFF })}
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/jobs" />}
          >
            {t("backToList")}
          </Button>
        }
      />

      {feedback ? (
        <div className="mb-4">
          <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
        </div>
      ) : null}

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading && !tasks ? (
        <LoadingState label={t("loading")} rows={4} />
      ) : null}

      {tasks && tasks.nodes.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : null}

      {tasks && tasks.nodes.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tList("colTitle")}</TableHead>
              <TableHead className="w-24">{tList("colPriority")}</TableHead>
              <TableHead className="w-40">{tList("colAssignee")}</TableHead>
              <TableHead className="w-40">{tList("colDeadline")}</TableHead>
              <TableHead className="w-28">{tList("colState")}</TableHead>
              <TableHead className="w-28">{t("colAction")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.nodes.map((task) => (
              <TableRow key={task.id}>
                <TableCell>{task.title}</TableCell>
                <TableCell className="text-xs">
                  {labels.priority(task.priority)}
                </TableCell>
                <TableCell className="text-xs">
                  {task.assignedTo?.fullName ?? "—"}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {fmt.dateTime(task.endDate)}
                </TableCell>
                <TableCell>
                  <StateBadge code={task.state} compact />
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    disabled={actingId === task.id}
                    onClick={() => quickAccept(task.id)}
                  >
                    {actingId === task.id ? t("accepting") : t("accept")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}
