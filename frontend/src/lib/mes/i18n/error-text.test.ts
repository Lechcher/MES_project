/**
 * Error-text resolution tests.
 *
 * A message the API supplied passes through untranslated; the frontend's own
 * fallbacks resolve through the active locale's `errors.*` messages.
 */

import { describe, expect, test } from "bun:test";
import { MesApiError } from "@/lib/mes/errors";
import { resolveErrorText } from "./error-text";

/** A translator that names the catalogue key it was asked for. */
const t = (key: string) => `vi:${key}`;

describe("error text resolution", () => {
  test("an API-supplied message passes through untranslated", () => {
    const error = new MesApiError("Email is already registered", {
      code: "VALIDATION_FAILED",
    });
    expect(resolveErrorText(error, t)).toBe("Email is already registered");
  });

  test("a frontend fallback renders in the active locale", () => {
    const error = new MesApiError("", { code: "VALIDATION_FAILED" });
    expect(resolveErrorText(error, t)).toBe("vi:validationFailed");
  });

  test("always-localized codes ignore the API message", () => {
    const error = new MesApiError("raw transport message", {
      code: "UNAUTHENTICATED",
    });
    expect(resolveErrorText(error, t)).toBe("vi:unauthenticated");
    expect(
      resolveErrorText(new MesApiError("x", { code: "RATE_LIMITED" }), t),
    ).toBe("vi:rateLimited");
    expect(
      resolveErrorText(new MesApiError("gone", { code: "NOT_FOUND" }), t),
    ).toBe("vi:notFound");
  });

  test("an unknown code falls back to the generic message", () => {
    expect(
      resolveErrorText(new MesApiError("", { code: "SOMETHING_ELSE" }), t),
    ).toBe("vi:internal");
    expect(resolveErrorText(new Error("fetch failed"), t)).toBe("fetch failed");
    // Non-Error throws normalize to their string form, as `displayMessage` did.
    expect(resolveErrorText(null, t)).toBe("null");
    expect(resolveErrorText(undefined, t)).toBe("undefined");
  });
});
