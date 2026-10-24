"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ExportButton } from "@/components/shared/export-action";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
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
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canApproveOrReturn } from "@/lib/mes/queries/access";
import {
  LEAVE_REQUESTS_QUERY,
  PRINT_LEAVE_REQUEST_MUTATION,
  REVIEW_LEAVE_MUTATION,
} from "@/lib/mes/queries/planning";
import { LEAVE_CODES } from "@/lib/mes/queries/registries";
import type {
  Connection,
  LeaveRequest,
  RoleCode,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

function StatusPill({ status }: { status: string }) {
  const labels = useDomainLabels();
  const style =
    status === "APPROVED"
      ? { borderColor: "#24a148", color: "#24a148" }
      : status === "REJECTED"
        ? { borderColor: "#da1e28", color: "#da1e28" }
        : { borderColor: "#0f62fe", color: "#0f62fe" };
  return (
    <span className="inline-flex border px-2 py-0.5 text-xs" style={style}>
      {labels.approvalStatus(status)}
    </span>
  );
}

/**
 * Leave request queue/table: registration status, print of the A4 request form,
 * and — for approver roles — approve/reject.
 */
export function LeaveRequestsSection({
  role,
  status,
  title,
  description,
}: {
  role: RoleCode | null;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  title: string;
  description?: string;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("planning.leaveQueue");
  const labels = useDomainLabels();
  const errorText = useErrorText();
  const [leaveCode, setLeaveCode] = useState("ALL");
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const approve = useMutation<unknown>(REVIEW_LEAVE_MUTATION);

  const filter = {
    status,
    leaveCode: leaveCode === "ALL" ? undefined : leaveCode,
  };

  const { data, loading, error, refetch } = useApiQuery<{
    leaveRequests: Connection<LeaveRequest>;
  }>(
    LEAVE_REQUESTS_QUERY,
    { filter, offset: 0, limit: 100 },
    {
      liveArea: "leave",
    },
  );

  const approver = canApproveOrReturn(role);
  const requests = data?.leaveRequests.nodes ?? [];

  const decide = async (
    request: LeaveRequest,
    decision: "APPROVED" | "REJECTED",
    reviewComment?: string,
  ) => {
    setFeedback(null);
    try {
      await approve.run({
        input: {
          leaveRequestId: request.id,
          decision,
          reviewComment: reviewComment || undefined,
        },
      });
      setFeedback({
        tone: "success",
        message: decision === "APPROVED" ? t("approvedMsg") : t("rejectedMsg"),
      });
      refetch();
      return true;
    } catch (cause) {
      const message = errorText(cause);
      setFeedback({ tone: "error", message });
      throw cause;
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="grid gap-1">
          <Label htmlFor="leave-code-filter">{t("leaveCodeFilter")}</Label>
          <Select
            value={leaveCode}
            onValueChange={(value) => setLeaveCode(value ?? "ALL")}
            items={{
              ALL: t("allLeaveCodes"),
              ...Object.fromEntries(
                LEAVE_CODES.map((code) => [
                  code.code,
                  labels.leaveCode(code.code),
                ]),
              ),
            }}
          >
            <SelectTrigger id="leave-code-filter" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allLeaveCodes")}</SelectItem>
              {LEAVE_CODES.map((code) => (
                <SelectItem key={code.code} value={code.code}>
                  {labels.leaveCode(code.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}
      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      {loading && !data ? <LoadingState label={t("loading")} rows={4} /> : null}

      {data && requests.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : null}

      {requests.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{t("colEmployee")}</TableHead>
              <TableHead className="w-24">{t("colCode")}</TableHead>
              <TableHead className="w-28">{t("colFrom")}</TableHead>
              <TableHead className="w-28">{t("colTo")}</TableHead>
              <TableHead className="w-20">{t("colDays")}</TableHead>
              <TableHead>{t("colReason")}</TableHead>
              <TableHead className="w-40">{t("colHandover")}</TableHead>
              <TableHead className="w-28">{t("colStatus")}</TableHead>
              <TableHead className="w-56">{t("colActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="text-xs">
                  {request.user.fullName}
                </TableCell>
                <TableCell>
                  <StateBadge
                    code={request.leaveCode}
                    variant="leave"
                    compact
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {fmt.date(request.startDate)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {fmt.date(request.endDate)}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {fmt.decimal(request.totalDays)}
                </TableCell>
                <TableCell className="max-w-56 truncate text-xs">
                  {request.reason}
                </TableCell>
                <TableCell className="text-xs">
                  {request.handoverUser?.fullName ?? "—"}
                </TableCell>
                <TableCell>
                  <StatusPill status={request.status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <ExportButton
                      mutation={PRINT_LEAVE_REQUEST_MUTATION}
                      resultKey="printLeaveRequest"
                      label={t("print")}
                      variables={{ leaveRequestId: request.id }}
                    />
                    {approver && request.status === "PENDING" ? (
                      <>
                        <Button
                          size="xs"
                          disabled={approve.loading}
                          onClick={() => decide(request, "APPROVED")}
                        >
                          {t("approve")}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setRejecting(request)}
                        >
                          {t("reject")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={t("rejectTitle")}
        description={t("rejectDescription")}
        fields={[
          {
            name: "reviewComment",
            label: t("reviewComment"),
            type: "textarea",
          },
        ]}
        confirmLabel={t("reject")}
        tone="destructive"
        onSubmit={async (values) => {
          if (!rejecting) return false;
          return decide(rejecting, "REJECTED", values.reviewComment);
        }}
      />
    </section>
  );
}
