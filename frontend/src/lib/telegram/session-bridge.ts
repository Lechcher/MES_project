/**
 * The session bridge between MES and the embedded Telegram Web client.
 *
 * The client (telegram-tt, served from `/telegram-web/`) is loaded in a
 * same-origin iframe, so its per-account session material — one JSON blob at
 * the localStorage key `account<N>` (per-data-center auth keys, server salts,
 * and the account identity) — is directly reachable from this origin. The
 * bridge is the whole integration surface:
 *
 *   hydrate  write the stored blob into the slot BEFORE the iframe mounts,
 *            so the client boots straight into the chat list;
 *   watch    notice the blob appearing (a completed login) or changing (key
 *            rotation), handing each version to the caller for backup;
 *   clear    wipe a slot's keys and caches when an account is removed.
 *
 * The client's own `passcode/sessionStore` is the one case where its session
 * data leaves plaintext localStorage (viewer-set screen lock): `isLocked()`
 * detects it, because a locked account cannot be hydrated at all.
 *
 * These functions are pure DOM/storage utilities — no React, no network —
 * so the unit tests drive them against a storage stub.
 */

/** The client's per-account session key: `account<N>`, `N` the slot. */
const SESSION_KEY_PREFIX = "account";

/** The client's flag key while its passcode store is locked. */
const PASSCODE_LOCK_KEY = "tt-is-screen-locked";

/**
 * The states in which the client's passcode store is not plaintext.
 *
 * Mirrors the client's own predicate (`passcode/sessionStore.ts`): any
 * recorded state locks the store away from plaintext localStorage — `false`
 * included, because that is a just-disabled passcode whose encrypted store
 * is still being unlocked in place.
 */
const LOCKED_PASSCODE_STATES = new Set([
  "true",
  "enabling",
  "disabling",
  "false",
]);

/** How often the poll re-reads a slot's blob when no event fires. */
const POLL_INTERVAL_MS = 2000;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // A blocked storage (private mode, permissions policy) must not crash
    // the module: the caller treats every read as "no session".
    return null;
  }
}

/** The storage key the embedded client keeps one account's session under. */
export function sessionKey(slot: number): string {
  return `${SESSION_KEY_PREFIX}${slot}`;
}

/** The slot's stored blob, or `null` when the slot holds no session. */
export function readSessionBlob(slot: number): string | null {
  const store = storage();
  if (store === null) return null;
  const raw = store.getItem(sessionKey(slot));
  return raw === null || raw === "" ? null : raw;
}

/** True when the slot already holds session material. */
export function hasStoredSession(slot: number): boolean {
  return readSessionBlob(slot) !== null;
}

/**
 * Hydrate one account before its iframe mounts.
 *
 * The blob is the decrypted session material the backend returned for this
 * account; writing it first is what makes the restore automatic — the client
 * finds the stored session and connects without any login step.
 */
export function writeSessionBlob(slot: number, blob: string): void {
  const store = storage();
  if (store === null) return;
  store.setItem(sessionKey(slot), blob);
}

/** Drop one slot's session material (removal, and passcode-locked cleanup). */
export function clearSessionBlob(slot: number): void {
  const store = storage();
  if (store === null) return;
  store.removeItem(sessionKey(slot));
}

/**
 * True when the embedded client keeps its sessions out of plaintext
 * localStorage (the viewer set a screen-lock passcode, or is mid-toggle).
 *
 * A locked slot cannot be hydrated: the module surfaces it as disconnected
 * with a re-link affordance instead of writing into a store the client will
 * not read.
 */
export function isPasscodeLocked(): boolean {
  const store = storage();
  if (store === null) return false;
  const state = store.getItem(PASSCODE_LOCK_KEY);
  return state !== null && LOCKED_PASSCODE_STATES.has(state);
}

/**
 * Delete the slot's client-side caches, best effort.
 *
 * The client names its IndexedDB databases with a `_<slot>` suffix; the
 * media cache is rebuilt from Telegram, so a failed deletion only costs a
 * re-download, never correctness. `indexedDB.databases()` is unavailable in
 * a few older browsers — the call is skipped silently there.
 */
export async function clearSlotCaches(slot: number): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const suffix = `_${slot}`;
  try {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .filter((database) => database.name?.endsWith(suffix) === true)
        .map(
          (database) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(database.name as string);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // Cache cleanup is best effort by design.
  }
}

/** Everything a removal needs to clear for one slot, local side only. */
export async function clearSlot(slot: number): Promise<void> {
  clearSessionBlob(slot);
  await clearSlotCaches(slot);
}

export interface SessionWatchOptions {
  /** Defaults to `POLL_INTERVAL_MS`. */
  pollIntervalMs?: number;
  /** When false, no `visibilitychange` catch-up read runs. Default true. */
  finalReadOnHide?: boolean;
}

/**
 * Watch every slot's session material and report each version.
 *
 * The client writes a slot's key when a login completes and whenever the
 * session rotates (a new `tempAuthKey`) — inside MES's own flows *and* inside
 * the client's native account switcher, which logs accounts in at slots MES
 * never allocated. Watching all `account<N>` keys (rather than one slot) is
 * what lets the backup capture either.
 *
 * The `storage` event is the fast path (the iframe announces its own writes);
 * the poll scans every key and the catch-up read on tab hide makes sure
 * nothing is missed when events do not fire.
 *
 * A slot counts as reported only after its handler resolves: a failed
 * capture (an expired viewer session, an unreachable API) leaves the slot
 * unseen, and the next poll retries it instead of losing the login forever.
 *
 * Returns the unsubscribe function.
 */
export function watchAllSessionSlots(
  onChange: (slot: number, blob: string) => Promise<void> | void,
  options: SessionWatchOptions = {},
): () => void {
  const interval = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const lastSeen = new Map<number, string>();
  const inFlight = new Set<number>();

  const emitChanges = () => {
    void (async () => {
      for (const [slot, blob] of readAllSessionBlobs()) {
        if (blob === lastSeen.get(slot) || inFlight.has(slot)) continue;
        inFlight.add(slot);
        try {
          await onChange(slot, blob);
          lastSeen.set(slot, blob);
        } catch {
          // Left unseen on purpose: the next scan retries this slot.
        } finally {
          inFlight.delete(slot);
        }
      }
    })();
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && !SLOT_KEY_PATTERN.test(event.key)) return;
    emitChanges();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") emitChanges();
  };

  const timer = window.setInterval(emitChanges, interval);
  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    window.clearInterval(timer);
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

/** The client's per-account keys: `account<N>` for the slot `N`. */
const SLOT_KEY_PATTERN = /^account(\d+)$/;

/** Every slot's blob the client currently stores, keyed by slot. */
export function readAllSessionBlobs(): Array<[number, string]> {
  const store = storage();
  if (store === null) return [];
  const found: Array<[number, string]> = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key === null) continue;
    const match = SLOT_KEY_PATTERN.exec(key);
    if (match === null) continue;
    const blob = store.getItem(key);
    if (blob === null || blob === "") continue;
    found.push([Number(match[1]), blob]);
  }
  return found;
}
