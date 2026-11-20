/**
 * Shared shapes for the multi-account Telegram module.
 *
 * Mirrors the GraphQL contract (`API_CONTACT_SPECIFICATION.md` §6.6): the
 * browser restores each account from its decrypted session string, and the
 * device fingerprint is replayed verbatim so Telegram keeps seeing one device.
 */

/** One of the viewer's linked Telegram accounts. */
export interface TelegramAccount {
  id: string;
  telegramUserId: string;
  /** Masked by the server before storage (`+84••••••89`). */
  phoneNumber: string | null;
  username: string | null;
  firstName: string;
  lastName: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  /** The device identity Telegram sees for this account. */
  deviceFingerprint: DeviceFingerprint | null;
  /**
   * The decrypted session material of the embedded Telegram Web client (its
   * `account<slot>` blob). A bearer credential for the Telegram account —
   * it exists only in the owner's own restore response and is never logged
   * or persisted by this module.
   */
  sessionString: string | null;
  /**
   * The stable slot the embedded client keeps this account under. Assigned
   * once by the backend at link time; the module hydrates into it and mounts
   * the client's iframe with it. `null` on a pre-slot row — no session
   * either — which the module shows as disconnected until re-linked.
   */
  webSlot: number | null;
}

/** The device identity persisted once at an account's first link. */
export interface DeviceFingerprint {
  deviceModel: string;
  systemVersion: string;
  appVersion: string;
}

/** A Telegram profile, from `getMe()` after a browser-side login. */
export interface TelegramProfile {
  telegramUserId: string;
  /** Full number in international form; the server masks it before storage. */
  phoneNumber: string;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  avatarUrl?: string | null;
}

/**
 * What the linking flow produces and hands to the save mutation.
 *
 * `deviceFingerprint` is the account's persisted device identity: the flow
 * reuses the stored one when the Telegram identity is already linked (a
 * re-link keeps Telegram seeing one device) and generates a new one only on
 * a first link.
 */
export interface TelegramLinkResult {
  sessionString: string;
  profile: TelegramProfile;
  deviceFingerprint: DeviceFingerprint;
}

/** Connection state of one account's browser client. */
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "revoked";

/** An incoming message relevant to unread counts. */
export interface TelegramMessageEvent {
  chatId: string;
}

/** One conversation in an account's chat list. */
export interface TelegramDialog {
  id: string;
  title: string;
  /** Text preview of the newest message, when it has one. */
  lastMessagePreview: string | null;
  /** Unix seconds of the newest message, when known. */
  lastMessageAt: number | null;
  unreadCount: number;
  isGroup: boolean;
  isChannel: boolean;
}

/** One message in a conversation's history. */
export interface TelegramMessage {
  id: string;
  chatId: string;
  text: string;
  fromSelf: boolean;
  /** Unix seconds, when Telegram reported a date. */
  sentAt: number | null;
}

/** The conversation surface a connected client exposes to the workspace. */
export interface TelegramMessagingClient {
  /** The account's conversations, newest first. */
  getDialogs(limit: number): Promise<TelegramDialog[]>;
  /** A page of history, oldest-side pagination through `beforeMessageId`. */
  getMessages(
    chatId: string,
    options: { limit: number; beforeMessageId?: string },
  ): Promise<TelegramMessage[]>;
  sendMessage(
    chatId: string,
    text: string,
    options?: { replyToMessageId?: string },
  ): Promise<void>;
  /** Attachments upload straight to Telegram; MES storage is not in the path. */
  sendFile(chatId: string, file: File): Promise<void>;
}

export const TELEGRAM_ACCOUNTS_QUERY = /* GraphQL */ `
  query TelegramAccounts {
    telegramAccounts {
      id
      telegramUserId
      phoneNumber
      username
      firstName
      lastName
      avatarUrl
      isActive
      deviceFingerprint
      sessionString
      webSlot
    }
  }
`;

export const SAVE_TELEGRAM_ACCOUNT_MUTATION = /* GraphQL */ `
  mutation SaveTelegramAccount($input: SaveTelegramAccountInput!) {
    saveTelegramAccount(input: $input) {
      id
      telegramUserId
      phoneNumber
      username
      firstName
      lastName
      avatarUrl
      isActive
      deviceFingerprint
      sessionString
      webSlot
    }
  }
`;

export const REMOVE_TELEGRAM_ACCOUNT_MUTATION = /* GraphQL */ `
  mutation RemoveTelegramAccount($accountId: ID!) {
    removeTelegramAccount(accountId: $accountId)
  }
`;
