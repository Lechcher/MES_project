/**
 * Linked Telegram accounts domain tests.
 *
 * Pin the two invariants the module's security rests on: every operation is
 * scoped to the authenticated viewer (another viewer's rows are invisible,
 * not merely unreadable), and a session string exists in plaintext only
 * inside a single call — encrypted at rest, decrypted only for its owner's
 * own read, and never present in an audit entry.
 */

import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ConfigurationError, loadConfig } from "../config";
import type { DatabaseHandle } from "../db";
import { systemAuditLogs, telegramAccounts, user } from "../db/schema";
import { createTestDatabase, type TestDatabase } from "../db/test-db";
import type { Viewer, ViewerContext } from "../graphql/context";
import { toGraphQLError } from "../graphql/errors";
import {
	linkTelegramAccount,
	listViewerTelegramAccounts,
	MAX_LINKED_TELEGRAM_ACCOUNTS,
	maskPhoneNumber,
	removeTelegramAccount,
	type TelegramProfile,
} from "./accounts";

const KEY = "c".repeat(64);

const testDbs: TestDatabase[] = [];

afterAll(async () => {
	await Promise.all(testDbs.map((testDb) => testDb.close()));
});

async function freshDatabase(): Promise<DatabaseHandle> {
	const testDb = await createTestDatabase();
	testDbs.push(testDb);
	return testDb.db;
}

function viewer(id: string): Viewer {
	return {
		id,
		userCode: `U-${id}`,
		fullName: `User ${id}`,
		email: `${id}@mes.local`,
		departmentId: null,
		isActive: true,
		roleCodes: ["EMPLOYEE"],
	};
}

function ctx(
	db: DatabaseHandle,
	viewerId: string | null,
	encryptionKey: string | null = KEY,
): ViewerContext {
	return {
		viewer: viewerId === null ? null : viewer(viewerId),
		session: null,
		db,
		cache: new Map<string, unknown>(),
		request: { ipAddress: null, userAgent: "bun-test" },
		config: loadConfig({
			NODE_ENV: "test",
			...(encryptionKey === null
				? {}
				: { TELEGRAM_ENCRYPTION_KEY: encryptionKey }),
		}),
	};
}

async function seedUser(db: DatabaseHandle, id: string): Promise<void> {
	await db.insert(user).values({
		id,
		name: `User ${id}`,
		email: `${id}@mes.local`,
		emailVerified: true,
		userCode: `U-${id}`,
	});
}

const profile: TelegramProfile = {
	telegramUserId: "555000111",
	phoneNumber: "+84123456789",
	username: "mes_user",
	firstName: "Minh",
	lastName: "Nguyen",
};

const deviceFingerprint = {
	deviceModel: "Desktop",
	systemVersion: "Linux x86_64",
	appVersion: "1.0.0",
};

describe("maskPhoneNumber", () => {
	test("keeps the country prefix and last two digits", () => {
		expect(maskPhoneNumber("+84123456789")).toBe("+84•••••••89");
		expect(maskPhoneNumber("+14155550123")).toBe("+14•••••••23");
	});

	test("masks everything it cannot identify", () => {
		expect(maskPhoneNumber("12345")).toBe("••••••••");
		expect(maskPhoneNumber("+8499")).toBe("+84••");
	});
});

