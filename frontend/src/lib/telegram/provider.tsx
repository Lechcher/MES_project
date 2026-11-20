"use client";

/**
 * Telegram multi-account provider.
 *
 * Owns one `TelegramController` for the module's route scope: the accounts
 * load when the module opens, and the watcher backs up whatever the embedded
 * client writes into the mounted slot. The controller is React-free (see
 * `./telegram-controller`); this file is the bridge.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import {
  fetchTelegramAccounts,
  removeTelegramAccount,
  saveTelegramAccount,
} from "./api";
import { watchAllSessionSlots } from "./session-bridge";
import type { TelegramControllerState } from "./telegram-controller";
import { TelegramController } from "./telegram-controller";

/** The controller for the current tree, or `null` outside the module. */
export const TelegramContext = createContext<TelegramController | null>(null);

/** The controller itself — for imperative actions (selection, removal). */
export function useTelegramController(): TelegramController | null {
  return useContext(TelegramContext);
}

/** The module state, subscribed through the controller's store. */
export function useTelegramState(): TelegramControllerState | null {
  const controller = useTelegramController();
  const subscribe = useCallback(
    (listener: () => void) =>
      controller ? controller.subscribe(listener) : () => {},
    [controller],
  );
  const getSnapshot = useCallback(
    () => controller?.getState() ?? null,
    [controller],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface TelegramProviderProps {
  children: ReactNode;
  /** Test seam: injects a pre-built controller instead of the live one. */
  controller?: TelegramController;
}

export function TelegramProvider({
  children,
  controller,
}: TelegramProviderProps) {
  const [own] = useState(
    () =>
      new TelegramController({
        loadAccounts: fetchTelegramAccounts,
        saveAccount: saveTelegramAccount,
        removeAccount: removeTelegramAccount,
      }),
  );
  const active = controller ?? own;

  useEffect(() => {
    // A failed load (an expired session, an unreachable API) surfaces in
    // the module's empty state instead of an unhandled rejection.
    void active.start().catch(() => {});
    // Leaving the module — sign-out included, because that unmounts the
    // app shell — clears any half-finished login's slot.
    return () => {
      active.stop();
    };
  }, [active]);

  const mounted = useSyncExternalStore(
    useCallback((listener: () => void) => active.subscribe(listener), [active]),
    useCallback(() => active.getState().iframeSlot !== null, [active]),
  );

  useEffect(() => {
    if (!mounted) return;
    // Whatever the embedded client writes — a completed login in MES's
    // linking flow, an account added through its own switcher, or a rotated
    // session — is backed up through the controller, which upserts the
    // account and follows the backend's stable slot. A failure is logged
    // and re-thrown so the watcher leaves the slot unseen and retries.
    return watchAllSessionSlots(async (slot, blob) => {
      try {
        await active.captureSession(slot, blob);
      } catch (error) {
        console.error(
          "Telegram session capture failed; retrying on the next change:",
          error,
        );
        throw error;
      }
    });
  }, [active, mounted]);

  return (
    <TelegramContext.Provider value={active}>
      {children}
    </TelegramContext.Provider>
  );
}
