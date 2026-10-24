"use client";

/**
 * Locale-aware rendering of `MesApiError`.
 *
 * A message the API supplied is displayed as returned, untranslated — it is
 * backend-generated text. Only the fallbacks the frontend itself authors
 * (its stable per-code messages) follow the active locale.
 */

import { useTranslations } from "next-intl";
import { toMesApiError } from "@/lib/mes/errors";

/**
 * Codes whose user-facing text is always frontend-authored: the API never
 * supplies a meaningful message for them (mirrors `MesApiError.displayMessage`).
 */
const ALWAYS_LOCALIZED = new Set([
  "UNAUTHENTICATED",
  "NOT_FOUND",
  "RATE_LIMITED",
]);

/** The catalogue key under `errors` for each code the frontend authors. */
const KEY_BY_CODE = {
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "notFound",
  VALIDATION_FAILED: "validationFailed",
  STATE_TRANSITION_INVALID: "stateTransitionInvalid",
  RULE_VIOLATION: "ruleViolation",
  CONFLICT: "conflict",
  RATE_LIMITED: "rateLimited",
  INTERNAL: "internal",
} as const;

type ErrorKey = (typeof KEY_BY_CODE)[keyof typeof KEY_BY_CODE];

/** The slice of next-intl's translator the resolver relies on. */
export type ErrorTextFn = (key: ErrorKey) => string;

/**
 * Resolve one error's display text. Pure so the pass-through rule is
 * unit-testable without React:
 *
 * - a message the API supplied is returned verbatim (for every code except
 *   the always-localized ones, whose user-facing text is frontend-authored);
 * - otherwise the frontend's own fallback renders through the active locale.
 */
export function resolveErrorText(error: unknown, t: ErrorTextFn): string {
  const apiError = toMesApiError(error);
  const hasApiMessage = apiError.message.trim() !== "";
  if (hasApiMessage && !ALWAYS_LOCALIZED.has(apiError.code)) {
    return apiError.message;
  }
  const key =
    (KEY_BY_CODE as Record<string, ErrorKey | undefined>)[apiError.code] ??
    "internal";
  return t(key);
}

/** Render a `MesApiError` in the active locale (see `resolveErrorText`). */
export function useErrorText() {
  const t = useTranslations("errors") as unknown as ErrorTextFn;
  return (error: unknown): string => resolveErrorText(error, t);
}
