"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { InlineAlert } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import {
  LEAVE_BALANCES_QUERY,
  REGISTER_LEAVE_MUTATION,
} from "@/lib/mes/queries/planning";
import { LEAVE_REQUEST_CODES } from "@/lib/mes/queries/registries";
import { USERS_QUERY } from "@/lib/mes/queries/settings";
import type {
  Connection,
  LeaveBalance,
  LeaveCode,
  RoleCode,
  UserRef,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation, useRoleCode, useViewer } from "@/lib/mes/session";

function totalDays(start: string, end: string): number {
  if (!start || !end) return 0;
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(`${end}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  if (to < from) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

/** Create Leave Request — leave code, dates, reason, attachment, handover. */
export function CreateLeaveView() {
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const t = useTranslations("planning.createLeave");
  const tCommon = useTranslations("common");
  const labels = useDomainLabels();
  const errorText = useErrorText();
  const router = useRouter();

  const canListUsers =
    role === "SUPER_ADMIN" || role === "TECH_LEAD" || role === "HR_MANAGER";

  const usersQuery = useApiQuery<{ users: Connection<UserRef> }>(
    USERS_QUERY,
    { limit: 200 },
    { enabled: canListUsers, liveArea: "users" },
  );
  // Employees and Department Heads cannot read the user directory; their
  // in-scope people are derived from the leave-balance read instead.
  const balancesQuery = useApiQuery<{ leaveBalances: LeaveBalance[] }>(
    LEAVE_BALANCES_QUERY,
    {},
    { enabled: !canListUsers, liveArea: "leave" },
  );

  const register = useMutation<unknown>(REGISTER_LEAVE_MUTATION);

  const [leaveCode, setLeaveCode] = useState<LeaveCode>("AL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [handoverUserId, setHandoverUserId] = useState("NONE");
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const handoverOptions = useMemo(() => {
    if (canListUsers) {
      return (usersQuery.data?.users.nodes ?? []).filter(
        (user) => user.id !== viewer?.id,
      );
    }
    const map = new Map<string, UserRef>();
    for (const balance of balancesQuery.data?.leaveBalances ?? []) {
      if (balance.user.id !== viewer?.id)
        map.set(balance.user.id, balance.user);
    }
    return [...map.values()];
  }, [canListUsers, usersQuery.data, balancesQuery.data, viewer]);

  const days = totalDays(startDate, endDate);

  if (!viewer) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    if (days <= 0) {
      setFeedback({
        tone: "error",
        message: t("invalidRange"),
      });
      return;
    }
    try {
      await register.run({
        input: {
          leaveCode,
          startDate: new Date(`${startDate}T00:00:00.000Z`).toISOString(),
          endDate: new Date(`${endDate}T00:00:00.000Z`).toISOString(),
          reason: reason.trim(),
          handoverUserId:
            handoverUserId === "NONE" ? undefined : handoverUserId,
        },
      });
      setFeedback({
        tone: "success",
        message: t("registered"),
      });
      router.push("/planning");
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("planning")}
        title={t("title")}
        description={t("description")}
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/planning" />}
          >
            {t("backToPlanning")}
          </Button>
        }
      />

      {feedback ? (
        <div className="mb-4">
          <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("cardTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-1">
                <Label htmlFor="leave-code">{t("leaveCodeLabel")}</Label>
                <Select
                  value={leaveCode}
                  onValueChange={(value) => setLeaveCode(value as LeaveCode)}
                  items={Object.fromEntries(
                    LEAVE_REQUEST_CODES.map((code) => [
                      code,
                      labels.leaveCode(code),
                    ]),
                  )}
                >
                  <SelectTrigger id="leave-code" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_REQUEST_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {labels.leaveCode(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("penaltyNote")}
                </p>
              </div>

              <div className="grid gap-1">
                <Label htmlFor="leave-handover">{t("handoverLabel")}</Label>
                <Select
                  value={handoverUserId}
                  onValueChange={(value) => setHandoverUserId(value ?? "NONE")}
                  items={{
                    NONE: t("none"),
                    ...Object.fromEntries(
                      handoverOptions.map((user) => [user.id, user.fullName]),
                    ),
                  }}
                >
                  <SelectTrigger id="leave-handover" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">{t("none")}</SelectItem>
                    {handoverOptions.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {handoverOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("noColleagues")}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-1">
                <Label htmlFor="leave-start">{t("startDate")}</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={startDate}
                  required
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="leave-end">{t("endDate")}</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={endDate}
                  required
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="leave-days">{t("totalDays")}</Label>
                <Input
                  id="leave-days"
                  value={days > 0 ? String(days) : ""}
                  readOnly
                  placeholder={t("daysPlaceholder")}
                />
              </div>

              <div className="grid gap-1">
                <Label htmlFor="leave-attachment">{t("attachment")}</Label>
                <Input id="leave-attachment" type="file" disabled />
                <p className="text-xs text-muted-foreground">
                  {t("attachmentNote")}
                </p>
              </div>

              <div className="grid gap-1 md:col-span-2">
                <Label htmlFor="leave-reason">{t("reasonLabel")}</Label>
                <Textarea
                  id="leave-reason"
                  value={reason}
                  required
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex gap-2">
          <Button type="submit" disabled={register.loading || days <= 0}>
            {register.loading ? t("submitting") : t("submit")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/planning")}
          >
            {tCommon("cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
