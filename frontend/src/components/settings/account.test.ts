/**
 * Account panel — submit rules.
 *
 * The forms are thin; these rules carry the client-side behavior the panel
 * enforces before a request is issued, matching the server-side checks. The
 * backend also enforces the password policy, so a candidate accepted here is
 * one the server accepts too.
 */

import { describe, expect, test } from "bun:test";
import { MIN_PASSWORD_LENGTH } from "@/lib/mes/queries/auth";
import { emailSubmitBlock, passwordSubmitBlock } from "./account";

function passwordDraft(
  overrides: Partial<{
    currentPassword: string;
    newPassword: string;
  }> = {},
) {
  return { currentPassword: "current-secret", newPassword: "", ...overrides };
}

function emailDraft(
  overrides: Partial<{
    currentPassword: string;
    newEmail: string;
  }> = {},
) {
  return { currentPassword: "current-secret", newEmail: "", ...overrides };
}

describe("passwordSubmitBlock", () => {
  test("blocks while either field is empty", () => {
    expect(passwordSubmitBlock(passwordDraft())).toBe("empty");
    expect(passwordSubmitBlock(passwordDraft({ currentPassword: "" }))).toBe(
      "empty",
    );
  });

  test("blocks a new password below the policy", () => {
    expect(passwordSubmitBlock(passwordDraft({ newPassword: "short" }))).toBe(
      "policy",
    );
  });

  test("allows a conforming submission", () => {
    expect(
      passwordSubmitBlock(
        passwordDraft({ newPassword: "a".repeat(MIN_PASSWORD_LENGTH) }),
      ),
    ).toBeNull();
  });
});

describe("emailSubmitBlock", () => {
  test("blocks while either field is empty", () => {
    expect(emailSubmitBlock(emailDraft(), "me@example.test")).toBe("empty");
    expect(
      emailSubmitBlock(emailDraft({ currentPassword: "" }), "me@example.test"),
    ).toBe("empty");
  });

  test("blocks the address the account already uses", () => {
    expect(
      emailSubmitBlock(
        emailDraft({ newEmail: "me@example.test" }),
        "me@example.test",
      ),
    ).toBe("same");
  });

  test("compares case-insensitively and tolerates surrounding spaces", () => {
    expect(
      emailSubmitBlock(
        emailDraft({ newEmail: "  ME@Example.test " }),
        "me@example.test",
      ),
    ).toBe("same");
  });

  test("allows a genuinely new address", () => {
    expect(
      emailSubmitBlock(
        emailDraft({ newEmail: "new@example.test" }),
        "me@example.test",
      ),
    ).toBeNull();
  });
});
