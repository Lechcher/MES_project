"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import {
  REFRESH_TELEGRAM_AI_MODELS_MUTATION,
  REVOKE_TELEGRAM_LINK_MUTATION,
  SAVE_TELEGRAM_BOT_SETTINGS_MUTATION,
  TELEGRAM_AI_MODELS_QUERY,
  TELEGRAM_BOT_SETTINGS_QUERY,
  TELEGRAM_LINK_CODE_QUERY,
  TELEGRAM_LINKS_QUERY,
} from "@/lib/mes/queries/settings";
import type {
  TelegramAiModel,
  TelegramBotSettings,
  TelegramLink,
  TelegramLinkCode,
} from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

/**
 * Compose the save payload.
 *
 * Secrets are write-only, so the rule lives here as a pure function: a typed
 * secret is sent, an empty field is omitted (which leaves the stored value
 * untouched), and every other setting is always sent — the dialog is a
 * full-save, not a patch. Exported for the unit test.
 */
export function buildBotSaveInput(
  draft: TelegramBotSettings,
  botToken: string,
  aiApiKey: string,
): Record<string, unknown> {
  return {
    isEnabled: draft.isEnabled,
    ...(botToken.trim() !== "" ? { botToken } : {}),
    ...(aiApiKey.trim() !== "" ? { aiApiKey } : {}),
    aiBaseUrl: draft.aiBaseUrl ?? "",
    aiDefaultModel: draft.aiDefaultModel ?? "",
    pushAlertsEnabled: draft.pushAlertsEnabled,
  };
}

/**
 * Inbound Telegram bot configuration (openspec/changes/add-telegram-bot).
 *
 * Environment variables bootstrap a deployment; anything saved here overrides
 * them (per-user model choice overrides both, set inside the bot). Secrets are
 * shown masked from the server and only ever written — a placeholder that
 * keeps a value unchanged unless a new one is typed.
 */
