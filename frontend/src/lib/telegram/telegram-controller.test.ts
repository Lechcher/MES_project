/**
 * TelegramController tests.
 *
 * The controller owns which account's session is mounted and its backup, so
 * these pin the behaviors the spec relies on: restoring every linked account
 * on start, mounting the embedded client's slot, backing a captured login
 * (moving it to the backend's stable slot), isolating dead accounts without
 * dropping them from the list, and removal clearing both sides.
 */

import { describe, expect, test } from "bun:test";
import { LINKING_SLOT_MAX, LINKING_SLOT_MIN } from "./session-store";
import {
  type SessionStorageLike,
  TelegramController,
  type TelegramControllerOptions,
} from "./telegram-controller";
import type {
  DeviceFingerprint,
  TelegramAccount,
  TelegramProfile,
} from "./types";

/** A blob the way the client writes it: identity plus per-DC session keys. */
function sessionBlob(identity: Record<string, unknown>): string {
  return JSON.stringify({ dc1_auth_key: "auth-key-hex", ...identity });
}

const fingerprint: DeviceFingerprint = {
  deviceModel: "Telegram Web (embedded client)",
  systemVersion: "browser",
  appVersion: "13.0.1",
};

/** An in-memory storage stand-in for the module's bridge seams. */
class FakeStorage implements SessionStorageLike {
  blobs = new Map<number, string>();
  locked = false;

  readSessionBlob(slot: number): string | null {
    return this.blobs.get(slot) ?? null;
  }

  writeSessionBlob(slot: number, blob: string): void {
    this.blobs.set(slot, blob);
  }

  clearSessionBlob(slot: number): void {
    this.blobs.delete(slot);
  }

  isPasscodeLocked(): boolean {
    return this.locked;
  }
}

function account(overrides: Partial<TelegramAccount> = {}): TelegramAccount {
  return {
    id: "acc-1",
    telegramUserId: "tg-1",
    phoneNumber: "+84••••••89",
    username: null,
    firstName: "A",
    lastName: null,
    avatarUrl: null,
    isActive: true,
    deviceFingerprint: fingerprint,
    sessionString: sessionBlob({ userId: "tg-1", firstName: "A" }),
    webSlot: 4242,
    ...overrides,
  };
}

interface Harness {
  controller: TelegramController;
  storage: FakeStorage;
  saved: Array<{
    sessionString: string;
    profile: TelegramProfile;
    deviceFingerprint: DeviceFingerprint;
  }>;
  removed: string[];
  options: TelegramControllerOptions;
}

/**
 * The harness's save double mimics the backend's upsert: a known Telegram
 * identity keeps its row id and slot (only the session refreshes), while a
 * new identity gets a fresh id and the backend's assigned slot.
 */
function harness(
  accounts: TelegramAccount[],
  options: Partial<TelegramControllerOptions> = {},
): Harness {
  const storage = new FakeStorage();
  const saved: Harness["saved"] = [];
  const removed: string[] = [];
  const rows = new Map<string, TelegramAccount>(
    accounts.map((row) => [row.telegramUserId, row]),
  );
  let nextId = 1;
  const resolved: TelegramControllerOptions = {
    loadAccounts: async () => accounts,
    saveAccount: async (input) => {
      saved.push(input);
      const known = rows.get(input.profile.telegramUserId);
      if (known !== undefined) {
        const refreshed = { ...known, sessionString: input.sessionString };
        rows.set(refreshed.telegramUserId, refreshed);
        return refreshed;
      }
      const created = account({
        id: `new-${nextId}`,
        telegramUserId: input.profile.telegramUserId,
        sessionString: input.sessionString,
        webSlot: 777_001,
      });
      nextId += 1;
      rows.set(created.telegramUserId, created);
      return created;
    },
    removeAccount: async (accountId: string) => {
      removed.push(accountId);
    },
    ...options,
  };
  const controller = new TelegramController(resolved, storage);
  return { controller, storage, saved, removed, options: resolved };
}