describe("linkTelegramAccount", () => {
	test("stores the session encrypted with the masked phone", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");

		const linked = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "plaintext-session-string",
			profile,
			deviceFingerprint,
		});

		const [row] = await db
			.select()
			.from(telegramAccounts)
			.where(eq(telegramAccounts.id, linked.id));

		expect(row.encryptedSession).not.toBe("plaintext-session-string");
		expect(row.encryptedSession).toMatch(/^[0-9a-f]+$/);
		expect(row.phoneNumber).toBe("+84•••••••89");
	});

	test("records an audit entry carrying no session material", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");

		await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "plaintext-session-string",
			profile,
			deviceFingerprint,
		});

		const [event] = await db
			.select()
			.from(systemAuditLogs)
			.where(eq(systemAuditLogs.action, "telegram_account.link"));

		expect(event.action).toBe("telegram_account.link");
		expect(event.userId).toBe("u1");
		expect(event.newData).toContain("555000111");
		expect(event.newData).not.toContain("plaintext-session-string");
		expect(event.oldData).toBeNull();
	});

	test("re-linking updates the existing record in place", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");

		const first = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "session-one",
			profile,
			deviceFingerprint,
		});
		const second = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "session-two",
			profile: { ...profile, username: "renamed" },
			deviceFingerprint: { ...deviceFingerprint, appVersion: "2.0.0" },
		});

		expect(second.id).toBe(first.id);
		const rows = await db.select().from(telegramAccounts);
		expect(rows).toHaveLength(1);
		expect(rows[0].username).toBe("renamed");

		const restored = await listViewerTelegramAccounts(ctx(db, "u1"));
		expect(restored[0].sessionString).toBe("session-two");
		expect(restored[0].deviceFingerprint?.appVersion).toBe("2.0.0");
	});

	test("refuses to store a session with no configured key", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");

		expect(() =>
			linkTelegramAccount(ctx(db, "u1", null), {
				sessionString: "plaintext-session-string",
				profile,
				deviceFingerprint,
			}),
		).toThrow(ConfigurationError);

		const rows = await db.select().from(telegramAccounts);
		expect(rows).toHaveLength(0);
	});

	test("refuses an unauthenticated viewer", async () => {
		const db = await freshDatabase();
		await expect(
			linkTelegramAccount(ctx(db, null), {
				sessionString: "plaintext-session-string",
				profile,
				deviceFingerprint,
			}),
		).rejects.toThrow("Authentication is required.");
	});

	test("refuses a new identity beyond the per-viewer ceiling, but still re-links a known one", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");

		for (let index = 0; index < MAX_LINKED_TELEGRAM_ACCOUNTS; index += 1) {
			await linkTelegramAccount(ctx(db, "u1"), {
				sessionString: `session-${index}`,
				profile: { ...profile, telegramUserId: `tg-${index}` },
				deviceFingerprint,
			});
		}

		await expect(
			linkTelegramAccount(ctx(db, "u1"), {
				sessionString: "one-too-many",
				profile: { ...profile, telegramUserId: "tg-one-too-many" },
				deviceFingerprint,
			}),
		).rejects.toThrow(/at most \d+ Telegram accounts/);

		// Re-linking an existing identity refreshes the row instead.
		const refreshed = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "refreshed-session",
			profile: { ...profile, telegramUserId: "tg-0" },
			deviceFingerprint,
		});
		const rows = await db.select().from(telegramAccounts);
		expect(rows).toHaveLength(MAX_LINKED_TELEGRAM_ACCOUNTS);
		const restored = await listViewerTelegramAccounts(ctx(db, "u1"));
		expect(
			restored.find((account) => account.id === refreshed.id)?.sessionString,
		).toBe("refreshed-session");
	});
});

describe("listViewerTelegramAccounts", () => {
	test("returns the owner's account with its decrypted session", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");
		await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "plaintext-session-string",
			profile,
			deviceFingerprint,
		});

		const accounts = await listViewerTelegramAccounts(ctx(db, "u1"));
		expect(accounts).toHaveLength(1);
		expect(accounts[0].sessionString).toBe("plaintext-session-string");
		expect(accounts[0].phoneNumber).toBe("+84•••••••89");
		expect(accounts[0].deviceFingerprint).toEqual(deviceFingerprint);
	});

	test("never returns another viewer's accounts or sessions", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");
		await seedUser(db, "u2");
		await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "u1-secret-session",
			profile,
			deviceFingerprint,
		});

		const accounts = await listViewerTelegramAccounts(ctx(db, "u2"));
		expect(accounts).toHaveLength(0);
		expect(accounts.map((account) => account.sessionString)).not.toContain(
			"u1-secret-session",
		);
	});
});

describe("error payloads", () => {
	test("a failed link surfaces no session material in its error payload", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");

		// The deployment has no encryption key: the failure must name the
		// variable to set and nothing about the session it refused to store.
		let payload: ReturnType<typeof toGraphQLError> | undefined;
		try {
			await linkTelegramAccount(ctx(db, "u1", null), {
				sessionString: "super-secret-session-string",
				profile,
				deviceFingerprint,
			});
		} catch (error) {
			payload = toGraphQLError(error);
		}

		expect(payload).toBeDefined();
		expect(payload?.message).not.toContain("super-secret-session-string");
		expect(payload?.message).not.toContain("555000111");
		expect(payload?.message).not.toContain("+84");
		expect(payload?.extensions).not.toHaveProperty("sessionString");
	});

	test("a failed remove surfaces no phone digits in its error payload", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");
		await seedUser(db, "u2");

		let payload: ReturnType<typeof toGraphQLError> | undefined;
		try {
			await removeTelegramAccount(ctx(db, "u2"), "no-such-account");
		} catch (error) {
			payload = toGraphQLError(error);
		}

		expect(payload?.extensions?.code).toBe("NOT_FOUND");
		expect(payload?.message).not.toContain("u1");
	});
});

