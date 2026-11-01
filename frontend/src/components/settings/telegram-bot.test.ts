/**
 * Telegram bot settings panel — save-payload rules.
 *
 * Secrets are write-only (the server never reads them back masked), so the
 * payload rule is the behavior worth pinning: a typed secret is sent, an
 * empty field is omitted so the stored value survives, and the rest of the
 * dialog is a full save rather than a patch. Mirrors the backend's
 * `saveTelegramBotSettings` precedence — a value here wins over the
 * environment; an omitted one lets the environment re-apply.
 */

import { describe, expect, test } from "bun:test";
import type { TelegramBotSettings } from "@/lib/mes/queries/types";
import { buildBotSaveInput } from "./telegram-bot";

function settings(
  overrides: Partial<TelegramBotSettings> = {},
): TelegramBotSettings {
  return {
    isEnabled: false,
    botToken: null,
    botTokenSet: false,
    aiBaseUrl: null,
    aiApiKey: null,
    aiApiKeySet: false,
    aiDefaultModel: null,
    pushAlertsEnabled: false,
    ...overrides,
  };
}

describe("buildBotSaveInput", () => {
  test("omits an untouched secret so the stored value survives", () => {
    const payload = buildBotSaveInput(
      settings({ botTokenSet: true, aiApiKeySet: true }),
      "",
      "   ",
    );
    expect(payload).not.toHaveProperty("botToken");
    expect(payload).not.toHaveProperty("aiApiKey");
  });

  test("sends a typed secret verbatim", () => {
    const payload = buildBotSaveInput(settings(), "111:new-token", "sk-new");
    expect(payload.botToken).toBe("111:new-token");
    expect(payload.aiApiKey).toBe("sk-new");
  });

  test("always sends the non-secret settings (full save, not a patch)", () => {
    const payload = buildBotSaveInput(
      settings({
        isEnabled: true,
        pushAlertsEnabled: true,
        aiBaseUrl: "https://gateway.example.com/v1",
        aiDefaultModel: "gpt-4o-mini",
      }),
      "",
      "",
    );
    expect(payload.isEnabled).toBe(true);
    expect(payload.pushAlertsEnabled).toBe(true);
    expect(payload.aiBaseUrl).toBe("https://gateway.example.com/v1");
    expect(payload.aiDefaultModel).toBe("gpt-4o-mini");
  });

  test("sends empty strings for cleared non-secrets so the environment re-applies", () => {
    // The backend turns "" back into null, which lifts the website override
    // and re-applies the environment value.
    const payload = buildBotSaveInput(
      settings({ aiBaseUrl: null, aiDefaultModel: null }),
      "",
      "",
    );
    expect(payload.aiBaseUrl).toBe("");
    expect(payload.aiDefaultModel).toBe("");
  });
});