describe("start", () => {
  test("restores a restorable account and mounts its slot", async () => {
    const { controller } = harness([account()]);
    await controller.start();

    const state = controller.getState();
    expect(state.loading).toBe(false);
    expect(state.accounts[0]?.status).toBe("connected");
    expect(state.activeAccountId).toBe("acc-1");
    expect(state.iframeSlot).toBe(4242);
  });

  test("restoring hydrates every account's slot, not only the mounted one", async () => {
    const { controller, storage } = harness([
      account({ id: "acc-1", webSlot: 4242 }),
      account({
        id: "acc-2",
        telegramUserId: "tg-2",
        webSlot: 4243,
        sessionString: sessionBlob({ userId: "tg-2", firstName: "B" }),
      }),
    ]);

    await controller.start();

    // The embedded client's own switcher can move between accounts with no
    // login step, so every restorable slot is hydrated up front.
    expect(storage.readSessionBlob(4242)).toBe(
      sessionBlob({ userId: "tg-1", firstName: "A" }),
    );
    expect(storage.readSessionBlob(4243)).toBe(
      sessionBlob({ userId: "tg-2", firstName: "B" }),
    );
    // The mount is still the first restorable account.
    expect(controller.getState().iframeSlot).toBe(4242);
  });

  test("a dead account stays listed as disconnected", async () => {
    const dead = account({ id: "acc-2", sessionString: null, webSlot: null });
    const { controller } = harness([dead]);
    await controller.start();

    const state = controller.getState();
    expect(state.accounts[0]?.status).toBe("disconnected");
    expect(state.accounts[0]?.needsRelink).toBe(true);
    expect(state.activeAccountId).toBeNull();
    expect(state.iframeSlot).toBeNull();
  });

  test("a failed load is its own state, not an empty account list", async () => {
    const { controller } = harness([], {
      loadAccounts: async () => {
        throw new Error("api down");
      },
    });
    await controller.start();

    const state = controller.getState();
    expect(state.loading).toBe(false);
    expect(state.loadFailed).toBe(true);
    expect(state.accounts).toHaveLength(0);
  });

  test("a passcode-locked storage cannot hydrate accounts", async () => {
    const { controller, storage } = harness([account()]);
    storage.locked = true;
    await controller.start();

    expect(controller.getState().accounts[0]?.status).toBe("disconnected");
  });
});

describe("linking", () => {
  test("startLinking mounts a slot from the reserved range", () => {
    const { controller } = harness([]);
    const slot = controller.startLinking();

    expect(slot).toBeGreaterThanOrEqual(LINKING_SLOT_MIN);
    expect(slot).toBeLessThanOrEqual(LINKING_SLOT_MAX);
    expect(controller.getState().iframeSlot).toBe(slot);
  });

  test("cancelLinking clears the temporary slot", () => {
    const { controller, storage } = harness([]);
    const slot = controller.startLinking();
    storage.writeSessionBlob(
      slot,
      sessionBlob({ userId: "x", firstName: "Half" }),
    );
    controller.cancelLinking();

    expect(storage.readSessionBlob(slot)).toBeNull();
    expect(controller.getState().iframeSlot).toBeNull();
  });
});

