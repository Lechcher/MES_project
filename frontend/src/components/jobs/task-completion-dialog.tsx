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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/mes/i18n/error-text";

import { SUBMIT_TASK_COMPLETION_REQUEST_MUTATION } from "@/lib/mes/queries/jobs";
import type { CompletionScope } from "@/lib/mes/queries/types";
import { useMutation } from "@/lib/mes/session";

/**
 * The completion request dialog.
 *
 * An assignee fills in a title, what the work delivered, and the evidence to
 * attach. `MULTI_DAY` tickets also choose whether this stage completes the whole
 * job, and may state the estimate and the number of stages they expect — the
 * progress model derives from those numbers rather than from a fixed ladder.
 * `DAILY` and `HOURLY` tickets complete the whole job, so the scope choice is
 * not offered to them.
 */
export function TaskCompletionDialog({
  task,
  open,
  onOpenChange,
  onSubmitted,
}: {
  task: { id: string; taskType: string; progressPercentage: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const t = useTranslations("jobs.actions");
  const tCommon = useTranslations("common");
  const errorText = useErrorText();
  const submit = useMutation<unknown>(SUBMIT_TASK_COMPLETION_REQUEST_MUTATION);

  const isMultiDay = task.taskType === "MULTI_DAY";
  const [scope, setScope] = useState<CompletionScope>("MILESTONE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [declaredProgress, setDeclaredProgress] = useState("");
  const [plannedStageCount, setPlannedStageCount] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setDeclaredProgress("");
    setPlannedStageCount("");
    setAttachmentIds([]);
    setError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const canSubmit = title.trim().length > 0 && !submit.loading;

  const run = async () => {
    if (!canSubmit) {
      setError(t("completionTitleRequired"));
      return;
    }
    setError(null);

    const declared = declaredProgress.trim();
    const stages = plannedStageCount.trim();
    try {
      await submit.run({
        input: {
          taskId: task.id,
          scope: isMultiDay ? scope : "FULL_JOB",
          title: title.trim(),
          description: description.trim() || undefined,
          declaredProgress: declared === "" ? undefined : Number(declared),
          plannedStageCount: stages === "" ? undefined : Number(stages),
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        },
      });
      close();
      onSubmitted();
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("completeTitle")}</DialogTitle>
          <DialogDescription>
            {isMultiDay
              ? t("completeDescriptionMultiDay")
              : t("completeDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {isMultiDay ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{t("scopeLabel")}</span>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={scope === "MILESTONE" ? "default" : "outline"}
                  onClick={() => setScope("MILESTONE")}
                >
                  {t("scopeMilestone")}
                </Button>
                <Button
                  size="sm"
                  variant={scope === "FULL_JOB" ? "default" : "outline"}
                  onClick={() => setScope("FULL_JOB")}
                >
                  {t("scopeFullJob")}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid gap-1">
            <Label htmlFor="completion-title">
              {t("completionTitleLabel")}
            </Label>
            <Input
              id="completion-title"
              value={title}
              required
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid gap-1">
            <Label htmlFor="completion-description">
              {t("completionDescriptionLabel")}
            </Label>
            <Textarea
              id="completion-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          {isMultiDay ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="completion-progress">
                  {t("completionProgressLabel")}
                </Label>
                <Input
                  id="completion-progress"
                  type="number"
                  min={0}
                  max={100}
                  placeholder={String(task.progressPercentage)}
                  value={declaredProgress}
                  onChange={(event) => setDeclaredProgress(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("completionProgressHint", {
                    current: task.progressPercentage,
                  })}
                </p>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="completion-stages">
                  {t("completionStagesLabel")}
                </Label>
                <Input
                  id="completion-stages"
                  type="number"
                  min={1}
                  value={plannedStageCount}
                  onChange={(event) => setPlannedStageCount(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t("completionStagesHint")}
                </p>
              </div>
            </div>
          ) : null}

          <AttachmentField
            taskId={task.id}
            attachmentIds={attachmentIds}
            onChange={setAttachmentIds}
            disabled={submit.loading}
          />

          {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {tCommon("cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={run}>
            {submit.loading ? tCommon("working") : t("completeSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
