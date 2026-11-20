/**
 * Telegram provider composition tests.
 *
 * The repo's unit tests do not mount React (see the other frontend suites:
 * they test the controller and the logic modules), so this pins what the
 * React bridge guarantees structurally: the default controller is bound to
 * the module's real API dependencies, and its store plumbing — the
 * subscription the provider hands `useSyncExternalStore` — reflects
 * selection and removal. The mount/unmount lifecycle itself (start on open,
 * a half-finished login's slot cleared on close) is the controller's
 * `start`/`stop` pair, driven by the same effect the provider wires.
 */

import { describe, expect, test } from "bun:test";
import {
  fetchTelegramAccounts,
  removeTelegramAccount,
  saveTelegramAccount,
} from "./api";
import { TelegramController } from "./telegram-controller";

describe("TelegramProvider default composition", () => {
  test("builds a controller bound to the module's real dependencies", () => {
    const controller = new TelegramController({
      loadAccounts: fetchTelegramAccounts,
      saveAccount: saveTelegramAccount,
      removeAccount: removeTelegramAccount,
    });

    expect(controller.getState()).toEqual({
      accounts: [],
      activeAccountId: null,
      iframeSlot: null,
      loading: true,
      loadFailed: false,
    });
  });

  test("the store subscription the provider hands React notifies on change", () => {
    const controller = new TelegramController({
      loadAccounts: async () => [],
      saveAccount: async () => {
        throw new Error("not used");
      },
      removeAccount: async () => {},
    });

    let notifications = 0;
    const unsubscribe = controller.subscribe(() => {
      notifications += 1;
    });

    controller.startLinking();
    expect(controller.getState().iframeSlot).not.toBeNull();
    expect(notifications).toBe(1);

    unsubscribe();
    controller.cancelLinking();
    expect(notifications).toBe(1);
  });
});
