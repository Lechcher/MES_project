/**
 * Linked Telegram accounts domain service.
 *
 * Owns the viewer-owned Telegram surface of the multi-account module
 * (`openspec/specs/core/telegram-multi-account/spec.md`): a viewer links their
 * own Telegram accounts inside the embedded Telegram Web client, every later
 * visit restores those sessions from here, and a viewer can remove an account
 * again.
 *
 * Two invariants shape the whole module. First, every function is scoped to
 * the authenticated viewer — the session is a bearer credential, so a row
 * belonging to another viewer is invisible, not merely unreadable by
 * convention. Second, the session string exists in plaintext only inside a
 * single function call: encrypted on the way in, decrypted on the way out
 * under the server-held key, and never written to an audit entry, a log
 * line, or an error message.
 */

import { randomInt } from "node:crypto";
import { and, count, eq, max } from "drizzle-orm";
import type { TelegramAccountRow } from "../db/schema";
import { telegramAccounts } from "../db/schema";
import { recordAuditEvent } from "../domain/audit";
import type { ViewerContext } from "../graphql/context";
import { DomainError } from "../graphql/errors";
import { decryptSession, encryptSession, requireTelegramKey } from "./crypto";

/** One of a viewer's Telegram accounts as the API surfaces it. */
export interface LinkedTelegramAccount {
	id: string;
	telegramUserId: string;
	/** Masked form (`+84••••••42`); the real number is never stored. */
	phoneNumber: string | null;
	username: string | null;
	firstName: string;
	lastName: string | null;
	avatarUrl: string | null;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
	/** Set by the restore path only: replays on every reconnection. */
	deviceFingerprint: DeviceFingerprint | null;
	/** Set by the restore path only: the decrypted `StringSession`. */
	sessionString: string | null;
	/**
	 * The stable slot the embedded Telegram Web client keeps this account
	 * under (its `?account=N` scheme). Assigned once at link time and reused
	 * on every restore; `null` only for rows linked before the slot column
	 * existed (no session material either — re-link assigns one).
	 */
	webSlot: number | null;
}

/**
 * Slot bounds for the embedded client's `?account=N` account scheme.
 *
 * The client ignores slots ≤ 1 (slot 1 is the default account), so assigned
 * slots start at 2; the ceiling is the PostgreSQL integer range. Slots are
 * randomly drawn from this window because the client's storage is per-origin
 * — every MES viewer on one browser shares it — so a per-viewer sequence
 * would collide.
 */
const MIN_WEB_SLOT = 2;
const MAX_WEB_SLOT = 2_147_483_646;
const SLOT_ATTEMPTS = 5;

/**
 * The device identity Telegram sees for one account.
 *
 * Generated once at the account's first link and replayed on every later
 * reconnection, so a routine restore does not read to Telegram as a new
 * device. Owned by the linking flow (frontend), persisted here.
 */
export interface DeviceFingerprint {
	deviceModel: string;
	systemVersion: string;
	appVersion: string;
}

/** The Telegram profile reported by `getMe()` after a browser-side login. */
export interface TelegramProfile {
	telegramUserId: string;
	/** Full number in international form; masked before storage. */
	phoneNumber: string;
	username?: string | null;
	firstName: string;
	lastName?: string | null;
	avatarUrl?: string | null;
}

export interface LinkTelegramAccountInput {
	sessionString: string;
	profile: TelegramProfile;
	deviceFingerprint: DeviceFingerprint;
}

/**
 * Per-viewer ceiling on linked Telegram accounts.
 *
 * Each linked account holds a live MTProto connection in the viewer's browser
 * while the module is open, so the count bounds both memory and Telegram-side
 * risk. A configurable value would need a settings surface this module does
 * not have; the constant is documented here instead.
 */
export const MAX_LINKED_TELEGRAM_ACCOUNTS = 10;

function requireViewerId(ctx: ViewerContext): string {
	const viewerId = ctx.viewer?.id;
	if (viewerId === undefined) {
		throw new DomainError("UNAUTHENTICATED", "Authentication is required.");
	}
	return viewerId;
}

/**
 * Mask a phone number for storage.
 *
 * The country prefix and the last two digits survive; everything between
 * becomes bullets, so the row identifies the account without holding a
 * dialable number. A number too short to mask meaningfully is masked
 * entirely.
 */