describe("captureSession", () => {
  test("a fresh login moves the session to the backend's stable slot", async () => {
    const { controller, storage, saved } = harness([]);
    const linkingSlot = controller.startLinking();
    const blob = sessionBlob({ userId: "555", firstName: "Minh" });

    await controller.captureSession(linkingSlot, blob);

    expect(saved).toHaveLength(1);
    expect(saved[0]?.sessionString).toBe(blob);
    expect(saved[0]?.profile.telegramUserId).toBe("555");
    // The session lands on the backend's slot, the temporary one is cleared.
    expect(storage.readSessionBlob(777_001)).toBe(blob);
    expect(storage.readSessionBlob(linkingSlot)).toBeNull();
    // And the mount follows it.
    const state = controller.getState();
    expect(state.iframeSlot).toBe(777_001);
    expect(state.activeAccountId).toBe("new-1");
    expect(state.accounts).toHaveLength(1);
  });

  test("a slot the client's own switcher logged in at is captured and moved", async () => {
    const { controller, storage, saved } = harness([
      account({ webSlot: 4242 }),
    ]);
    await controller.start();
    saved.length = 0;

    // The client switched to one of its own fresh slots and logged in
    // there — MES never allocated that slot — while another account is
    // mounted.
    const blob = sessionBlob({ userId: "555", firstName: "Minh" });
    await controller.captureSession(1, blob);

    expect(saved).toHaveLength(1);
    // The session moved to the backend's stable slot, the client's own
    // slot was cleared so its switcher no longer holds a stray copy.
    expect(storage.readSessionBlob(777_001)).toBe(blob);
    expect(storage.readSessionBlob(1)).toBeNull();
    // The mount does NOT follow: a backup of an unmounted account must
    // never remount the client (it tears down a live session).
    expect(controller.getState().iframeSlot).toBe(4242);
    // The new account is in the list for the next module open.
    expect(controller.getState().accounts).toHaveLength(2);
  });

  test("a re-link refreshes the existing record in place", async () => {
    const { controller, storage, saved } = harness([
      account({ webSlot: 4242 }),
    ]);
    await controller.start();
    const blob = sessionBlob({ userId: "tg-1", firstName: "A" });

    await controller.captureSession(4242, blob);

    expect(saved).toHaveLength(1);
    // The blob was already at the account's own slot — no move.
    expect(storage.readSessionBlob(4242)).toBe(blob);
    const state = controller.getState();
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]?.account.webSlot).toBe(4242);
  });

  test("a blob without identity saves nothing", async () => {
    const { controller, saved } = harness([account()]);
    await controller.start();

    await controller.captureSession(4242, "not-a-blob");

    expect(saved).toHaveLength(0);
    expect(controller.getState().accounts).toHaveLength(1);
  });
});

describe("removeAccount", () => {
  test("clears the record, the local slot, and the mount", async () => {
    const { controller, storage, removed } = harness([account()]);
    await controller.start();
    storage.writeSessionBlob(
      4242,
      sessionBlob({ userId: "tg-1", firstName: "A" }),
    );

    await controller.removeAccount("acc-1");

    expect(removed).toEqual(["acc-1"]);
    expect(storage.readSessionBlob(4242)).toBeNull();
    const state = controller.getState();
    expect(state.accounts).toHaveLength(0);
    expect(state.activeAccountId).toBeNull();
    expect(state.iframeSlot).toBeNull();
  });
});

describe("selectAccount", () => {
  test("hydrates the restored session into the slot before mounting", async () => {
    const { controller, storage } = harness([account({ webSlot: 4242 })]);

    await controller.start();

    // The fresh-browser path: the blob came from the API, not storage.
    expect(storage.readSessionBlob(4242)).toBe(
      sessionBlob({ userId: "tg-1", firstName: "A" }),
    );
    expect(controller.getState().iframeSlot).toBe(4242);
  });

  test("switches the mount to the other account's slot", async () => {
    const { controller } = harness([
      account({ id: "acc-1", webSlot: 4242 }),
      account({ id: "acc-2", telegramUserId: "tg-2", webSlot: 4243 }),
    ]);
    await controller.start();

    controller.selectAccount("acc-2");

    const state = controller.getState();
    expect(state.activeAccountId).toBe("acc-2");
    expect(state.iframeSlot).toBe(4243);
  });

  test("a dead account is offered the client's own login", async () => {
    const { controller } = harness([
      account({ id: "acc-1", sessionString: null, webSlot: null }),
    ]);
    await controller.start();

    controller.selectAccount("acc-1");

    const slot = controller.getState().iframeSlot;
    expect(slot).toBeGreaterThanOrEqual(LINKING_SLOT_MIN);
    expect(slot).toBeLessThanOrEqual(LINKING_SLOT_MAX);
  });
});
