"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/shared/query-states";
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
import { useMesFormat } from "@/lib/mes/i18n/format";
import {
  SHOPTIFY_BEGIN_OAUTH_MUTATION,
  SHOPTIFY_CONNECT_STORE_MUTATION,
  SHOPTIFY_DEACTIVATE_STORE_MUTATION,
  SHOPTIFY_STORES_QUERY,
} from "@/lib/mes/queries/shoptify";
import { useApiQuery } from "@/lib/mes/queries/use-api";

interface ShoptifyStore {
  id: string;
  name: string;
  shopDomain: string;
  currency: string;
  scopes: string[] | null;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

/**
 * Store connections: the list, the OAuth handshake starter, and the manual
 * Custom App token form. Tokens are never displayed — connecting writes them
 * straight to the encrypted store row.
 */
export function StoresPanel() {
  const t = useTranslations("shoptify.stores");
  const format = useMesFormat();
  const { data, loading, error, refetch } = useApiQuery<{
    shoptifyStores: ShoptifyStore[];
  }>(SHOPTIFY_STORES_QUERY, undefined, { liveArea: "shoptify" });

  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const stores = data?.shoptifyStores ?? [];

  async function runBeginOAuth() {
    if (shopDomain.trim() === "") return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await graphqlRequest<{
        shoptifyBeginOAuth: { redirectUrl: string };
      }>(SHOPTIFY_BEGIN_OAUTH_MUTATION, {
        variables: { shopDomain: shopDomain.trim() },
      });
      window.location.href = result.shoptifyBeginOAuth.redirectUrl;
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runConnectToken() {
    if (shopDomain.trim() === "" || accessToken.trim() === "") return;
    setBusy(true);
    setFormError(null);
    try {
      await graphqlRequest<{ shoptifyConnectStore: ShoptifyStore }>(
        SHOPTIFY_CONNECT_STORE_MUTATION,
        {
          variables: {
            input: {
              shopDomain: shopDomain.trim(),
              accessToken: accessToken.trim(),
            },
          },
        },
      );
      setAccessToken("");
      refetch();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runDeactivate(storeId: string) {
    setBusy(true);
    setFormError(null);
    try {
      await graphqlRequest<{ shoptifyDeactivateStore: ShoptifyStore }>(
        SHOPTIFY_DEACTIVATE_STORE_MUTATION,
        { variables: { storeId } },
      );
      refetch();
    } catch (cause) {
      setFormError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {loading ? <LoadingState label={t("loading")} /> : null}
      {error ? <ErrorState error={error} /> : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.store")}</TableHead>
              <TableHead>{t("table.domain")}</TableHead>
              <TableHead>{t("table.currency")}</TableHead>
              <TableHead>{t("table.status")}</TableHead>
              <TableHead>{t("table.lastSync")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : null}
            {stores.map((store) => (
              <TableRow key={store.id}>
                <TableCell className="font-medium">{store.name}</TableCell>
                <TableCell>{store.shopDomain}</TableCell>
                <TableCell>{store.currency}</TableCell>
                <TableCell>
                  {store.isActive ? t("status.active") : t("status.inactive")}
                </TableCell>
                <TableCell>
                  {store.lastSyncAt ? format.dateTime(store.lastSyncAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {store.isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => runDeactivate(store.id)}
                    >
                      {t("deactivate")}
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 rounded-md border p-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t("connect.title")}</h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="shop-domain">{t("connect.domain")}</Label>
            <Input
              id="shop-domain"
              placeholder="store.myshopify.com"
              value={shopDomain}
              onChange={(event) => setShopDomain(event.target.value)}
            />
          </div>
          <Button disabled={busy} onClick={runBeginOAuth}>
            <Plus className="mr-2 size-4" aria-hidden />
            {t("connect.oauth")}
          </Button>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">{t("token.title")}</h2>
          <div className="flex flex-col gap-2">
            <Label htmlFor="offline-token">{t("connect.token")}</Label>
            <Input
              id="offline-token"
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
            />
          </div>
          <Button variant="outline" disabled={busy} onClick={runConnectToken}>
            {t("connect.tokenSubmit")}
          </Button>
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
    </section>
  );
}
