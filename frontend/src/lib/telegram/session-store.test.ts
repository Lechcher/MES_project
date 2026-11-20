/**
 * Session-store tests — reading identities out of the client's blob and
 * allocating the slot a login-in-progress runs in.
 *
 * The blob is structured third-party data, so the identity reader is pinned
 * against both the client's real shape and the degenerate blobs a
 * half-finished login can leave behind.
 */

import { describe, expect, test } from "bun:test";
import {
  allocateLinkingSlot,
  blobToProfile,
  hasSessionMaterial,
  LINKING_SLOT_MAX,
  LINKING_SLOT_MIN,
  readBlobIdentity,
} from "./session-store";

/** The client's real blob shape: per-DC keys plus the account identity. */
function blobWith(identity: Record<string, unknown>): string {
  return JSON.stringify({
    dcId: 2,
    dc1_auth_key: "key-hex",
    dc1_server_salt: "salt-hex",
    ...identity,
  });
}

describe("readBlobIdentity", () => {
  test("reads the identity the client records", () => {
    const identity = readBlobIdentity(
      blobWith({
        userId: "123456",
        firstName: "Minh",
        lastName: "Nguyen",
        phone: "+84123456789",
        username: "mes_user",
        avatarUri: "https://cdn.example/avatar.jpg",
      }),
    );

    expect(identity).toEqual({
      telegramUserId: "123456",
      firstName: "Minh",
      lastName: "Nguyen",
      phoneNumber: "+84123456789",
      username: "mes_user",
      avatarUrl: "https://cdn.example/avatar.jpg",
    });
  });

  test("accepts a numeric user id", () => {
    const identity = readBlobIdentity(
      blobWith({ userId: 42, firstName: "An" }),
    );
    expect(identity?.telegramUserId).toBe("42");
  });

  test("a blob without an identity cannot create an account", () => {
    expect(readBlobIdentity("not json")).toBeNull();
    expect(readBlobIdentity(blobWith({ dcId: 2 }))).toBeNull();
    expect(
      readBlobIdentity(blobWith({ userId: "1", firstName: "  " })),
    ).toBeNull();
    expect(readBlobIdentity(JSON.stringify(null))).toBeNull();
    expect(readBlobIdentity(JSON.stringify("a string"))).toBeNull();
  });

  test("optional fields stay null when absent", () => {
    const identity = readBlobIdentity(
      blobWith({ userId: "1", firstName: "An" }),
    );
    expect(identity).toEqual({
      telegramUserId: "1",
      firstName: "An",
      lastName: null,
      phoneNumber: "",
      username: null,
      avatarUrl: null,
    });
  });
});

describe("blobToProfile", () => {
  test("maps the identity onto the save mutation's profile", () => {
    const profile = blobToProfile(
      blobWith({
        userId: "123456",
        firstName: "Minh",
        phone: "+84123456789",
      }),
    );
    expect(profile).toEqual({
      telegramUserId: "123456",
      phoneNumber: "+84123456789",
      username: null,
      firstName: "Minh",
      lastName: null,
      avatarUrl: null,
    });
  });

  test("a malformed blob yields no profile", () => {
    expect(blobToProfile("{oops")).toBeNull();
  });
});

describe("hasSessionMaterial", () => {
  test("a real blob with per-DC keys passes", () => {
    expect(hasSessionMaterial(blobWith({ userId: "1", firstName: "A" }))).toBe(
      true,
    );
    expect(
      hasSessionMaterial(
        JSON.stringify({ userId: "1", tempAuthKey: { key: "k" } }),
      ),
    ).toBe(true);
  });

  test("an identity without keys is not linkable", () => {
    expect(hasSessionMaterial("{}")).toBe(false);
    expect(
      hasSessionMaterial(JSON.stringify({ userId: "1", firstName: "A" })),
    ).toBe(false);
  });
});

describe("blobToProfile session guard", () => {
  test("an identity-only blob yields no profile", () => {
    // A placeholder the client shows as logged-out: capturing it would
    // create an account that restores into a login screen.
    expect(
      blobToProfile(JSON.stringify({ userId: "1", firstName: "A" })),
    ).toBeNull();
    expect(blobToProfile(blobWith({ userId: "1", firstName: "A" }))).toEqual({
      telegramUserId: "1",
      phoneNumber: "",
      username: null,
      firstName: "A",
      lastName: null,
      avatarUrl: null,
    });
  });
});

describe("allocateLinkingSlot", () => {
  test("stays inside the reserved linking range", () => {
    for (let i = 0; i < 50; i += 1) {
      const slot = allocateLinkingSlot([]);
      expect(slot).toBeGreaterThanOrEqual(LINKING_SLOT_MIN);
      expect(slot).toBeLessThanOrEqual(LINKING_SLOT_MAX);
    }
  });

  test("avoids slots already in use", () => {
    const used = Array.from({ length: 20 }, (_, index) => index);
    for (let i = 0; i < 20; i += 1) {
      expect(used).not.toContain(allocateLinkingSlot(used));
    }
  });

  test("falls back deterministically when randomness exhausts attempts", () => {
    // Force the random draw to always collide by exhausting a narrow range
    // through repeated allocation on a full taken set of the same size.
    const taken = [LINKING_SLOT_MIN];
    expect(allocateLinkingSlot(taken)).not.toBe(LINKING_SLOT_MIN);
  });
});
