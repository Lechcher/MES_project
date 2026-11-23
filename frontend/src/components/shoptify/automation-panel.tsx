"use client";

import { Trash2, Workflow } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { graphqlRequest } from "@/lib/mes/client";
import {
  SHOPTIFY_DELETE_RULE_MUTATION,
  SHOPTIFY_RULES_QUERY,
  SHOPTIFY_SAVE_RULE_MUTATION,
} from "@/lib/mes/queries/shoptify";
import { useApiQuery } from "@/lib/mes/queries/use-api";

interface ShoptifyRule {
  id: string;
  name: string;
  storeId: string | null;
  triggerEvent: string;
  conditions: { field: string; operator: string; value: string }[] | null;
  actions: { type: string }[] | null;
  isActive: boolean;
}

const TRIGGERS = [
  "ORDER_CREATED",
  "ORDER_UPDATED",
  "ORDER_EXCEPTION",
  "STOCK_LOW",
  "REFUND_CREATED",
  "PAYOUT_FAILED",
] as const;

const ACTION_TYPES = ["flag_exception", "annotate", "notify"] as const;

/**
 * Automation rule management (v1 action set: local annotation, exception
 * flag, or a platform notification). Conditions are simple predicates on the
 * event row; anything richer is a later change.
 */
export function AutomationPanel() {
  const t = useTranslations("shoptify.automation");
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<string>("ORDER_CREATED");
  const [actionType, setActionType] = useState<string>("flag_exception");
  const [actionDetail, setActionDetail] = useState("");
  const [conditionField, setConditionField] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApiQuery<{
    shoptifyAutomationRules: ShoptifyRule[];
  }>(SHOPTIFY_RULES_QUERY, undefined, { liveArea: "shoptify" });

  const rules = useMemo(() => data?.shoptifyAutomationRules ?? [], [data]);

  async function runSave() {
    if (name.trim() === "") return;
    setSubmitError(null);
    const actions = [
      actionType === "flag_exception"
        ? { type: "flag_exception", reason: actionDetail || "FRAUD_RISK" }
        : actionType === "annotate"
          ? { type: "annotate", note: actionDetail }
          : { type: "notify", template: actionDetail || "SHOPTIFY_AUTOMATION" },
    ];
    try {
      await graphqlRequest<{ shoptifySaveRule: ShoptifyRule }>(
        SHOPTIFY_SAVE_RULE_MUTATION,
        {
          variables: {
            input: {
              name: name.trim(),
              triggerEvent: trigger,
              actions,
              conditions:
                conditionField.trim() === ""
                  ? null
                  : [
                      {
                        field: conditionField.trim(),
                        operator: "equals",
                        value: "true",
                      },
                    ],
              isActive: true,
            },
          },
        },
      );
      setName("");
      setActionDetail("");
      setConditionField("");
      refetch();
    } catch (cause) {
      setSubmitError((cause as Error).message);
    }
  }

  async function runDelete(ruleId: string) {
    setSubmitError(null);
    try {
      await graphqlRequest<{ shoptifyDeleteRule: boolean }>(
        SHOPTIFY_DELETE_RULE_MUTATION,
        { variables: { ruleId } },
      );
      refetch();
    } catch (cause) {
      setSubmitError((cause as Error).message);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <AppPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      {loading ? <LoadingState label={t("loading")} /> : null}
      {error ? <ErrorState error={error} /> : null}
      {!loading && rules.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : null}

      {rules.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.trigger")}</TableHead>
                <TableHead>{t("table.actions")}</TableHead>
                <TableHead>{t("table.state")}</TableHead>
                <TableHead className="text-right">
                  {t("table.actions2")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{rule.triggerEvent}</TableCell>
                  <TableCell>
                    {(rule.actions ?? [])
                      .map((action) => action.type)
                      .join(", ")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.isActive ? "default" : "secondary"}>
                      {rule.isActive ? t("enabled") : t("disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => runDelete(rule.id)}
                    >
                      <Trash2 className="mr-2 size-4" aria-hidden />
                      {t("delete")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
        <h2 className="text-sm font-semibold md:col-span-2">
          {t("form.title")}
        </h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-name">{t("form.name")}</Label>
          <Input
            id="rule-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t("form.trigger")}</Label>
          <Select
            value={trigger}
            onValueChange={(value) => setTrigger(value ?? "ORDER_CREATED")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRIGGERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t("form.action")}</Label>
          <Select
            value={actionType}
            onValueChange={(value) => setActionType(value ?? "flag_exception")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="action-detail">{t("form.detail")}</Label>
          <Input
            id="action-detail"
            value={actionDetail}
            onChange={(event) => setActionDetail(event.target.value)}
            placeholder={t("form.detailPlaceholder")}
          />
        </div>
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label htmlFor="condition-field">{t("form.condition")}</Label>
          <Input
            id="condition-field"
            value={conditionField}
            onChange={(event) => setConditionField(event.target.value)}
            placeholder="total_price"
          />
        </div>
        <div className="md:col-span-2">
          <Button onClick={runSave}>
            <Workflow className="mr-2 size-4" aria-hidden />
            {t("form.save")}
          </Button>
        </div>
      </div>

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
    </section>
  );
}
