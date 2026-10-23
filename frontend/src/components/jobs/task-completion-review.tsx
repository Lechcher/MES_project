"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AttachmentField } from "@/components/shared/attachment-field";
import { InlineAlert } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { REVIEW_TASK_COMPLETION_REQUEST_MUTATION } from "@/lib/mes/queries/jobs";
import type { TaskCompletionRequest } from "@/lib/mes/queries/types";
import { useMutation } from "@/lib/mes/session";

/**
 * Decide a ticket's pending completion request.
 *
 * Approving keeps the journey moving: a `MILESTONE` approval approves one stage
 * and leaves the ticket open for the next one, while a `FULL_JOB` approval
 * completes the ticket. Rejecting returns it for rework and requires both a
 * reason and, optionally, the files that show what a correct result looks like.
 */
export function TaskCompletionReview({
  request,
  onChanged,
  compact = false,
}: {
  request: TaskCompletionRequest;
  onChanged: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("jobs.review");
  const errorText = useErrorText();
  const review = useMutation<unknown>(REVIEW_TASK_COMPLETION_REQUEST_MUTATION);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setError(null);
    try {
      await review.run({
        input: { requestId: request.id, decision: "APPROVED" },
      });
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const reject = async () => {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError(t("reasonRequired"));
      return;
    }
    setError(null);
    try {
      await review.run({
        input: {
          requestId: request.id,
          decision: "REJECTED",
          reviewComment: trimmed,
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        },
      });
      setRejecting(false);
      setReason("");
      setAttachmentIds([]);
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  if (request.state !== "PEN") return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        <Button
          size={compact ? "xs" : "sm"}
          disabled={review.loading}
          onClick={approve}
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

      <Dialog
        open={rejecting}
        onOpenChange={(next) => {
          setRejecting(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription>{t("rejectDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="grid gap-1">
              <Label htmlFor="completion-reason">{t("reviewComment")}</Label>
              <Textarea
                id="completion-reason"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <AttachmentField
              taskId={request.task.id}
              attachmentIds={attachmentIds}
              onChange={setAttachmentIds}
              disabled={review.loading}
            />
            {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={review.loading}
              onClick={reject}
            >
              {review.loading ? t("working") : t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
