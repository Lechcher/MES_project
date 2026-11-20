/**
 * Turning the embedded client's session material into MES records.
 *
 * The client stores everything about one account in the `account<N>` blob
 * (`session-bridge.ts`); this file is the only place that knows its shape:
 * how to read a profile out of it, and which slot a login-in-progress runs
 * in before the backend has assigned the account its stable slot.
 *
 * The blob is structured third-party data: every field is read defensively,
 * because a malformed or partial blob must produce "cannot link", never a
 * crash or a half-written account record.
 */

import type { DeviceFingerprint, TelegramProfile } from "./types";

/**
 * The version of the vendored client this module was built against.
 *
 * Reported as the app version on the account's device record: the embedded
 * client manages its own device identity toward Telegram, so this is the
 * only identity MES persists, and it ties the record to the vendored bundle
 * it was captured with.
 */
export const EMBEDDED_CLIENT_VERSION = "13.0.1";

/** The device identity MES persists for an embedded-client account. */
export const EMBEDDED_DEVICE_FINGERPRINT: DeviceFingerprint = {
  deviceModel: "Telegram Web (embedded client)",
  systemVersion: "browser",
  appVersion: EMBEDDED_CLIENT_VERSION,
};

/** The client's default slot; assigned slots start above it. */
export const MIN_WEB_SLOT = 2;
/** Pool ceiling, matching the backend's integer range. */
export const MAX_WEB_SLOT = 2_147_483_646;

/**
 * The slot range a login-in-progress runs in.
 *
 * Deliberately outside the backend's assignment pool: the shell picks these
 * locally (the account does not exist yet, so no backend slot can be shown),
 * and a shared-origin browser may hold several viewers' slots. When the
 * first save returns the account's stable slot, the shell moves the session
 * there and clears the temporary one.
 */
export const LINKING_SLOT_MIN = 1_500_000_000;
export const LINKING_SLOT_MAX = 1_800_000_000;

/** A candidate linking slot that no stored session currently uses. */
export function allocateLinkingSlot(taken: readonly number[]): number {
  const used = new Set(taken);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate =
      LINKING_SLOT_MIN +
      Math.floor(Math.random() * (LINKING_SLOT_MAX - LINKING_SLOT_MIN + 1));
    if (!used.has(candidate)) return candidate;
  }
  // Deterministic fallback: the first free slot above the taken ones.
  let candidate = LINKING_SLOT_MIN;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

/** One account's identity as the client records it in its session blob. */
interface BlobIdentity {
  telegramUserId: string;
  firstName: string;
  lastName: string | null;
  phoneNumber: string;
  username: string | null;
  avatarUrl: string | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * True when a blob actually carries session material.
 *
 * A real session always holds at least one data-center auth key (the client
 * keeps `dc<N>_auth_key` per DC) or an in-flight temporary key; a blob with
 * an identity but none of those is a placeholder the client would show as
 * logged-out — capturing one would create an account record that restores
 * into a login screen. The guard is deliberately structural (key names),
 * not a full validity check: only the client can tell a live session from
 * a revoked one.
 */
export function hasSessionMaterial(blob: string): boolean {
  try {
    const parsed: unknown = JSON.parse(blob);
    if (typeof parsed !== "object" || parsed === null) return false;
    const keys = Object.keys(parsed as Record<string, unknown>);
    return keys.some(
      (key) => /^dc\d+_auth_key$/.test(key) || key === "tempAuthKey",
    );
  } catch {
    return false;
  }
}

/**
 * Read the account identity out of a session blob.
 *
 * Returns `null` when the blob does not carry a usable identity — an empty
 * or half-written session — which is the caller's signal that no account
 * record can be created yet.
 */
export function readBlobIdentity(blob: string): BlobIdentity | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(blob);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const raw = parsed as Record<string, unknown>;

  // The client keeps ids as numbers in some shapes and strings in others.
  const userId = raw.userId;
  const telegramUserId =
    typeof userId === "string"
      ? userId.trim()
      : typeof userId === "number"
        ? String(userId)
        : "";
  const firstName = text(raw.firstName);
  if (telegramUserId === "" || firstName === null) return null;

  return {
    telegramUserId,
    firstName,
    lastName: text(raw.lastName),
    phoneNumber: text(raw.phone) ?? "",
    username: text(raw.username),
    avatarUrl: text(raw.avatarUri),
  };
}

/** The profile a captured blob links (or re-links) with, or `null`. */
export function blobToProfile(blob: string): TelegramProfile | null {
  const identity = readBlobIdentity(blob);
  if (identity === null) return null;
  // An identity without session material is not a linkable account: the
  // client would restore into a login screen (see `hasSessionMaterial`).
  if (!hasSessionMaterial(blob)) return null;
  return {
    telegramUserId: identity.telegramUserId,
    phoneNumber: identity.phoneNumber,
    username: identity.username,
    firstName: identity.firstName,
    lastName: identity.lastName,
    avatarUrl: identity.avatarUrl,
  };
}
