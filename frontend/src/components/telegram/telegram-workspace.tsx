"use client";

/**
 * The Telegram workspace.
 *
 * Wraps the module's route scope in the provider (the accounts load and their
 * sessions restore here, and a half-finished login's slot is cleared when the
 * viewer leaves), then renders the module's states: loading, a load failure
 * with a retry, the empty state that opens the embedded client's own login,
 * and — with accounts restored — the client's workspace itself.
 *
 * There is no MES switcher here on purpose: the embedded Telegram Web client
 * manages several accounts natively (its own account switcher and add-account
 * flow), and MES restored all of them on open, so every one of them is
 * reachable inside the client without a login step.
 */

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { Button } from "@/components/ui/button";
import {
  TelegramProvider,
  useTelegramController,
  useTelegramState,
} from "@/lib/telegram/provider";
import { ClientFrame } from "./client-frame";

function WorkspaceStates() {
  const t = useTranslations("telegram.workspace");
  const state = useTelegramState();
  const controller = useTelegramController();

  const activeAccountId = state?.activeAccountId ?? null;
  const activeEntry = state?.accounts.find(
    (entry) => entry.account.id === activeAccountId,
  );

  // The first restorable account opens by default; later loads keep the
  // viewer's selection.
  const firstAccountId =
    state?.accounts.find((entry) => !entry.needsRelink)?.account.id ?? null;
  useEffect(() => {
    if (firstAccountId !== null && activeAccountId === null) {
      controller?.selectAccount(firstAccountId);
    }
  }, [firstAccountId, activeAccountId, controller]);

  if (state === null) return null;
  if (state.loading) {
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  }
  if (state.loadFailed) {
    return (
      <div role="alert" className="py-8">
        <p className="text-sm text-destructive">{t("loadFailed")}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => void controller?.start().catch(() => {})}
        >
          {t("retry")}
        </Button>
      </div>
    );
  }
  if (state.accounts.length === 0) {
    return (
      <div className="py-8">
        <h2 className="text-lg font-light text-foreground">
          {t("emptyTitle")}
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>
        <Button className="mt-4" onClick={() => controller?.startLinking()}>
          {t("addFirst")}
        </Button>
      </div>
    );
  }

  return (
    <div className="border border-border">
      {activeEntry?.needsRelink === true ? (
        <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          {t("relinkHint")}
        </p>
      ) : null}
      <ClientFrame
        slot={state.iframeSlot}
        label={activeEntry?.account.firstName ?? t("frameLabel")}
      />
    </div>
  );
}

export function TelegramWorkspace() {
  const t = useTranslations("telegram");
  return (
    <TelegramProvider>
      <AppPageHeader
        eyebrow="Telegram"
        title={t("workspace.title")}
        description={t("workspace.description")}
      />
      <WorkspaceStates />
    </TelegramProvider>
  );
}