export function TelegramBotPanel() {
  const t = useTranslations("settings.telegramBot");
  const errorText = useErrorText();

  const settingsQuery = useApiQuery<{
    telegramBotSettings: TelegramBotSettings;
  }>(TELEGRAM_BOT_SETTINGS_QUERY, {}, { liveArea: "users" });
  const linksQuery = useApiQuery<{ telegramLinks: TelegramLink[] }>(
    TELEGRAM_LINKS_QUERY,
    {},
    { liveArea: "users" },
  );
  const modelsQuery = useApiQuery<{ telegramAiModels: TelegramAiModel[] }>(
    TELEGRAM_AI_MODELS_QUERY,
    {},
    { liveArea: "users" },
  );

  const save = useMutation<unknown>(SAVE_TELEGRAM_BOT_SETTINGS_MUTATION);
  const refreshModels = useMutation<unknown>(
    REFRESH_TELEGRAM_AI_MODELS_MUTATION,
  );
  const revokeLink = useMutation<unknown>(REVOKE_TELEGRAM_LINK_MUTATION);
  // The link code is issued on demand: the query stays null until the button
  // is pressed, then the string swaps in and the query runs (useQuery treats
  // a null document as disabled).
  const [codeRequested, setCodeRequested] = useState(false);
  const issueCode = useApiQuery<{ telegramLinkCode: TelegramLinkCode }>(
    codeRequested ? TELEGRAM_LINK_CODE_QUERY : null,
    {},
    { liveArea: null },
  );

  const [draft, setDraft] = useState<TelegramBotSettings | null>(null);
  // Secrets are write-only: a typed value replaces the stored one; the
  // placeholder shows the mask. Empty means "leave unchanged".
  const [botToken, setBotToken] = useState("");
  const [aiApiKey, setAiApiKey] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const remote = settingsQuery.data?.telegramBotSettings;
  useEffect(() => {
    if (remote) setDraft(remote);
  }, [remote]);

  const patch = (next: Partial<TelegramBotSettings>) =>
    setDraft((current) => (current ? { ...current, ...next } : current));

  const runSave = async () => {
    if (!draft) return;
    setFeedback(null);
    try {
      await save.run({ input: buildBotSaveInput(draft, botToken, aiApiKey) });
      setBotToken("");
      setAiApiKey("");
      setFeedback({ tone: "success", message: t("saved") });
      settingsQuery.refetch();
    } catch (cause) {
      setFeedback({ tone: "error", message: errorText(cause) });
    }
  };

  const runRefreshModels = async () => {
    setFeedback(null);
    try {
      await refreshModels.run();
      modelsQuery.refetch();
      setFeedback({ tone: "success", message: t("modelsRefreshed") });
    } catch (cause) {
      setFeedback({ tone: "error", message: errorText(cause) });
    }
  };

  const runRevoke = async (linkId: string) => {
    setFeedback(null);
    try {
      await revokeLink.run({ linkId });
      linksQuery.refetch();
      setFeedback({ tone: "success", message: t("linkRevoked") });
    } catch (cause) {
      setFeedback({ tone: "error", message: errorText(cause) });
    }
  };

  const runIssueCode = () => {
    setFeedback(null);
    setCodeRequested(true);
  };

  if (settingsQuery.error) {
    return (
      <ErrorState error={settingsQuery.error} onRetry={settingsQuery.refetch} />
    );
  }
  if (settingsQuery.loading && !draft) {
    return <LoadingState label={t("loading")} rows={4} />;
  }
  if (!draft) return null;

  const linkCode = issueCode.data?.telegramLinkCode;
  // The lazy query widens the data union; unwrap once here so the render
  // below sees plain arrays.
  const models: TelegramAiModel[] =
    (modelsQuery.data as { telegramAiModels?: TelegramAiModel[] } | null)
      ?.telegramAiModels ?? [];
  const links: TelegramLink[] =
    (linksQuery.data as { telegramLinks?: TelegramLink[] } | null)
      ?.telegramLinks ?? [];

  return (
    <section className="flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}

      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="telegram-bot-bot-token">{t("botToken")}</Label>
          <Input
            id="telegram-bot-bot-token"
            type="password"
            autoComplete="off"
            placeholder={draft.botToken ?? t("notSet")}
            value={botToken}
            onChange={(event) => setBotToken(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("botTokenHint")}</p>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="telegram-bot-enabled"
            checked={draft.isEnabled}
            onCheckedChange={(checked) => patch({ isEnabled: checked })}
          />
          <Label htmlFor="telegram-bot-enabled">{t("enabled")}</Label>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="telegram-bot-push"
            checked={draft.pushAlertsEnabled}
            onCheckedChange={(checked) => patch({ pushAlertsEnabled: checked })}
          />
          <Label htmlFor="telegram-bot-push">{t("pushAlerts")}</Label>
        </div>
      </div>

      <div className="grid gap-3 border-t pt-4">
        <h3 className="text-sm font-semibold">{t("aiTitle")}</h3>
        <div className="grid gap-1">
          <Label htmlFor="telegram-bot-ai-base-url">{t("aiBaseUrl")}</Label>
          <Input
            id="telegram-bot-ai-base-url"
            placeholder="https://api.openai.com/v1"
            value={draft.aiBaseUrl ?? ""}
            onChange={(event) => patch({ aiBaseUrl: event.target.value })}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="telegram-bot-ai-api-key">{t("aiApiKey")}</Label>
          <Input
            id="telegram-bot-ai-api-key"
            type="password"
            autoComplete="off"
            placeholder={draft.aiApiKey ?? t("notSet")}
            value={aiApiKey}
            onChange={(event) => setAiApiKey(event.target.value)}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="telegram-bot-ai-model">{t("aiDefaultModel")}</Label>
          <Input
            id="telegram-bot-ai-model"
            list="telegram-bot-model-options"
            placeholder="gpt-4o-mini"
            value={draft.aiDefaultModel ?? ""}
            onChange={(event) => patch({ aiDefaultModel: event.target.value })}
          />
          <datalist id="telegram-bot-model-options">
            {models.map((model) => (
              <option key={model.modelId} value={model.modelId} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">{t("aiModelHint")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={runRefreshModels}
            disabled={refreshModels.loading}
          >
            {refreshModels.loading ? t("refreshing") : t("refreshModels")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("modelsAvailable", { count: models.length })}
          </span>
        </div>
      </div>

      <div className="flex gap-3 border-t pt-4">
        <Button onClick={runSave} disabled={save.loading}>
          {save.loading ? t("saving") : t("save")}
        </Button>
      </div>

      <div className="grid gap-3 border-t pt-4">
        <h3 className="text-sm font-semibold">{t("linkTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("linkDescription")}</p>
        <div>
          <Button
            variant="outline"
            onClick={runIssueCode}
            disabled={issueCode.loading || codeRequested}
          >
            {issueCode.loading ? t("generating") : t("generateCode")}
          </Button>
        </div>
        {linkCode ? (
          <div className="rounded border p-3">
            <code className="text-lg font-mono">{linkCode.code}</code>
            <p className="text-xs text-muted-foreground">
              {t("codeExpires", {
                time: new Date(linkCode.expiresAt).toLocaleTimeString(),
              })}
            </p>
          </div>
        ) : null}
        {linksQuery.loading && links.length === 0 ? (
          <LoadingState label={t("loadingLinks")} rows={2} />
        ) : null}
        {links.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">{t("linkUser")}</th>
                <th className="py-1">{t("linkTelegram")}</th>
                <th className="py-1">{t("linkStatus")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id} className="border-t">
                  <td className="py-1">
                    {link.fullName ?? "—"}{" "}
                    <span className="text-xs text-muted-foreground">
                      {link.userCode ?? ""}
                    </span>
                  </td>
                  <td className="py-1">
                    {link.telegramUsername ?? link.telegramUserId}
                  </td>
                  <td className="py-1">
                    {link.isActive ? t("linkActive") : t("linkInactive")}
                  </td>
                  <td className="py-1 text-right">
                    {link.isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runRevoke(link.id)}
                        disabled={revokeLink.loading}
                      >
                        {t("revoke")}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </section>
  );
}