describe("removeTelegramAccount", () => {
	test("removes the row and audits the identity, leaving others intact", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");
		const first = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "session-one",
			profile,
			deviceFingerprint,
		});
		const second = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "session-two",
			profile: { ...profile, telegramUserId: "555000222" },
			deviceFingerprint,
		});

		await removeTelegramAccount(ctx(db, "u1"), first.id);

		const rows = await db.select().from(telegramAccounts);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe(second.id);

		const [event] = await db
			.select()
			.from(systemAuditLogs)
			.where(eq(systemAuditLogs.action, "telegram_account.remove"));
		expect(event.resourceId).toBe(first.id);
		expect(event.oldData).toContain("555000111");
		expect(event.oldData).not.toContain("session-one");
	});

	test("refuses another viewer's row without disclosing it", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");
		await seedUser(db, "u2");
		const mine = await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "u1-secret-session",
			profile,
			deviceFingerprint,
		});

		await expect(removeTelegramAccount(ctx(db, "u2"), mine.id)).rejects.toThrow(
			"not linked to your account",
		);

		const rows = await db.select().from(telegramAccounts);
		expect(rows).toHaveLength(1);
	});

	test("cascades when the owning viewer is deleted", async () => {
		const db = await freshDatabase();
		await seedUser(db, "u1");
		await linkTelegramAccount(ctx(db, "u1"), {
			sessionString: "plaintext-session-string",
			profile,
			deviceFingerprint,
		});

		await db.delete(user).where(eq(user.id, "u1"));

		const rows = await db.select().from(telegramAccounts);
		expect(rows).toHaveLength(0);
	});
});
describe("telegram web slots", () => {
	test("assigns a first link a slot inside the embedded client's range", async () => {
		const db = await freshDatabase();
		await seedUser(db, "slot-viewer");

		const linked = await linkTelegramAccount(ctx(db, "slot-viewer"), {
			sessionString: "session-1",
			profile,
			deviceFingerprint,
		});

		expect(linked.webSlot).not.toBeNull();
		// Slot 1 is the client's default account; assigned slots start at 2
		// and stay inside the PostgreSQL integer range.
		expect(linked.webSlot as number).toBeGreaterThanOrEqual(2);
		expect(linked.webSlot as number).toBeLessThanOrEqual(2_147_483_646);

		const listed = await listViewerTelegramAccounts(ctx(db, "slot-viewer"));
		expect(listed[0]?.webSlot).toBe(linked.webSlot);
	});

	test("a re-link keeps the same slot and refreshes the session", async () => {
		const db = await freshDatabase();
		await seedUser(db, "relink-viewer");

		const first = await linkTelegramAccount(ctx(db, "relink-viewer"), {
			sessionString: "session-old",
			profile,
			deviceFingerprint,
		});
		const second = await linkTelegramAccount(ctx(db, "relink-viewer"), {
			sessionString: "session-new",
			profile,
			deviceFingerprint,
		});

		expect(second.id).toBe(first.id);
		expect(second.webSlot).toBe(first.webSlot);
		expect(second.sessionString).toBe("session-new");
	});

	test("two viewers' accounts never claim the same slot", async () => {
		const db = await freshDatabase();
		await seedUser(db, "viewer-a");
		await seedUser(db, "viewer-b");

		const a = await linkTelegramAccount(ctx(db, "viewer-a"), {
			sessionString: "session-a",
			profile,
			deviceFingerprint,
		});
		const b = await linkTelegramAccount(ctx(db, "viewer-b"), {
			sessionString: "session-b",
			profile: { ...profile, telegramUserId: "555999888" },
			deviceFingerprint,
		});

		expect(b.webSlot).not.toBe(a.webSlot);
	});

	test("a pre-slot row without session stays listed as disconnected", async () => {
		const db = await freshDatabase();
		await seedUser(db, "legacy-viewer");
		// A row as migration 0002 leaves the GramJS-era records: listed, but
		// with no session material and no slot until re-linked.
		await db.insert(telegramAccounts).values({
			id: crypto.randomUUID(),
			userId: "legacy-viewer",
			telegramUserId: "555legacy1",
			firstName: "Legacy",
			isActive: true,
		});

		const before = await listViewerTelegramAccounts(ctx(db, "legacy-viewer"));
		const legacy = before.find((row) => row.telegramUserId === "555legacy1");
		expect(legacy?.webSlot).toBeNull();
		expect(legacy?.sessionString).toBeNull();

		const relinked = await linkTelegramAccount(ctx(db, "legacy-viewer"), {
			sessionString: "session-legacy",
			profile: { ...profile, telegramUserId: "555legacy1" },
			deviceFingerprint,
		});
		expect(relinked.webSlot).not.toBeNull();
		expect(relinked.sessionString).toBe("session-legacy");
	});
});
