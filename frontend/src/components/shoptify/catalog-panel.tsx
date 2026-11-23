"use client";

import { RefreshCw } from "lucide-react";
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
import { graphqlRequest } from "@/lib/mes/client";
import {
  SHOPTIFY_EXPORT_PRODUCTS_MUTATION,
  SHOPTIFY_PRODUCTS_QUERY,
  SHOPTIFY_UPDATE_VARIANT_MUTATION,
} from "@/lib/mes/queries/shoptify";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMoneyFormatter } from "./shoptify-format";

interface ShoptifyVariant {
  id: string;
  storeName: string | null;
  sku: string | null;
  masterSku: string | null;
  price: number | null;
  availableQuantity: number;
  minStockLevel: number | null;
  isLowStock: boolean;
}

interface ShoptifyProduct {
  id: string;
  title: string;
  status: string | null;
  variants: ShoptifyVariant[];
}

const PAGE_SIZE = 20;

/**
 * Catalog board: products with their variants grouped by `master_sku`, the
 * low-stock indicator, and the cross-store quantity/price bulk update (one
 * submission applies to every variant sharing the master SKU).
 */
export function CatalogPanel() {
  const t = useTranslations("shoptify.catalog");
  const money = useMoneyFormatter();
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<ShoptifyVariant | null>(null);
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const variables = useMemo(() => ({ offset, limit: PAGE_SIZE }), [offset]);
  const { data, loading, error, refetch } = useApiQuery<{
    shoptifyProducts: {
      nodes: ShoptifyProduct[];
      pageInfo: {
        offset: number;
        limit: number;
        totalCount: number;
        hasNextPage: boolean;
      };
    };
  }>(SHOPTIFY_PRODUCTS_QUERY, variables, { liveArea: "shoptify" });

  const products = data?.shoptifyProducts.nodes ?? [];
  const pageInfo = data?.shoptifyProducts.pageInfo;

  async function runUpdate() {
    if (!editing) return;
    setSubmitError(null);
    try {
      await graphqlRequest<{ shoptifyUpdateVariant: ShoptifyVariant }>(
        SHOPTIFY_UPDATE_VARIANT_MUTATION,
        {
          variables: {
            input: {
              variantId: editing.id,
              availableQuantity:
                quantity.trim() === "" ? undefined : Number(quantity),
              price:
                price.trim() === ""
                  ? undefined
                  : Math.round(Number(price) * 100),
            },
          },
        },
      );
      setEditing(null);
      setQuantity("");
      setPrice("");
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
            mutation={SHOPTIFY_EXPORT_PRODUCTS_MUTATION}
            resultKey="shoptifyExportProducts"
            variables={{}}
          />
        }
      />

      {loading ? <LoadingState label={t("loading")} /> : null}
      {error ? <ErrorState error={error} /> : null}
      {!loading && products.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : null}

      {products.length > 0 ? (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.product")}</TableHead>
                  <TableHead>{t("table.store")}</TableHead>
                  <TableHead>{t("table.sku")}</TableHead>
                  <TableHead>{t("table.masterSku")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.price")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("table.quantity")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("table.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.flatMap((product) =>
                  product.variants.map((variant) => (
                    <TableRow key={variant.id}>
                      <TableCell className="font-medium">
                        {product.title}
                      </TableCell>
                      <TableCell>{variant.storeName ?? "—"}</TableCell>
                      <TableCell>{variant.sku ?? "—"}</TableCell>
                      <TableCell>{variant.masterSku ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {variant.price === null ? "—" : money(variant.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {variant.availableQuantity}
                        {variant.isLowStock ? (
                          <Badge variant="destructive" className="ml-2">
                            {t("lowStock")}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(variant);
                            setQuantity(String(variant.availableQuantity));
                            setPrice(
                              variant.price === null
                                ? ""
                                : String(variant.price / 100),
                            );
                          }}
                        >
                          {t("edit")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )),
                )}
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
        <div className="grid gap-3 rounded-md border p-4 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="variant-quantity">{t("editQuantity")}</Label>
            <Input
              id="variant-quantity"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="variant-price">{t("editPrice")}</Label>
            <Input
              id="variant-price"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button onClick={runUpdate}>
              <RefreshCw className="mr-2 size-4" aria-hidden />
              {t("syncAll", { sku: editing.masterSku ?? editing.sku ?? "—" })}
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
