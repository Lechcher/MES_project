"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ExportButton } from "@/components/shared/export-action";
import { formatJson } from "@/components/shared/format";
import {
  PaginationBar,
  SectionHeader,
} from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { Input } from "@/components/ui/input";
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
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { AUDIT_LOG_MODULES } from "@/lib/mes/queries/access";
import {
  AUDIT_LOGS_QUERY,
  EXPORT_AUDIT_LOGS_MUTATION,
} from "@/lib/mes/queries/audit-log";
import { USERS_QUERY } from "@/lib/mes/queries/settings";
import type {
  Connection,
  SystemAuditLog,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { ModuleActivitySummaryPanel } from "./module-activity-summary";

const PAGE_LIMIT = 20;

interface AuditFilterState {
  moduleCode: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_FILTER: AuditFilterState = {
  moduleCode: "ALL",
  userId: "ALL",
  action: "",
  resourceType: "",
  resourceId: "",
  fromDate: "",
  toDate: "",
};

/**
 * Audit Log app: the newest-first system-wide activity stream with filters for
 * module, user, action, resource type, resource ID, and date range, per-module
 * summaries, and export of the filtered events as XLSX or CSV.
 *
 * Read-only — no control edits or deletes a recorded event.
 */
export function AuditLogView() {
  const fmt = useMesFormat();
  const t = useTranslations("auditLog.view");
  const labels = useDomainLabels();
  const [filters, setFilters] = useState<AuditFilterState>(EMPTY_FILTER);
  const [offset, setOffset] = useState(0);

  const usersQuery = useApiQuery<{ users: Connection<UserRef> }>(
    USERS_QUERY,
    {
      limit: 200,
    },
    { liveArea: "users" },
  );

  const filter = {
    moduleCode: filters.moduleCode === "ALL" ? undefined : filters.moduleCode,
    userId: filters.userId === "ALL" ? undefined : filters.userId,
    action: filters.action.trim() || undefined,
    resourceType: filters.resourceType.trim() || undefined,
    resourceId: filters.resourceId.trim() || undefined,
    fromDate: filters.fromDate
      ? new Date(`${filters.fromDate}T00:00:00.000Z`).toISOString()
      : undefined,
    toDate: filters.toDate
      ? new Date(`${filters.toDate}T23:59:59.999Z`).toISOString()
      : undefined,
  };

  const logsQuery = useApiQuery<{
    auditLogs: Connection<SystemAuditLog>;
  }>(
    AUDIT_LOGS_QUERY,
    { filter, offset, limit: PAGE_LIMIT },
    {
      liveArea: "audit",
    },
  );

  const logs = logsQuery.data?.auditLogs.nodes ?? [];

  const update = (patch: Partial<AuditFilterState>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setOffset(0);
  };

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{t("streamTitle")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("streamDescription")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            mutation={EXPORT_AUDIT_LOGS_MUTATION}
            resultKey="exportAuditLogs"
            label={t("exportXlsx")}
            variables={{ filter, format: "XLSX" }}
          />
          <ExportButton
            mutation={EXPORT_AUDIT_LOGS_MUTATION}
            resultKey="exportAuditLogs"
            label={t("exportCsv")}
            variables={{ filter, format: "CSV" }}
          />
        </div>
      </section>

      <section className="grid gap-3 border border-border p-4 md:grid-cols-4 xl:grid-cols-7">
        <div className="grid gap-1">
          <Label htmlFor="al-module">{t("moduleLabel")}</Label>
          <Select
            value={filters.moduleCode}
            onValueChange={(value) => update({ moduleCode: value ?? "ALL" })}
            items={{
              ALL: t("allModules"),
              ...Object.fromEntries(
                AUDIT_LOG_MODULES.map((module) => [
                  module.code,
                  labels.module(module.code),
                ]),
              ),
            }}
          >
            <SelectTrigger id="al-module" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allModules")}</SelectItem>
              {AUDIT_LOG_MODULES.map((module) => (
                <SelectItem key={module.code} value={module.code}>
                  {labels.module(module.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="al-user">{t("userLabel")}</Label>
          <Select
            value={filters.userId}
            onValueChange={(value) => update({ userId: value ?? "ALL" })}
            items={{
              ALL: t("allUsers"),
              ...Object.fromEntries(
                (usersQuery.data?.users.nodes ?? []).map((user) => [
                  user.id,
                  user.fullName,
                ]),
              ),
            }}
          >
            <SelectTrigger id="al-user" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allUsers")}</SelectItem>
              {(usersQuery.data?.users.nodes ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="al-action">{t("actionLabel")}</Label>
          <Input
            id="al-action"
            value={filters.action}
            onChange={(event) => update({ action: event.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="al-resource-type">{t("resourceTypeLabel")}</Label>
          <Input
            id="al-resource-type"
            value={filters.resourceType}
            onChange={(event) => update({ resourceType: event.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="al-resource-id">{t("resourceIdLabel")}</Label>
          <Input
            id="al-resource-id"
            value={filters.resourceId}
            onChange={(event) => update({ resourceId: event.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="al-from">{t("fromLabel")}</Label>
          <Input
            id="al-from"
            type="date"
            value={filters.fromDate}
            onChange={(event) => update({ fromDate: event.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="al-to">{t("toLabel")}</Label>
          <Input
            id="al-to"
            type="date"
            value={filters.toDate}
            onChange={(event) => update({ toDate: event.target.value })}
          />
        </div>
      </section>

      <section>
        <SectionHeader
          title={t("moduleActivityTitle")}
          description={t("moduleActivityDescription")}
        />
        <ModuleActivitySummaryPanel filter={filter} />
      </section>

      <section>
        <SectionHeader
          title={t("eventsTitle")}
          description={t("eventsDescription")}
        />
        {logsQuery.error ? (
          <ErrorState error={logsQuery.error} onRetry={logsQuery.refetch} />
        ) : null}
        {logsQuery.loading && !logsQuery.data ? (
          <LoadingState label={t("loading")} rows={6} />
        ) : null}

        {logsQuery.data && logs.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : null}

        {logs.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">{t("colTimestamp")}</TableHead>
                  <TableHead className="w-40">{t("colUser")}</TableHead>
                  <TableHead className="w-40">{t("colAction")}</TableHead>
                  <TableHead className="w-32">{t("colResourceType")}</TableHead>
                  <TableHead className="w-40">{t("colResourceId")}</TableHead>
                  <TableHead>{t("colNew")}</TableHead>
                  <TableHead className="w-32">{t("colIp")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-xs">
                      {fmt.dateTime(log.createdAt)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.user?.fullName ?? t("systemActor")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.action}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.resourceType}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.resourceId ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-72 truncate text-xs">
                      {formatJson(log.newData)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <PaginationBar
              className="mt-4"
              pageInfo={
                logsQuery.data?.auditLogs.pageInfo ?? {
                  offset,
                  limit: PAGE_LIMIT,
                  totalCount: logs.length,
                  hasNextPage: false,
                }
              }
              limit={PAGE_LIMIT}
              onOffsetChange={setOffset}
            />
          </>
        ) : null}
      </section>
    </div>
  );
}
