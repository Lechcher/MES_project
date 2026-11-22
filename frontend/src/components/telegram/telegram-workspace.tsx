"use client";

/**
 * The Telegram workspace.
 *
 * Wraps the module's route scope in the provider (the accounts load and their
 * sessions restore here, and a half-finished login's slot is cleared when the
 * viewer leaves), then renders the module's states: loading, a load failure
 * with a retry, the linking view that opens the embedded client's own login,
 * and — with accounts restored — the client's workspace itself.
 *
 * There is no MES switcher or login affordance here on purpose: the embedded
 * Telegram Web client manages several accounts natively (its own account
 * switcher and add-account flow), and MES restored all of them on open, so
 * every one of them is reachable inside the client without a login step.
 */

import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { Button } from "@/components/ui/button";
import { useThemeChoice } from "@/lib/mes/theme/provider";
import {
  TelegramProvider,
  useTelegramController,
  useTelegramState,
} from "@/lib/telegram/provider";
import type {
  TelegramAccountEntry,
  TelegramControllerState,
} from "@/lib/telegram/telegram-controller";
import { useThemeSync } from "@/lib/telegram/theme-sync";
import { ClientFrame } from "./client-frame";

/**
 * What the workspace shows for a controller state.
 *
 * `linking` is the first-visit surface: the embedded client mounted at a
 * linking slot, its own login screen on show. A viewer with no linked
 * account must never be met by a module-owned affordance instead — that was
 * the defect: the empty branch returned before the frame, so the button's
 * `startLinking()` mounted nothing and the client's login was unreachable.
 */
export type WorkspaceView = "loading" | "loadFailed" | "linking" | "accounts";

/** The view a controller state renders, or `null` outside the provider. */
export function workspaceView(
  state: TelegramControllerState | null,
): WorkspaceView | null {
  if (state === null) return null;
  if (state.loading) return "loading";
  if (state.loadFailed) return "loadFailed";
  if (state.accounts.length === 0) return "linking";
  return "accounts";
}

/**
 * The account the workspace opens by default.
 *
 * The first account that restores opens when there is one — a mixed list
 * keeps opening a live account, its dead sibling reachable through the
 * client's own switcher. When nothing restores the first account opens
 * anyway: the controller mounts such an account at a linking slot (the
 * client's own login on show) and the re-link hint renders above the frame,
 * so a viewer whose only account lost its session is offered its re-link
 * instead of an empty module. `null` only when there are no accounts.
 */
export function defaultAccountId(
  accounts: TelegramAccountEntry[],
): string | null {
  return (
    accounts.find((entry) => !entry.needsRelink)?.account.id ??
    accounts[0]?.account.id ??
    null
  );
}

export function WorkspaceStates() {
  const t = useTranslations("telegram.workspace");
  const state = useTelegramState();
  const controller = useTelegramController();
  // The embedded client follows the resolved MES theme: posted on every
  // change and on every frame load, and carried by each frame's URL at boot.
  const { theme } = useThemeChoice();
  useThemeSync(theme);

  const activeAccountId = state?.activeAccountId ?? null;
  const activeEntry = state?.accounts.find(
    (entry) => entry.account.id === activeAccountId,
  );

  // The first restorable account opens by default — else the first account,
  // so a viewer whose only account no longer restores still gets it opened
  // (at a linking slot, with its re-link hint). Later loads keep the
  // viewer's selection.
  const firstAccountId =
    state === null ? null : defaultAccountId(state.accounts);
  useEffect(() => {
    if (firstAccountId !== null && activeAccountId === null) {
      controller?.selectAccount(firstAccountId);
    }
  }, [firstAccountId, activeAccountId, controller]);

  // A viewer with no linked accounts is met by the client's own login on
  // open: start a linking slot so the frame mounts the embedded client,
  // which shows its native login screen. Nothing is recorded until a login
  // completes, so an abandoned login still leaves no account behind.
  useEffect(() => {
    if (
      state !== null &&
      !state.loading &&
      !state.loadFailed &&
      state.accounts.length === 0 &&
      state.iframeSlot === null
    ) {
      controller?.startLinking();
    }
  }, [state, controller]);

  if (state === null) return null;
  const view = workspaceView(state);
  if (view === "loading") {
    return (
      <p role="status" className="py-8 text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  }
  if (view === "loadFailed") {
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
  if (view === "linking") {
    // First visit (or every account removed): the client's own login is the
    // linking surface, mounted at the linking slot the effect above started.
    return (
      <div className="py-8">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("linkHint")}
        </p>
        <div className="mt-4 border border-border">
          <ClientFrame
            slot={state.iframeSlot}
            label={t("frameLabel")}
            theme={theme}
          />
        </div>
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
        theme={theme}
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
