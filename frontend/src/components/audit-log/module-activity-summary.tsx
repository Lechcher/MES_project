"use client";

import { useTranslations } from "next-intl";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { AUDIT_LOG_MODULES } from "@/lib/mes/queries/access";
import { MODULE_ACTIVITY_QUERY } from "@/lib/mes/queries/audit-log";
import type { ModuleActivitySummary } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";

/** Per-module event count and last-activity summary. */
export function ModuleActivitySummaryPanel({
  filter,
}: {
  filter: Record<string, unknown>;
}) {
  const fmt = useMesFormat();
  const t = useTranslations("auditLog.summary");
  const { data, loading, error, refetch } = useApiQuery<{
    moduleActivity: ModuleActivitySummary[];
  }>(MODULE_ACTIVITY_QUERY, { filter }, { liveArea: "audit" });

  const summaries = data?.moduleActivity ?? [];

  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (loading && !data) return <LoadingState label={t("loading")} rows={3} />;
  if (data && summaries.length === 0) {
    return (
      <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">{t("colModule")}</TableHead>
          <TableHead className="w-40">{t("colModuleName")}</TableHead>
          <TableHead className="w-32">{t("colEventCount")}</TableHead>
          <TableHead>{t("colLastActivity")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summaries.map((summary) => (
          <TableRow key={summary.moduleCode}>
            <TableCell className="font-mono text-xs">
              {summary.moduleCode}
            </TableCell>
            <TableCell className="text-sm">
              {summary.moduleName ||
                AUDIT_LOG_MODULES.find(
                  (module) => module.code === summary.moduleCode,
                )?.name ||
                "—"}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {summary.eventCount}
            </TableCell>
            <TableCell className="font-mono text-xs">
              {fmt.dateTime(summary.lastActivityAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
