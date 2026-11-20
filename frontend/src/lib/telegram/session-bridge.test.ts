/**
 * Session bridge tests — the MES ↔ embedded-client storage seam.
 *
 * The bridge is plain DOM/storage code, so these tests run it against a
 * minimal window/document stub rather than a browser. The client's storage
 * contract (`account<N>` session key, the passcode lock key) is what the
 * tests pin: a drift there silently breaks auto-login.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearSessionBlob,
  clearSlot,
  clearSlotCaches,
  hasStoredSession,
  isPasscodeLocked,
  readAllSessionBlobs,
  readSessionBlob,
  sessionKey,
  watchAllSessionSlots,
  writeSessionBlob,
} from "./session-bridge";

class FakeStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

let store: FakeStorage;
let listeners: Map<string, Set<(event: unknown) => void>>;
/** Live fake timers, as ids → handler; `runTimers` fires the live ones. */
let liveTimers: Map<number, () => void>;
let nextTimerId: number;

function runTimers(): void {
  for (const timer of [...liveTimers.values()]) timer();
}

/** Storage writes from the "iframe" — announced to the parent like a browser does. */
function announceIframeWrite(key: string): void {
  for (const listener of listeners.get("storage") ?? []) {
    listener({ key, newValue: store.getItem(key) });
  }
}

beforeEach(() => {
  store = new FakeStorage();
  listeners = new Map();
  liveTimers = new Map();
  nextTimerId = 1;
  const addEventListener = (
    type: string,
    listener: (event: unknown) => void,
  ) => {
    const set = listeners.get(type) ?? new Set();
    set.add(listener);
    listeners.set(type, set);
  };
  const removeEventListener = (
    type: string,
    listener: (event: unknown) => void,
  ) => {
    listeners.get(type)?.delete(listener);
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal window stub
  (globalThis as any).window = {
    localStorage: store,
    addEventListener,
    removeEventListener,
    setInterval: (handler: () => void) => {
      const id = nextTimerId;
      nextTimerId += 1;
      liveTimers.set(id, handler);
      return id;
    },
    clearInterval: (id: number) => {
      liveTimers.delete(id);
    },
  };
  // biome-ignore lint/suspicious/noExplicitAny: minimal document stub
  (globalThis as any).document = {
    visibilityState: "visible",
    addEventListener,
    removeEventListener,
  };
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: resetting the stub
  (globalThis as any).window = undefined;
  // biome-ignore lint/suspicious/noExplicitAny: resetting the stub
  (globalThis as any).document = undefined;
});

describe("session key and blob round-trip", () => {
  test("uses the client's per-slot key", () => {
    expect(sessionKey(7)).toBe("account7");
  });

  test("writes, reads and clears a slot's blob", () => {
    expect(readSessionBlob(3)).toBeNull();
    expect(hasStoredSession(3)).toBe(false);

    writeSessionBlob(3, '{"dcId":2}');
    expect(readSessionBlob(3)).toBe('{"dcId":2}');
    expect(hasStoredSession(3)).toBe(true);

    clearSessionBlob(3);
    expect(readSessionBlob(3)).toBeNull();
  });

  test("an empty stored value reads as no session", () => {
    store.setItem("account4", "");
    expect(readSessionBlob(4)).toBeNull();
    expect(hasStoredSession(4)).toBe(false);
  });
});

describe("isPasscodeLocked", () => {
  test("the recorded lock states block hydration", () => {
    for (const state of ["true", "enabling", "disabling", "false"]) {
      store.setItem("tt-is-screen-locked", state);
      expect(isPasscodeLocked()).toBe(true);
    }
  });

  test("no flag means the plaintext store hydrates", () => {
    expect(isPasscodeLocked()).toBe(false);
    store.setItem("tt-is-screen-locked", "unknown");
    expect(isPasscodeLocked()).toBe(false);
  });
});

describe("readAllSessionBlobs", () => {
  test("lists every stored slot's blob, ignoring non-session keys", () => {
    writeSessionBlob(2, "blob-2");
    writeSessionBlob(4242, "blob-4242");
    store.setItem("tt-is-screen-locked", "true");

    expect(readAllSessionBlobs()).toEqual([
      [2, "blob-2"],
      [4242, "blob-4242"],
    ]);
  });

  test("an empty slot value is not a blob", () => {
    store.setItem("account3", "");
    expect(readAllSessionBlobs()).toEqual([]);
  });
});

describe("watchAllSessionSlots", () => {
  test("reports the slot and blob when the iframe announces it", () => {
    const seen: Array<[number, string]> = [];
    const stop = watchAllSessionSlots((slot, blob) => seen.push([slot, blob]));

    writeSessionBlob(5, "login-blob");
    announceIframeWrite("account5");

    expect(seen).toEqual([[5, "login-blob"]]);
    stop();
  });

  test("a slot the client's own switcher added is reported too", () => {
    const seen: Array<[number, string]> = [];
    const stop = watchAllSessionSlots((slot, blob) => seen.push([slot, blob]));

    // A login the client performed at a slot MES never allocated.
    writeSessionBlob(1, "native-blob");
    announceIframeWrite("account1");

    expect(seen).toEqual([[1, "native-blob"]]);
    stop();
  });

  test("the poll catches writes no event announced", () => {
    const seen: Array<[number, string]> = [];
    const stop = watchAllSessionSlots((slot, blob) => seen.push([slot, blob]), {
      pollIntervalMs: 10,
    });

    writeSessionBlob(6, "rotated-blob");
    runTimers();
    expect(seen).toEqual([[6, "rotated-blob"]]);

    // A second poll of an unchanged blob reports nothing again.
    runTimers();
    expect(seen).toEqual([[6, "rotated-blob"]]);
    stop();
  });

  test("after unsubscribe nothing is reported", () => {
    const seen: Array<[number, string]> = [];
    const stop = watchAllSessionSlots((slot, blob) => seen.push([slot, blob]));
    stop();

    writeSessionBlob(8, "late-blob");
    announceIframeWrite("account8");
    runTimers();
    expect(seen).toEqual([]);
  });

  test("a failed capture is retried by the next scan", async () => {
    const seen: Array<[number, string]> = [];
    let failures = 2;
    const stop = watchAllSessionSlots(
      async (slot, blob) => {
        seen.push([slot, blob]);
        if (failures > 0) {
          failures -= 1;
          throw new Error("api down");
        }
      },
      { pollIntervalMs: 10 },
    );

    writeSessionBlob(6, "retry-blob");
    runTimers();
    await settle();
    expect(seen).toEqual([[6, "retry-blob"]]);

    runTimers();
    await settle();
    expect(seen).toEqual([
      [6, "retry-blob"],
      [6, "retry-blob"],
    ]);

    runTimers();
    await settle();
    // Third attempt succeeds — the slot is no longer re-reported.
    expect(seen).toHaveLength(3);
    runTimers();
    await settle();
    expect(seen).toHaveLength(3);
    stop();
  });
});

/** Let the watcher's async scan drain (the poll has no real clock). */
function settle(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe("clearSlot", () => {
  test("drops the session material", async () => {
    writeSessionBlob(9, "blob");
    await clearSlot(9);
    expect(readSessionBlob(9)).toBeNull();
  });

  test("cache cleanup skips silently without IndexedDB", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: no IndexedDB in the stub
    (globalThis as any).indexedDB = undefined;
    await clearSlotCaches(9);
    // The promise resolves — best effort by design.
    expect(readSessionBlob(9)).toBeNull();
  });
});
