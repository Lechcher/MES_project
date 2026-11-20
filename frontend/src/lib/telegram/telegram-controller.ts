/**
 * Telegram module controller.
 *
 * React-free state for the embedded Telegram Web client module: the viewer's
 * accounts load when the module opens, selecting one hydrates its session
 * into the slot the client runs in, and the captured session material is
 * handed back to the backend whenever the client's own login writes it.
 *
 * The client owns everything about the chat itself — MES only owns *which
 * account's session is currently mounted* and its backup. That is why an
 * account's status here is a restore fact (the session exists and hydrated,
 * or it does not) and not a connection state: the socket lives inside the
 * embedded client's own iframe.
 */

import {
  clearSessionBlob,
  isPasscodeLocked,
  readSessionBlob,
  writeSessionBlob,
} from "./session-bridge";
import {
  allocateLinkingSlot,
  blobToProfile,
  EMBEDDED_DEVICE_FINGERPRINT,
  LINKING_SLOT_MAX,
  LINKING_SLOT_MIN,
} from "./session-store";
import type {
  DeviceFingerprint,
  TelegramAccount,
  TelegramProfile,
} from "./types";

/** Connection state of one account as the module can see it. */
export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface TelegramAccountEntry {
  account: TelegramAccount;
  status: ConnectionStatus;
  /** True when the viewer must link (or re-link) to restore this account. */
  needsRelink: boolean;
}

export interface TelegramControllerState {
  accounts: TelegramAccountEntry[];
  /** The account whose chat is mounted, when one is. */
  activeAccountId: string | null;
  /**
   * The slot the module mounts the embedded client with — the active
   * account's stable slot, or the temporary slot a login runs in.
   */
  iframeSlot: number | null;
  loading: boolean;
  /** True when the last load failed — the workspace offers a retry. */
  loadFailed: boolean;
}

export interface TelegramControllerOptions {
  loadAccounts: () => Promise<TelegramAccount[]>;
  saveAccount: (input: {
    sessionString: string;
    profile: TelegramProfile;
    deviceFingerprint: DeviceFingerprint;
  }) => Promise<TelegramAccount>;
  removeAccount: (accountId: string) => Promise<void>;
}

/** The storage surface the controller touches — stubbed in tests. */
export interface SessionStorageLike {
  readSessionBlob(slot: number): string | null;
  writeSessionBlob(slot: number, blob: string): void;
  clearSessionBlob(slot: number): void;
  isPasscodeLocked(): boolean;
}

const liveStorage: SessionStorageLike = {
  readSessionBlob,
  writeSessionBlob,
  clearSessionBlob,
  isPasscodeLocked,
};

function isLinkingSlot(slot: number): boolean {
  return slot >= LINKING_SLOT_MIN && slot <= LINKING_SLOT_MAX;
}