export function maskPhoneNumber(raw: string): string {
	const trimmed = raw.trim();
	// A fixed two-digit country prefix keeps the mask deterministic across
	// number lengths; what identifies the account for the viewer is the
	// prefix and the tail, so the national part is fully hidden.
	const match = /^(\+\d{2})(\d+)$/.exec(trimmed);
	if (!match) return "••••••••";
	const [, prefix, rest] = match;
	if (rest.length <= 2) return `${prefix}${"•".repeat(Math.max(rest.length, 2))}`;
	return `${prefix}${"•".repeat(rest.length - 2)}${rest.slice(-2)}`;
}

function parseFingerprint(raw: string | null): DeviceFingerprint | null {
	if (raw === null) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<DeviceFingerprint>;
		if (
			typeof parsed.deviceModel !== "string" ||
			typeof parsed.systemVersion !== "string" ||
			typeof parsed.appVersion !== "string"
		) {
			return null;
		}
		return {
			deviceModel: parsed.deviceModel,
			systemVersion: parsed.systemVersion,
			appVersion: parsed.appVersion,
		};
	} catch {
		return null;
	}
}

function toLinkedAccount(
	row: TelegramAccountRow,
	session: { sessionString: string | null } = { sessionString: null },
): LinkedTelegramAccount {
	return {
		id: row.id,
		telegramUserId: row.telegramUserId,
		phoneNumber: row.phoneNumber,
		username: row.username,
		firstName: row.firstName,
		lastName: row.lastName,
		avatarUrl: row.avatarUrl,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deviceFingerprint: parseFingerprint(row.deviceFingerprint),
		sessionString: session.sessionString,
		webSlot: row.webSlot,
	};
}

/**
 * Assign a slot for a first-time link.
 *
 * A random draw keeps concurrent viewers on one browser from colliding, and
 * the read check catches the (rare) draw of a slot another viewer took. If
 * the randomness is exhausted, the slot above the current maximum is the
 * last resort — uniqueness is guaranteed by the index either way, and a
 * failed insert surfaces as the domain's internal error rather than a
 * silently stolen slot.
 */
async function allocateWebSlot(ctx: ViewerContext): Promise<number> {
	for (let attempt = 0; attempt < SLOT_ATTEMPTS; attempt += 1) {
		const candidate = randomInt(MIN_WEB_SLOT, MAX_WEB_SLOT + 1);
		const taken = await ctx.db
			.select({ id: telegramAccounts.id })
			.from(telegramAccounts)
			.where(eq(telegramAccounts.webSlot, candidate))
			.limit(1);
		if (taken.length === 0) return candidate;
	}
	const rows = await ctx.db
		.select({ maxSlot: max(telegramAccounts.webSlot) })
		.from(telegramAccounts);
	const highest = rows[0]?.maxSlot ?? MIN_WEB_SLOT - 1;
	return Math.min(highest + 1, MAX_WEB_SLOT);
}

/**
 * The viewer's linked accounts, with sessions restored for reconnect.
 *
 * The decrypted session strings exist only for the duration of this call and
 * for the owning viewer's own request. A record that cannot be decrypted
 * (written under a rotated key) fails the whole read: silently dropping it
 * would make an account vanish from the module with no explanation.
 */
export async function listViewerTelegramAccounts(
	ctx: ViewerContext,
): Promise<LinkedTelegramAccount[]> {
	const viewerId = requireViewerId(ctx);
	const key = ctx.config.telegramEncryptionKey;
	const rows = await ctx.db
		.select()
		.from(telegramAccounts)
		.where(eq(telegramAccounts.userId, viewerId));

	const accounts = rows.map((row) =>
		toLinkedAccount(row, {
			sessionString:
				key === null ||
				row.encryptedSession === null ||
				row.sessionIv === null ||
				row.sessionAuthTag === null
					? null
					: decryptSession(key, {
							ciphertext: row.encryptedSession,
							iv: row.sessionIv,
							authTag: row.sessionAuthTag,
						}),
		}),
	);
	return accounts;
}

/**
 * Link (or re-link) one Telegram account for the viewer.
 *
 * Upserts on (viewer, Telegram identity): re-linking refreshes the session,
 * profile and device fingerprint of the existing record instead of creating a
 * second one. An unconfigured encryption key refuses the link before any
 * plaintext exists in the process.
 */
