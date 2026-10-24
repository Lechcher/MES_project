/**
 * Password-reset rules.
 *
 * The interactive form is thin; these rules carry the behavior, so they are
 * testable without a DOM. The backend enforces the same minimum length, and the
 * parity is what keeps a password accepted here from being rejected server-side.
 */

import { describe, expect, test } from "bun:test";
import {
  isInvalidResetToken,
  MIN_PASSWORD_LENGTH,
  passwordPolicyError,
} from "./auth";

describe("password policy", () => {
  test("matches the length the administrative reset enforces", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  test("rejects a password shorter than the policy", () => {
    for (const tooShort of ["", "a", "short", "7chars!"]) {
      expect(passwordPolicyError(tooShort)).toContain(
        String(MIN_PASSWORD_LENGTH),
      );
    }
  });

  test("accepts a password at exactly the policy length", () => {
    expect(passwordPolicyError("12345678")).toBeNull();
  });

  test("accepts a longer password", () => {
    expect(passwordPolicyError("a-much-longer-password")).toBeNull();
  });

  test("counts characters, not bytes", () => {
    // Eight multi-byte characters are eight characters.
    expect(passwordPolicyError("pässwörd")).toBeNull();
  });
});

describe("invalid-token detection", () => {
  test("recognises a validation failure carrying the token reason", () => {
    expect(
      isInvalidResetToken({
        code: "VALIDATION_FAILED",
        details: { reason: "INVALID_TOKEN" },
      }),
    ).toBe(true);
  });

  test("does not treat a different reason as an unusable link", () => {
    expect(
      isInvalidResetToken({
        code: "VALIDATION_FAILED",
        details: { reason: "RESET_REJECTED" },
      }),
    ).toBe(false);
  });

  test("does not treat another error code as an unusable link", () => {
    expect(
      isInvalidResetToken({
        code: "INTERNAL",
        details: { reason: "INVALID_TOKEN" },
      }),
    ).toBe(false);
    expect(isInvalidResetToken({ code: "FORBIDDEN" })).toBe(false);
  });

  test("handles a missing error", () => {
    expect(isInvalidResetToken(null)).toBe(false);
    expect(isInvalidResetToken(undefined)).toBe(false);
    expect(isInvalidResetToken({})).toBe(false);
  });
});
