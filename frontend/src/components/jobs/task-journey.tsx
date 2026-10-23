"use client";

import { useTranslations } from "next-intl";
import { AttachmentList } from "@/components/shared/attachment-preview";
import { InlineAlert } from "@/components/shared/query-states";
import { StateBadge } from "@/components/shared/state-badge";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import type { TaskCompletionRequest } from "@/lib/mes/queries/types";

/**
 * The ticket's journey of work stages, oldest to newest.
 *
 * Each entry is one completion request with the decision it received — the
 * ticket's own `PEN`/`APP`/`REJ` state, the requester and the decider, the
 * reason a rejection carried, and the files each side attached. The journey is
 * the progress ledger the progress card reads, so it is rendered beside it.
 */
export function TaskJourney({ entries }: { entries: TaskCompletionRequest[] }) {
  const t = useTranslations("jobs.detail");
  const labels = useDomainLabels();
  const fmt = useMesFormat();

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("journeyEmpty")}</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-col gap-2 border border-border p-3 text-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge code={entry.state} />
            <span className="font-medium">{entry.title}</span>
            <span className="text-xs text-muted-foreground">
              {labels.completionScope(entry.scope)}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {fmt.dateTime(entry.createdAt)}
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            {entry.description ?? t("journeyNoDescription")}
          </p>

          <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <div>
              <dt>{t("journeyRequester")}</dt>
              <dd className="text-foreground">{entry.user.fullName}</dd>
            </div>
            {entry.reviewedBy ? (
              <div>
                <dt>{t("journeyReviewer")}</dt>
                <dd className="text-foreground">
                  {entry.reviewedBy.fullName}
                  {entry.reviewedAt
                    ? ` — ${fmt.dateTime(entry.reviewedAt)}`
                    : ""}
                </dd>
              </div>
            ) : null}
          </dl>

          {entry.state === "REJ" && entry.reviewComment ? (
            <InlineAlert tone="error">
              {t("journeyRejectedBecause")} {entry.reviewComment}
            </InlineAlert>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <h4 className="mb-1 text-xs font-semibold">
                {t("journeyEvidence")}
              </h4>
              <AttachmentList attachments={entry.attachments} />
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold">
                {t("journeyRequiredFixes")}
              </h4>
              <AttachmentList attachments={entry.decisionAttachments} />
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
