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
  TELEGRAM_WEBHOOK_QUERY,
  UPDATE_TELEGRAM_WEBHOOK_MUTATION,
} from "@/lib/mes/queries/settings";
import type { TelegramWebhookConfig } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

/**
 * Telegram Webhook configuration — bot token, alert group chat ID, webhook URL,
 * and the enabled toggle. Only `TECH_LEAD` and `SUPER_ADMIN` may access it.
 */
export function TelegramWebhookPanel() {
  const t = useTranslations("settings.telegram");
  const errorText = useErrorText();
  const configQuery = useApiQuery<{
    telegramWebhookConfig: TelegramWebhookConfig;
  }>(TELEGRAM_WEBHOOK_QUERY, {}, { liveArea: "users" });
  const update = useMutation<unknown>(UPDATE_TELEGRAM_WEBHOOK_MUTATION);

  const [draft, setDraft] = useState<TelegramWebhookConfig | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const remote = configQuery.data?.telegramWebhookConfig;

  useEffect(() => {
    if (remote) setDraft(remote);
  }, [remote]);

  if (configQuery.error) {
    return (
      <ErrorState error={configQuery.error} onRetry={configQuery.refetch} />
    );
  }
  if (configQuery.loading && !draft) {
    return <LoadingState label={t("loading")} rows={3} />;
  }
  if (!draft) return null;

  const save = async () => {
    setFeedback(null);
    try {
      await update.run({
        input: {
          botToken: draft.botToken ?? undefined,
          alertGroupChatId: draft.alertGroupChatId ?? undefined,
          webhookUrl: draft.webhookUrl ?? undefined,
          isEnabled: draft.isEnabled,
        },
      });
      setFeedback({
        tone: "success",
        message: t("saved"),
      });
      configQuery.refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  return (
    <section className="flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}

      <div className="grid gap-3">
        <div className="grid gap-1">
          <Label htmlFor="telegram-bot-token">{t("botToken")}</Label>
          <Input
            id="telegram-bot-token"
            type="password"
            value={draft.botToken ?? ""}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, botToken: event.target.value }
                  : current,
              )
            }
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="telegram-chat-id">{t("chatId")}</Label>
          <Input
            id="telegram-chat-id"
            value={draft.alertGroupChatId ?? ""}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, alertGroupChatId: event.target.value }
                  : current,
              )
            }
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="telegram-webhook-url">{t("webhookUrl")}</Label>
          <Input
            id="telegram-webhook-url"
            value={draft.webhookUrl ?? ""}
            onChange={(event) =>
              setDraft((current) =>
                current
                  ? { ...current, webhookUrl: event.target.value }
                  : current,
              )
            }
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id="telegram-enabled"
            checked={draft.isEnabled}
            onCheckedChange={(checked) =>
              setDraft((current) =>
                current ? { ...current, isEnabled: checked } : current,
              )
            }
          />
          <Label htmlFor="telegram-enabled">{t("enabled")}</Label>
        </div>
      </div>

      <div>
        <Button onClick={save} disabled={update.loading}>
          {update.loading ? t("saving") : t("save")}
        </Button>
      </div>
    </section>
  );
}