export class TelegramController {
  private state: TelegramControllerState = {
    accounts: [],
    activeAccountId: null,
    iframeSlot: null,
    loading: true,
    loadFailed: false,
  };

  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly options: TelegramControllerOptions,
    private readonly storage: SessionStorageLike = liveStorage,
  ) {}

  /* ------------------------------ store API ----------------------------- */

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): TelegramControllerState => this.state;

  private patch(next: Partial<TelegramControllerState>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  /* ------------------------------- lifecycle ---------------------------- */

  /**
   * Load the viewer's accounts, hydrate every one of them, and mount the
   * first restorable.
   *
   * The restore hydrates ALL accounts before any iframe mounts: the embedded
   * client's own account switcher can then move between them without a
   * login step — MES manages no switcher of its own. A view of the accounts
   * cannot fail for one dead account: no session (or no slot) simply reads
   * as disconnected-until-re-link.
   */
  async start(): Promise<void> {
    let accounts: TelegramAccount[] = [];
    let loadFailed = false;
    try {
      accounts = await this.options.loadAccounts();
    } catch {
      // A failed load is surfaced as its own state — "no accounts" would
      // send the viewer into a needless re-link — with the retry being
      // this same `start()` again.
      loadFailed = true;
    }
    const locked = this.storage.isPasscodeLocked();
    const entries = accounts.map((account) => this.toEntry(account, locked));

    if (!locked) {
      for (const entry of entries) {
        const slot = entry.account.webSlot;
        const blob = entry.account.sessionString;
        if (!entry.needsRelink && slot !== null && blob !== null) {
          this.storage.writeSessionBlob(slot, blob);
        }
      }
    }

    this.patch({
      accounts: entries,
      loading: false,
      loadFailed,
    });
    const firstRestorable = entries.find((entry) => !entry.needsRelink);
    if (firstRestorable !== undefined) {
      this.selectAccount(firstRestorable.account.id);
    }
  }

  stop(): void {
    // Nothing to disconnect: the embedded client's sessions live in the
    // origin's storage and the iframe unmounts with the route. Clearing the
    // temporary slot keeps a half-finished login from lingering.
    if (
      this.state.iframeSlot !== null &&
      isLinkingSlot(this.state.iframeSlot)
    ) {
      this.storage.clearSessionBlob(this.state.iframeSlot);
    }
    this.patch({ iframeSlot: null, activeAccountId: null });
  }

  /* ------------------------------- selection ---------------------------- */

  /**
   * Mount one account: its stable slot when it has restorable session
   * material, otherwise a temporary linking slot — the embedded client then
   * shows its own login, which IS the re-link affordance.
   *
   * A restorable account is hydrated here, before the iframe mounts: the
   * session material the backend returned is written into the slot, so the
   * client finds it at boot and connects with no login step — on the same
   * browser (where the blob was already there) and on a fresh one (where it
   * was not) alike.
   */
  selectAccount(accountId: string): void {
    const entry = this.state.accounts.find(
      (item) => item.account.id === accountId,
    );
    if (entry === undefined) return;

    if (entry.needsRelink) {
      this.patch({
        activeAccountId: accountId,
        iframeSlot: allocateLinkingSlot(this.knownSlots()),
      });
      return;
    }

    const slot = entry.account.webSlot;
    const blob = entry.account.sessionString;
    if (slot !== null && blob !== null) {
      this.storage.writeSessionBlob(slot, blob);
    }
    this.patch({ activeAccountId: accountId, iframeSlot: slot });
  }

  /** Allocate the slot a fresh link runs in and mount it. */
  startLinking(): number {
    const slot = allocateLinkingSlot(this.knownSlots());
    this.patch({ iframeSlot: slot, activeAccountId: null });
    return slot;
  }

  cancelLinking(): void {
    const slot = this.state.iframeSlot;
    if (slot !== null && isLinkingSlot(slot)) {
      this.storage.clearSessionBlob(slot);
    }
    this.patch({ iframeSlot: null, activeAccountId: null });
  }

  /* ------------------------------- capture ------------------------------ */

  /**
   * Back up one captured session blob and keep the module in sync.
   *
   * The embedded client writes its session blob whenever a login completes
   * or the session rotates — in MES's own linking flow, and in the client's
   * native account switcher at a slot MES never allocated. This runs on
   * every version, wherever it was written: the account is saved through
   * the upsert, and the session then moves to the backend's stable slot (a
   * native-switcher login usually needs one), the mount following it so the
   * viewer never sees a slot change.
   *
   * A blob that carries no readable identity cannot create an account; it is
   * left in place for the client to finish writing.
   */
  async captureSession(slot: number, blob: string): Promise<void> {
    const profile = blobToProfile(blob);
    if (profile === null) return;

    const saved = await this.options.saveAccount({
      sessionString: blob,
      profile,
      deviceFingerprint: EMBEDDED_DEVICE_FINGERPRINT,
    });

    // A re-backup at the account's own slot refreshes the stored blob (the
    // capture exists because the session rotated); every other write moves
    // to the stable slot the backend assigned.
    if (saved.webSlot !== null) {
      this.storage.writeSessionBlob(saved.webSlot, blob);
      if (saved.webSlot !== slot) {
        this.storage.clearSessionBlob(slot);
      }
    }

    const accounts = this.state.accounts.map((entry) =>
      entry.account.id === saved.id
        ? this.toEntry(saved, this.storage.isPasscodeLocked())
        : entry,
    );
    if (!accounts.some((entry) => entry.account.id === saved.id)) {
      accounts.push(this.toEntry(saved, this.storage.isPasscodeLocked()));
    }

    // The mount follows the capture only when the capture belongs to the
    // mounted slot (the login-in-progress, or a rotation of the account on
    // screen): a backup of some *other* account must never remount the
    // client — that flip-flops the iframe and tears down a live session.
    const mountFollows =
      this.state.iframeSlot === null ||
      slot === this.state.iframeSlot ||
      saved.webSlot === this.state.iframeSlot;
    this.patch({
      accounts,
      activeAccountId: mountFollows ? saved.id : this.state.activeAccountId,
      iframeSlot: mountFollows ? saved.webSlot : this.state.iframeSlot,
    });
  }

  /* ------------------------------- removal ------------------------------ */

  async removeAccount(accountId: string): Promise<void> {
    const entry = this.state.accounts.find(
      (item) => item.account.id === accountId,
    );
    if (entry === undefined) return;

    await this.options.removeAccount(accountId);

    const slot = entry.account.webSlot;
    if (slot !== null) {
      this.storage.clearSessionBlob(slot);
    }
    const accounts = this.state.accounts.filter(
      (item) => item.account.id !== accountId,
    );
    const wasActive = this.state.activeAccountId === accountId;
    this.patch({
      accounts,
      activeAccountId: wasActive ? null : this.state.activeAccountId,
      iframeSlot: wasActive ? null : this.state.iframeSlot,
    });
  }

  /* ------------------------------- internals ---------------------------- */

  private knownSlots(): number[] {
    return this.state.accounts
      .map((entry) => entry.account.webSlot)
      .filter((slot): slot is number => slot !== null);
  }

  private toEntry(
    account: TelegramAccount,
    passcodeLocked: boolean,
  ): TelegramAccountEntry {
    const restorable =
      account.webSlot !== null &&
      account.sessionString !== null &&
      !passcodeLocked;
    return {
      account,
      status: restorable ? "connected" : "disconnected",
      needsRelink: !restorable,
    };
  }
}
