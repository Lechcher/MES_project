"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatJson } from "@/components/shared/format";
import { PaginationBar } from "@/components/shared/pagination-bar";
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
import {
  SYSTEM_AUDIT_LOGS_QUERY,
  USERS_QUERY,
} from "@/lib/mes/queries/settings";
import type {
  Connection,
  SystemAuditLog,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";

const PAGE_LIMIT = 20;

/**
 * Read-only System Audit Logs trail.
 *
 * Entries are listed newest first with user, action, resource, old/new values,
 * timestamp, and IP address. The view offers no edit or delete control anywhere
 * — the trail is append-only.
 */
export function SystemAuditLogsPanel() {
  const fmt = useMesFormat();
  const t = useTranslations("settings.audit");
  const [userId, setUserId] = useState("ALL");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);

  const usersQuery = useApiQuery<{ users: Connection<UserRef> }>(
    USERS_QUERY,
    {
      limit: 200,
    },
    { liveArea: "users" },
  );

  const filter = {
    userId: userId === "ALL" ? undefined : userId,
    action: action.trim() || undefined,
    resourceType: resourceType.trim() || undefined,
    fromDate: fromDate
      ? new Date(`${fromDate}T00:00:00.000Z`).toISOString()
      : undefined,
    toDate: toDate
      ? new Date(`${toDate}T23:59:59.999Z`).toISOString()
      : undefined,
  };

  const logsQuery = useApiQuery<{
    systemAuditLogs: Connection<SystemAuditLog>;
  }>(
    SYSTEM_AUDIT_LOGS_QUERY,
    { filter, offset, limit: PAGE_LIMIT },
    {
      liveArea: "audit",
    },
  );

  const logs = logsQuery.data?.systemAuditLogs.nodes ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      <div className="grid gap-3 border border-border p-4 md:grid-cols-5">
        <div className="grid gap-1">
          <Label htmlFor="audit-user">{t("userLabel")}</Label>
          <Select
            value={userId}
            onValueChange={(value) => {
              setUserId(value ?? "ALL");
              setOffset(0);
            }}
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
            <SelectTrigger id="audit-user" className="w-full">
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
          <Label htmlFor="audit-action">{t("actionLabel")}</Label>
          <Input
            id="audit-action"
            value={action}
            placeholder={t("actionPlaceholder")}
            onChange={(event) => {
              setAction(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="audit-resource">{t("resourceLabel")}</Label>
          <Input
            id="audit-resource"
            value={resourceType}
            placeholder={t("resourcePlaceholder")}
            onChange={(event) => {
              setResourceType(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="audit-from">{t("fromLabel")}</Label>
          <Input
            id="audit-from"
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="audit-to">{t("toLabel")}</Label>
          <Input
            id="audit-to"
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>

      {logsQuery.error ? (
        <ErrorState error={logsQuery.error} onRetry={logsQuery.refetch} />
      ) : null}
      {logsQuery.loading && !logsQuery.data ? (
        <LoadingState label={t("loading")} rows={5} />
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
                <TableHead>{t("colOld")}</TableHead>
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
                  <TableCell className="text-xs">{log.resourceType}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {log.resourceId ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-xs">
                    {formatJson(log.oldData)}
                  </TableCell>
                  <TableCell className="max-w-56 truncate text-xs">
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
            pageInfo={
              logsQuery.data?.systemAuditLogs.pageInfo ?? {
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
  );
}
