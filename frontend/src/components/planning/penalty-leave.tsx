"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { InlineAlert, LoadingState } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import {
  ASSIGN_PENALTY_LEAVE_MUTATION,
  LEAVE_BALANCES_QUERY,
} from "@/lib/mes/queries/planning";
import { PENALTY_LEAVE_CODES } from "@/lib/mes/queries/registries";
import type { LeaveBalance, LeaveCode } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

/**
 * Penalty-leave assignment (`UAL`/`USL`). Offered only to `SUPER_ADMIN` and
 * `HR_MANAGER`; each assignment tags the affected day and records the wage and
 * KPI deduction consequences.
 */
export function PenaltyLeaveSection() {
  const t = useTranslations("planning.penalty");
  const labels = useDomainLabels();
  const errorText = useErrorText();
  const { data, loading, error } = useApiQuery<{
    leaveBalances: LeaveBalance[];
  }>(LEAVE_BALANCES_QUERY, {}, { liveArea: "leave" });
  const assign = useMutation<unknown>(ASSIGN_PENALTY_LEAVE_MUTATION);

  const [userId, setUserId] = useState("");
  const [leaveCode, setLeaveCode] = useState<LeaveCode>("UAL");
  const [workDate, setWorkDate] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const users = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const balance of data?.leaveBalances ?? []) {
      map.set(balance.user.id, {
        id: balance.user.id,
        name: balance.user.fullName,
      });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFeedback(null);
    try {
      await assign.run({
        input: {
          userId,
          leaveCode,
          workDate: new Date(`${workDate}T00:00:00.000Z`).toISOString(),
          note: note.trim() || undefined,
        },
      });
      setFeedback({
        tone: "success",
        message: t("assigned", { name: labels.leaveCode(leaveCode) }),
      });
      setNote("");
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  if (loading && !data) return <LoadingState label={t("loading")} rows={2} />;
  if (error) {
    return <InlineAlert tone="error">{errorText(error)}</InlineAlert>;
  }

  return (
    <section className="flex flex-col gap-3 border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}

      <form onSubmit={submit} className="grid items-end gap-3 md:grid-cols-4">
        <div className="grid gap-1">
          <Label htmlFor="penalty-user">{t("employeeLabel")}</Label>
          <Select
            value={userId}
            onValueChange={(value) => setUserId(value ?? "")}
            items={Object.fromEntries(
              users.map((user) => [user.id, user.name]),
            )}
          >
            <SelectTrigger id="penalty-user" className="w-full">
              <SelectValue placeholder={t("selectEmployee")} />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="penalty-code">{t("penaltyLeaveLabel")}</Label>
          <Select
            value={leaveCode}
            onValueChange={(value) => setLeaveCode(value as LeaveCode)}
            items={Object.fromEntries(
              PENALTY_LEAVE_CODES.map((code) => [code, labels.leaveCode(code)]),
            )}
          >
            <SelectTrigger id="penalty-code" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PENALTY_LEAVE_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {labels.leaveCode(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="penalty-date">{t("workDateLabel")}</Label>
          <Input
            id="penalty-date"
            type="date"
            value={workDate}
            required
            onChange={(event) => setWorkDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="penalty-note">{t("noteLabel")}</Label>
          <Input
            id="penalty-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          className="md:col-span-4 md:w-fit"
          disabled={assign.loading || !userId || !workDate}
        >
          {assign.loading ? t("submitting") : t("submit")}
        </Button>
      </form>
    </section>
  );
}
