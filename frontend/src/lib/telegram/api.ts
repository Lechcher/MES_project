/**
 * Telegram account API calls.
 *
 * All three operations run through the same-origin GraphQL route handler, so
 * the session cookie — never a token in this bundle — scopes every call to the
 * signed-in viewer. The session string the API returns reaches only this
 * viewer's own browser.
 */

import { graphqlRequest } from "@/lib/mes/client";
import type {
  DeviceFingerprint,
  TelegramAccount,
  TelegramProfile,
} from "./types";
import {
  REMOVE_TELEGRAM_ACCOUNT_MUTATION,
  SAVE_TELEGRAM_ACCOUNT_MUTATION,
  TELEGRAM_ACCOUNTS_QUERY,
} from "./types";

interface TelegramAccountsPayload {
  telegramAccounts: TelegramAccount[];
}

interface SaveTelegramAccountPayload {
  saveTelegramAccount: TelegramAccount;
}

/** The viewer's linked accounts, with sessions for reconnect. */
export async function fetchTelegramAccounts(
  signal?: AbortSignal,
): Promise<TelegramAccount[]> {
  const payload = await graphqlRequest<TelegramAccountsPayload>(
    TELEGRAM_ACCOUNTS_QUERY,
    { signal },
  );
  return payload.telegramAccounts;
}

/** Persist (or re-persist) one linked account after a browser-side login. */
export async function saveTelegramAccount(input: {
  sessionString: string;
  profile: TelegramProfile;
  deviceFingerprint: DeviceFingerprint;
}): Promise<TelegramAccount> {
  const payload = await graphqlRequest<SaveTelegramAccountPayload>(
    SAVE_TELEGRAM_ACCOUNT_MUTATION,
    { variables: { input } },
  );
  return payload.saveTelegramAccount;
}

/** Remove one of the viewer's linked accounts. */
export async function removeTelegramAccount(accountId: string): Promise<void> {
  await graphqlRequest(REMOVE_TELEGRAM_ACCOUNT_MUTATION, {
    variables: { accountId },
  });
}
