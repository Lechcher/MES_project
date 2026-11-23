"use client";

import { ShieldBan } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { graphqlRequest } from "@/lib/mes/client";
import {
  SHOPTIFY_CUSTOMERS_QUERY,
  SHOPTIFY_SET_CUSTOMER_FLAGS_MUTATION,
} from "@/lib/mes/queries/shoptify";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMoneyFormatter } from "./shoptify-format";

interface ShoptifyCustomer {
  id: string;
  email: string | null;
  phone: string | null;
  totalOrdersCount: number;
  totalSpent: number;
  isBlacklisted: boolean;
  isHighRisk: boolean;
  notes: string | null;
}

const PAGE_SIZE = 20;

/**
 * Cross-store customer profiles: aggregates, risk flags, and the blacklist
 * toggle. Flags are visible wherever the customer's orders render.
 */
export function CustomersPanel() {
  const t = useTranslations("shoptify.customers");
  const money = useMoneyFormatter();
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ShoptifyCustomer | null>(null);
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const variables = useMemo(
    () => ({
      filter: { search: search.trim() === "" ? undefined : search.trim() },
      offset,
      limit: PAGE_SIZE,
    }),
    [offset, search],
  );

  const { data, loading, error, refetch } = useApiQuery<{
    shoptifyCustomers: {
      nodes: ShoptifyCustomer[];
      pageInfo: {
        offset: number;
        limit: number;
        totalCount: number;
        hasNextPage: boolean;
      };
    };
  }>(SHOPTIFY_CUSTOMERS_QUERY, variables, { liveArea: "shoptify" });

  const customers = data?.shoptifyCustomers.nodes ?? [];
  const pageInfo = data?.shoptifyCustomers.pageInfo;

  async function runFlag(customer: ShoptifyCustomer, isBlacklisted: boolean) {
    setSubmitError(null);
    try {
      await graphqlRequest<{ shoptifySetCustomerFlags: ShoptifyCustomer }>(
        SHOPTIFY_SET_CUSTOMER_FLAGS_MUTATION,
        {
          variables: {
            input: {
              customerId: customer.id,
              isBlacklisted,
              notes: notes.trim() === "" ? null : notes.trim(),
            },
          },
        },
      );
      setEditing(null);
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

      <div className="flex max-w-sm flex-col gap-1">
        <Label htmlFor="customer-search">{t("search")}</Label>
        <Input
          id="customer-search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
          placeholder="buyer@example.com"
        />
      </div>

      {loading ? <LoadingState label={t("loading")} /> : null}
      {error ? <ErrorState error={error} /> : null}
      {!loading && customers.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : null}

      {customers.length > 0 ? (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.customer")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.orders")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("table.spent")}
                  </TableHead>
                  <TableHead>{t("table.flags")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">
                      {customer.email ?? customer.phone ?? customer.id}
                    </TableCell>
                    <TableCell className="text-right">
                      {customer.totalOrdersCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {money(customer.totalSpent)}
                    </TableCell>
                    <TableCell className="flex gap-1">
                      {customer.isBlacklisted ? (
                        <Badge variant="destructive">{t("blacklisted")}</Badge>
                      ) : null}
                      {customer.isHighRisk ? (
                        <Badge variant="secondary">{t("highRisk")}</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditing(customer);
                          setNotes(customer.notes ?? "");
                        }}
                      >
                        <ShieldBan className="mr-2 size-4" aria-hidden />
                        {t("review")}
                      </Button>
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

      {editing ? (
        <div className="grid gap-3 rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="customer-notes">{t("notes")}</Label>
            <Textarea
              id="customer-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => runFlag(editing, true)}
            >
              {t("blacklistAction")}
            </Button>
            <Button variant="outline" onClick={() => runFlag(editing, false)}>
              {t("clearAction")}
            </Button>
          </div>
        </div>
      ) : null}

      {submitError ? (
        <p role="alert" className="text-sm text-destructive">
          {submitError}
        </p>
      ) : null}
    </section>
  );
}
