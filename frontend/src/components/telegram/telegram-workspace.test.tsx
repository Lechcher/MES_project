/**
 * Telegram workspace — what a viewer is shown, per account state.
 *
 * Two regressions are pinned here. The first: the workspace used to return
 * its empty state before ever rendering the client frame, so a viewer with
 * no linked account (a fresh account, or one that just switched MES
 * accounts) could never reach the embedded client's own login. The second:
 * a viewer whose ONLY linked account no longer restores — a revoked
 * session, a passcode lock, a pre-slot row that never completed — was met
 * by an empty box, with neither the re-link hint nor a mounted client,
 * because nothing selected an account that needs a re-link. Both views must
 * mount the client: the zero-account view at a linking slot, the sole-dead
 * view at the linking slot its selection opens.
 *
 * The repo mounts no DOM in unit tests, so this renders statically through
 * `react-dom/server` — enough to assert which surfaces appear — with the
 * controller driven directly. Effects do not run in a static render, so a
 * test performs the selection (`controller.selectAccount(...)`) exactly the
 * way the workspace's auto-select effect would; the selection rule itself
 * (`defaultAccountId`) is pinned as a pure function.
 * Assertions keep clear of the query separator, which static markup escapes.
 */

import { describe, expect, test } from "bun:test";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider } from "@/lib/mes/theme/provider";
import { TelegramContext } from "@/lib/telegram/provider";
import { LINKING_SLOT_MIN } from "@/lib/telegram/session-store";
import {
  type TelegramAccountEntry,
  TelegramController,
} from "@/lib/telegram/telegram-controller";
import type { TelegramAccount } from "@/lib/telegram/types";
import en from "../../../messages/en.json";
import { defaultAccountId, WorkspaceStates } from "./telegram-workspace";

const LINK_HINT = "Sign in to Telegram in the client below.";
const RELINK_HINT = "session needs a sign-in again";
const FRAME_PREFIX = "/telegram-web/index.html?account=";

const LINKED_ACCOUNT: TelegramAccount = {
  id: "acc-1",
  telegramUserId: "8758118472",
  phoneNumber: "+84••••••42",
  username: "livercity",
  firstName: "LiverCity",
  lastName: null,
  avatarUrl: null,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  deviceFingerprint: null,
  sessionString: "session-blob",
  webSlot: 4242,
};

/** An account whose stored session no longer restores. */
const DEAD_ACCOUNT: TelegramAccount = {
  ...LINKED_ACCOUNT,
  sessionString: null,
  webSlot: null,
};

/** A controller whose load returns the given accounts, nothing else wired. */
function controllerWith(accounts: TelegramAccount[]): TelegramController {
  return new TelegramController({
    loadAccounts: async () => accounts,
    saveAccount: async () => {
      throw new Error("not used");
    },
    removeAccount: async () => {},
  });
}

function renderWorkspace(controller: TelegramController): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en}>
      <ThemeProvider>
        <TelegramContext.Provider value={controller}>
          <WorkspaceStates />
        </TelegramContext.Provider>
      </ThemeProvider>
    </NextIntlClientProvider>,
  );
}

describe("Telegram workspace", () => {
  test("a viewer with no accounts is met by the client's own login", async () => {
    const controller = controllerWith([]);
    await controller.start();
    controller.startLinking();

    const markup = renderWorkspace(controller);
    const slot = controller.getState().iframeSlot;

    // The frame mounts at the linking slot: the client's own login screen is
    // the linking surface — no module-owned button stands in the way.
    expect(markup).toContain(`${FRAME_PREFIX}${slot}`);
    expect(markup).toContain("theme=light");
    expect(markup).toContain(LINK_HINT);
    expect(markup).not.toContain("<button");
  });

  test("a viewer with accounts sees the client at the stable slot", async () => {
    const controller = controllerWith([LINKED_ACCOUNT]);
    await controller.start();

    const markup = renderWorkspace(controller);

    expect(markup).toContain(`${FRAME_PREFIX}4242`);
    expect(markup).toContain("theme=light");
    expect(markup).toContain("LiverCity");
    expect(markup).not.toContain(LINK_HINT);
  });

  test("a viewer whose only account no longer restores is offered its re-link", async () => {
    const controller = controllerWith([DEAD_ACCOUNT]);
    await controller.start();

    // The auto-select opens the dead account — the effect cannot run in a
    // static render, so the selection is performed here exactly as
    // `defaultAccountId` plus the effect would — and the controller mounts
    // it at a fresh linking slot, inside the reserved range.
    controller.selectAccount(DEAD_ACCOUNT.id);
    const slot = controller.getState().iframeSlot;
    if (slot === null) {
      throw new Error("selecting a dead account should mount a linking slot");
    }
    expect(slot).toBeGreaterThanOrEqual(LINKING_SLOT_MIN);

    const markup = renderWorkspace(controller);

    // The re-link affordance renders and the client mounts at that linking
    // slot: the client's own login screen is the re-link surface, not an
    // empty module.
    expect(markup).toContain(RELINK_HINT);
    expect(markup).toContain(`${FRAME_PREFIX}${slot}`);
    expect(markup).toContain("theme=light");
  });
});

describe("defaultAccountId", () => {
  const live = (id: string): TelegramAccountEntry => ({
    account: { ...LINKED_ACCOUNT, id },
    status: "connected",
    needsRelink: false,
  });
  const dead = (id: string): TelegramAccountEntry => ({
    account: { ...LINKED_ACCOUNT, id, sessionString: null, webSlot: null },
    status: "disconnected",
    needsRelink: true,
  });

  test("no accounts open nothing", () => {
    expect(defaultAccountId([])).toBeNull();
  });

  test("a restorable account opens first", () => {
    expect(defaultAccountId([dead("a"), live("b"), live("c")])).toBe("b");
  });

  test("the first of several live accounts opens", () => {
    expect(defaultAccountId([live("a"), live("b")])).toBe("a");
  });

  test("a viewer whose only account is dead still gets it opened", () => {
    expect(defaultAccountId([dead("a")])).toBe("a");
  });

  test("when every account is dead the first still opens", () => {
    expect(defaultAccountId([dead("a"), dead("b")])).toBe("a");
  });
});
