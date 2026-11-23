"use client";

import { Coins } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { PaginationBar } from "@/components/shared/pagination-bar";
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
import { useMesFormat } from "@/lib/mes/i18n/format";
import {
  SHOPTIFY_ORDERS_QUERY,
  SHOPTIFY_PAYOUTS_QUERY,
  SHOPTIFY_RECORD_PAYOUT_MUTATION,
  SHOPTIFY_SET_ORDER_EXPENSES_MUTATION,
  SHOPTIFY_STORES_QUERY,
} from "@/lib/mes/queries/shoptify";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMoneyFormatter } from "./shoptify-format";

interface ShoptifyPayout {
  id: string;
  storeName: string | null;
  shopifyPayoutId: string;
  amount: number;
  currency: string;
  status: string;
  payoutDate: string | null;
}

interface ShoptifyOrderRef {
  id: string;
  orderNumber: string | null;
  shopifyOrderId: string;
  netProfit: number | null;
}

const PAGE_SIZE = 20;

/**
 * Finance board: payout lifecycle, the per-order cost entry form, and the
 * resulting net profit. Net profit is `revenue - cogs - shipping - gateway fee
 * - ad spend`, recomputed server-side on every submission.
 */
export function FinancePanel() {
  const t = useTranslations("shoptify.finance");
  const format = useMesFormat();
  const money = useMoneyFormatter();
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<ShoptifyOrderRef | null>(null);
  const [expenses, setExpenses] = useState({
    revenue: "",
    cogs: "",
    shipping: "",
    gatewayFee: "",
    adSpend: "",
  });
  const [payout, setPayout] = useState({
    payoutId: "",
    amount: "",
    status: "SCHEDULED",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const variables = useMemo(() => ({ offset, limit: PAGE_SIZE }), [offset]);
  const payouts = useApiQuery<{
    shoptifyPayouts: {
      nodes: ShoptifyPayout[];
      pageInfo: {
        offset: number;
        limit: number;
        totalCount: number;
        hasNextPage: boolean;
      };
    };
  }>(SHOPTIFY_PAYOUTS_QUERY, variables, { liveArea: "shoptify" });
  const orders = useApiQuery<{
    shoptifyOrders: {
      nodes: ShoptifyOrderRef[];
      pageInfo: {
        offset: number;
        limit: number;
        totalCount: number;
        hasNextPage: boolean;
      };
    };
  }>(SHOPTIFY_ORDERS_QUERY, variables, { liveArea: "shoptify" });
  const stores = useApiQuery<{
    shoptifyStores: { id: string; name: string }[];
  }>(SHOPTIFY_STORES_QUERY, undefined, { liveArea: "shoptify" });

  async function runSaveExpenses() {
    if (!editing) return;
    setSubmitError(null);
    try {
      await graphqlRequest<{
        shoptifySetOrderExpenses: { id: string; netProfit: number };
      }>(SHOPTIFY_SET_ORDER_EXPENSES_MUTATION, {
        variables: {
          input: {
            orderId: editing.id,
            revenue: Math.round(Number(expenses.revenue || 0) * 100),
            cogs: Math.round(Number(expenses.cogs || 0) * 100),
            shipping: Math.round(Number(expenses.shipping || 0) * 100),
            gatewayFee: Math.round(Number(expenses.gatewayFee || 0) * 100),
            adSpend: Math.round(Number(expenses.adSpend || 0) * 100),
          },
        },
      });
      setEditing(null);
      orders.refetch();
    } catch (cause) {
      setSubmitError((cause as Error).message);
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <AppPageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("payouts")}</h2>
        {payouts.loading ? <LoadingState label={t("loading")} /> : null}
        {payouts.error ? <ErrorState error={payouts.error} /> : null}
        {(payouts.data?.shoptifyPayouts.nodes ?? []).length === 0 &&
        !payouts.loading ? (
          <EmptyState title={t("emptyPayouts")} />
        ) : null}
        {(payouts.data?.shoptifyPayouts.nodes ?? []).length > 0 ? (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("table.store")}</TableHead>
                    <TableHead>{t("table.payout")}</TableHead>
                    <TableHead className="text-right">
                      {t("table.amount")}
                    </TableHead>
                    <TableHead>{t("table.status")}</TableHead>
                    <TableHead>{t("table.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.data?.shoptifyPayouts.nodes.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.storeName ?? "—"}</TableCell>
                      <TableCell>{row.shopifyPayoutId}</TableCell>
                      <TableCell className="text-right">
                        {money(row.amount, row.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {row.payoutDate ? format.date(row.payoutDate) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {payouts.data ? (
              <PaginationBar
                pageInfo={payouts.data.shoptifyPayouts.pageInfo}
                limit={PAGE_SIZE}
                onOffsetChange={setOffset}
              />
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">{t("profit")}</h2>
        {orders.loading ? <LoadingState label={t("loading")} /> : null}
        {orders.error ? <ErrorState error={orders.error} /> : null}
        {(orders.data?.shoptifyOrders.nodes ?? []).length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.order")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.netProfit")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.data?.shoptifyOrders.nodes.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">
                      {order.orderNumber ?? order.shopifyOrderId}
                    </TableCell>
                    <TableCell className="text-right">
                      {order.netProfit === null ? "—" : money(order.netProfit)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(order);
                          setExpenses({
                            revenue: "",
                            cogs: "",
                            shipping: "",
                            gatewayFee: "",
                            adSpend: "",
                          });
                        }}
                      >
                        <Coins className="mr-2 size-4" aria-hidden />
                        {t("enterCosts")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="grid gap-3 rounded-md border p-4 md:grid-cols-5">
          {(
            ["revenue", "cogs", "shipping", "gatewayFee", "adSpend"] as const
          ).map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <Label htmlFor={`expense-${field}`}>{t(`costs.${field}`)}</Label>
              <Input
                id={`expense-${field}`}
                value={expenses[field]}
                onChange={(event) =>
                  setExpenses((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
                placeholder="0.00"
              />
            </div>
          ))}
          <div className="flex items-end">
            <Button onClick={runSaveExpenses}>{t("saveCosts")}</Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
        <h2 className="text-sm font-semibold md:col-span-4">
          {t("recordPayout")}
        </h2>
        <div className="flex flex-col gap-1">
          <Label htmlFor="payout-id">{t("payoutId")}</Label>
          <Input
            id="payout-id"
            value={payout.payoutId}
            onChange={(event) =>
              setPayout((previous) => ({
                ...previous,
                payoutId: event.target.value,
              }))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="payout-amount">{t("payoutAmount")}</Label>
          <Input
            id="payout-amount"
            value={payout.amount}
            onChange={(event) =>
              setPayout((previous) => ({
                ...previous,
                amount: event.target.value,
              }))
            }
            placeholder="500.00"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t("payoutStatus")}</Label>
          <Select
            value={payout.status}
            onValueChange={(value) =>
              setPayout((previous) => ({
                ...previous,
                status: value ?? "SCHEDULED",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SCHEDULED">SCHEDULED</SelectItem>
              <SelectItem value="IN_TRANSIT">IN_TRANSIT</SelectItem>
              <SelectItem value="PAID">PAID</SelectItem>
              <SelectItem value="FAILED">FAILED</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button
            variant="outline"
            onClick={async () => {
              const storeId = stores.data?.shoptifyStores[0]?.id;
              if (!storeId || payout.payoutId.trim() === "") return;
              setSubmitError(null);
              try {
                await graphqlRequest<{ shoptifyRecordPayout: ShoptifyPayout }>(
                  SHOPTIFY_RECORD_PAYOUT_MUTATION,
                  {
                    variables: {
                      input: {
                        storeId,
                        shopifyPayoutId: payout.payoutId.trim(),
                        amount: Math.round(Number(payout.amount || 0) * 100),
                        currency: "USD",
                        status: payout.status,
                      },
                    },
                  },
                );
                setPayout({ payoutId: "", amount: "", status: "SCHEDULED" });
                payouts.refetch();
              } catch (cause) {
                setSubmitError((cause as Error).message);
              }
            }}
          >
            {t("savePayout")}
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