export async function linkTelegramAccount(
	ctx: ViewerContext,
	input: LinkTelegramAccountInput,
): Promise<LinkedTelegramAccount> {
	const viewerId = requireViewerId(ctx);
	const key = requireTelegramKey(ctx.config.telegramEncryptionKey);

	const profile = input.profile;
	if (profile.telegramUserId === "" || profile.firstName === "") {
		throw new DomainError(
			"VALIDATION_FAILED",
			"A Telegram account link requires the Telegram user id and first name.",
		);
	}

	// Re-linking a known identity never hits the ceiling: it refreshes an
	// existing row rather than adding one. The row's slot (when it has one)
	// is carried into the refresh unchanged so the embedded client keeps
	// seeing the same account slot across re-links.
	const existing = await ctx.db
		.select({ id: telegramAccounts.id, webSlot: telegramAccounts.webSlot })
		.from(telegramAccounts)
		.where(
			and(
				eq(telegramAccounts.userId, viewerId),
				eq(telegramAccounts.telegramUserId, profile.telegramUserId),
			),
		)
		.limit(1);

	let webSlot = existing[0]?.webSlot ?? null;
	if (webSlot === null) {
		webSlot = await allocateWebSlot(ctx);
	}

	if (existing.length === 0) {
		const counts = await ctx.db
			.select({ count: count() })
			.from(telegramAccounts)
			.where(eq(telegramAccounts.userId, viewerId));
		const linked = counts[0]?.count ?? 0;
		if (linked >= MAX_LINKED_TELEGRAM_ACCOUNTS) {
			throw new DomainError(
				"RULE_VIOLATION",
				`A viewer can link at most ${MAX_LINKED_TELEGRAM_ACCOUNTS} Telegram accounts. Remove one to link another.`,
			);
		}
	}

	const encrypted = encryptSession(key, input.sessionString);
	const values = {
		userId: viewerId,
		telegramUserId: profile.telegramUserId,
		phoneNumber: maskPhoneNumber(profile.phoneNumber),
		username: profile.username ?? null,
		firstName: profile.firstName,
		lastName: profile.lastName ?? null,
		avatarUrl: profile.avatarUrl ?? null,
		encryptedSession: encrypted.ciphertext,
		sessionIv: encrypted.iv,
		sessionAuthTag: encrypted.authTag,
		deviceFingerprint: JSON.stringify(input.deviceFingerprint),
		webSlot,
		isActive: true,
		updatedAt: new Date(),
	};

	// The conflict set refreshes everything except the slot — a re-link keeps
	// the slot the viewer already has, unless the pre-slot row never got one,
	// in which case this link assigns it.
	const { webSlot: _assignedSlot, ...conflictSet } = values;

	const rows = await ctx.db
		.insert(telegramAccounts)
		.values({ id: crypto.randomUUID(), ...values })
		.onConflictDoUpdate({
			target: [telegramAccounts.userId, telegramAccounts.telegramUserId],
			set:
				existing[0]?.webSlot == null
					? { ...conflictSet, webSlot }
					: conflictSet,
		})
		.returning();

	const row = rows[0];
	if (row === undefined) {
		throw new DomainError("INTERNAL", "Linking the Telegram account failed.");
	}

	// A credential event is audited with the Telegram identity; the session
	// material itself never leaves the ciphertext layer.
	await recordAuditEvent(ctx, {
		action: "telegram_account.link",
		moduleCode: null,
		resourceType: "telegram_account",
		resourceId: row.id,
		newData: {
			telegramUserId: profile.telegramUserId,
			phoneNumber: row.phoneNumber,
			username: row.username,
		},
	});

	return toLinkedAccount(row, { sessionString: input.sessionString });
}

/**
 * Remove one of the viewer's linked accounts.
 *
 * Scoped by viewer: removing an id the viewer does not own is indistinguishable
 * from removing one that does not exist, so no cross-viewer information is
 * disclosed. The audit entry carries only the identity that was removed.
 */
export async function removeTelegramAccount(
	ctx: ViewerContext,
	accountId: string,
): Promise<void> {
	const viewerId = requireViewerId(ctx);

	const rows = await ctx.db
		.delete(telegramAccounts)
		.where(
			and(
				eq(telegramAccounts.id, accountId),
				eq(telegramAccounts.userId, viewerId),
			),
		)
		.returning();

	const row = rows[0];
	if (row === undefined) {
		throw new DomainError(
			"NOT_FOUND",
			"That Telegram account is not linked to your account.",
		);
	}

	await recordAuditEvent(ctx, {
		action: "telegram_account.remove",
		moduleCode: null,
		resourceType: "telegram_account",
		resourceId: row.id,
		oldData: {
			telegramUserId: row.telegramUserId,
			phoneNumber: row.phoneNumber,
			username: row.username,
		},
	});
}