"use client";

import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { ExportButton } from "@/components/shared/export-action";
import { PaginationBar } from "@/components/shared/pagination-bar";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  SHOPTIFY_BULK_FULFILL_MUTATION,
  SHOPTIFY_EXPORT_ORDERS_MUTATION,
  SHOPTIFY_ORDERS_QUERY,
} from "@/lib/mes/queries/shoptify";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMoneyFormatter } from "./shoptify-format";

interface ShoptifyOrder {
  id: string;
  storeId: string;
  storeName: string | null;
  shopifyOrderId: string;
  orderNumber: string | null;
  customerEmail: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  totalPrice: number;
  currency: string;
  tags: string[] | null;
  hasException: boolean;
  exceptionReason: string | null;
  shopifyCreatedAt: string | null;
}

const PAGE_SIZE = 20;

/**
 * Cross-store order board: filters over every permitted store, order detail
 * feedback, and bulk fulfillment with tracking. Selection is the only bulk
 * action this panel ships; refunds and edits land in later changes.
 */
export function OrdersPanel() {
  const t = useTranslations("shoptify.orders");
  const format = useMesFormat();
  const money = useMoneyFormatter();
  const [offset, setOffset] = useState(0);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>("open");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tracking, setTracking] = useState({
    company: "",
    number: "",
    url: "",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const variables = useMemo(
    () => ({
      filter: {
        storeId: storeFilter === "all" ? undefined : storeFilter,
        fulfillmentStatus:
          fulfillmentFilter === "all" ? undefined : fulfillmentFilter,
        search: search.trim() === "" ? undefined : search.trim(),
      },
      offset,
      limit: PAGE_SIZE,
    }),
    [offset, storeFilter, fulfillmentFilter, search],
  );

  const { data, loading, error, refetch } = useApiQuery<{
    shoptifyOrders: {
      nodes: ShoptifyOrder[];
      pageInfo: {
        offset: number;
        limit: number;
        totalCount: number;
        hasNextPage: boolean;
      };
    };
  }>(SHOPTIFY_ORDERS_QUERY, variables, { liveArea: "shoptify" });

  const orders = data?.shoptifyOrders.nodes ?? [];
  const pageInfo = data?.shoptifyOrders.pageInfo;
  const openOrders = orders.filter(
    (order) =>
      order.fulfillmentStatus !== "FULFILLED" &&
      order.fulfillmentStatus !== "fulfilled",
  );

  async function runBulkFulfill() {
    if (
      selected.size === 0 ||
      tracking.company.trim() === "" ||
      tracking.number.trim() === ""
    ) {
      return;
    }
    setSubmitError(null);
    try {
      const result = await graphqlRequest<{
        shoptifyBulkFulfill: {
          succeeded: { id: string }[];
          failed: { orderId: string; message: string }[];
        };
      }>(SHOPTIFY_BULK_FULFILL_MUTATION, {
        variables: {
          input: {
            items: [...selected].map((orderId) => ({
              orderId,
              trackingCompany: tracking.company.trim(),
              trackingNumber: tracking.number.trim(),
              trackingUrl: tracking.url.trim() || null,
            })),
          },
        },
      });
      if (result.shoptifyBulkFulfill.failed.length > 0) {
        setSubmitError(
          result.shoptifyBulkFulfill.failed
            .map((failure) => `${failure.orderId}: ${failure.message}`)
            .join("; "),
        );
      }
      setSelected(new Set());
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
        actions={
          <ExportButton
            label={t("export")}
            mutation={SHOPTIFY_EXPORT_ORDERS_MUTATION}
            resultKey="shoptifyExportOrders"
            variables={{ filter: variables.filter }}
          />
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="order-search">{t("filters.search")}</Label>
          <Input
            id="order-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder="#1001"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t("filters.fulfillment")}</Label>
          <Select
            value={fulfillmentFilter}
            onValueChange={(value) => {
              setFulfillmentFilter(value ?? "open");
              setOffset(0);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("filters.open")}</SelectItem>
              <SelectItem value="all">{t("filters.all")}</SelectItem>
              <SelectItem value="FULFILLED">
                {t("filters.fulfilled")}
              </SelectItem>
              <SelectItem value="UNFULFILLED">
                {t("filters.unfulfilled")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label>{t("filters.store")}</Label>
          <Select
            value={storeFilter}
            onValueChange={(value) => {
              setStoreFilter(value ?? "all");
              setOffset(0);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allStores")}</SelectItem>
              {orders
                .filter(
                  (order, index, all) =>
                    all.findIndex(
                      (other) => other.storeId === order.storeId,
                    ) === index,
                )
                .map((order) => (
                  <SelectItem key={order.storeId} value={order.storeId}>
                    {order.storeName ?? order.storeId}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? <LoadingState label={t("loading")} /> : null}
      {error ? <ErrorState error={error} /> : null}

      {!loading && orders.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : null}

      {orders.length > 0 ? (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t("selectAll")}
                      checked={
                        openOrders.length > 0 &&
                        openOrders.every((order) => selected.has(order.id))
                      }
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked
                            ? new Set(openOrders.map((order) => order.id))
                            : new Set(),
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>{t("table.order")}</TableHead>
                  <TableHead>{t("table.store")}</TableHead>
                  <TableHead>{t("table.customer")}</TableHead>
                  <TableHead>{t("table.financial")}</TableHead>
                  <TableHead>{t("table.fulfillment")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.total")}
                  </TableHead>
                  <TableHead>{t("table.created")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={t("selectOrder", {
                          order: order.orderNumber ?? order.shopifyOrderId,
                        })}
                        disabled={
                          order.fulfillmentStatus === "FULFILLED" ||
                          order.fulfillmentStatus === "fulfilled"
                        }
                        checked={selected.has(order.id)}
                        onCheckedChange={(checked) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (checked) next.add(order.id);
                            else next.delete(order.id);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {order.orderNumber ?? order.shopifyOrderId}
                      {order.hasException ? (
                        <span className="ml-2 text-xs text-destructive">
                          {order.exceptionReason ?? t("exception")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{order.storeName ?? order.storeId}</TableCell>
                    <TableCell>{order.customerEmail ?? "—"}</TableCell>
                    <TableCell>{order.financialStatus ?? "—"}</TableCell>
                    <TableCell>
                      {order.fulfillmentStatus ?? t("unfulfilled")}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(order.totalPrice, order.currency)}
                    </TableCell>
                    <TableCell>
                      {order.shopifyCreatedAt
                        ? format.dateTime(order.shopifyCreatedAt)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pageInfo ? (
            <PaginationBar
              pageInfo={pageInfo}
              limit={PAGE_SIZE}
              onOffsetChange={setOffset}
            />
          ) : null}
        </>
      ) : null}

      <div className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="tracking-company">{t("tracking.company")}</Label>
          <Input
            id="tracking-company"
            value={tracking.company}
            onChange={(event) =>
              setTracking((previous) => ({
                ...previous,
                company: event.target.value,
              }))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tracking-number">{t("tracking.number")}</Label>
          <Input
            id="tracking-number"
            value={tracking.number}
            onChange={(event) =>
              setTracking((previous) => ({
                ...previous,
                number: event.target.value,
              }))
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="tracking-url">{t("tracking.url")}</Label>
          <Input
            id="tracking-url"
            value={tracking.url}
            onChange={(event) =>
              setTracking((previous) => ({
                ...previous,
                url: event.target.value,
              }))
            }
          />
        </div>
        <div className="flex items-end">
          <Button disabled={selected.size === 0} onClick={runBulkFulfill}>
            <Package className="mr-2 size-4" aria-hidden />
            {t("fulfillSelected", { count: selected.size })}
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
