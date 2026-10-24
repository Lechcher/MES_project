"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/shared/query-states";
import { ReasonDialog } from "@/components/shared/reason-dialog";
import { Button } from "@/components/ui/button";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { REVIEW_TASK_REQUEST_MUTATION } from "@/lib/mes/queries/jobs";
import type { TaskRequest } from "@/lib/mes/queries/types";
import { useMutation } from "@/lib/mes/session";

/**
 * Approve/reject a pending extension or late-submission request. Approving an
 * extension updates the deadline; rejecting keeps the original deadline.
 */
export function TaskRequestReview({
  request,
  onChanged,
  compact = false,
}: {
  request: TaskRequest;
  onChanged: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("jobs.review");
  const labels = useDomainLabels();
  const review = useMutation<unknown>(REVIEW_TASK_REQUEST_MUTATION);
  const errorText = useErrorText();
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (request.status !== "PENDING") {
    return (
      <span className="text-xs text-muted-foreground">
        {labels.approvalStatus(request.status)}
      </span>
    );
  }

  const decide = async (
    decision: "APPROVED" | "REJECTED",
    comment?: string,
  ) => {
    setError(null);
    try {
      await review.run({
        input: {
          requestId: request.id,
          decision,
          reviewComment: comment || undefined,
        },
      });
      onChanged();
      return true;
    } catch (cause) {
      const message = errorText(cause);
      setError(message);
      throw cause;
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <Button
          size={compact ? "xs" : "sm"}
          disabled={review.loading}
          onClick={() => decide("APPROVED")}
        >
          {t("approve")}
        </Button>
        <Button
          size={compact ? "xs" : "sm"}
          variant="outline"
          disabled={review.loading}
          onClick={() => setRejecting(true)}
        >
          {t("reject")}
        </Button>
      </div>
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
      <ReasonDialog
        open={rejecting}
        onOpenChange={setRejecting}
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
        onSubmit={async (values) => decide("REJECTED", values.reviewComment)}
      />
    </div>
  );
}
