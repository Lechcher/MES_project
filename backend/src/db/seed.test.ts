import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { loadConfig } from "../config";
import { createDatabase, type DatabaseHandle } from "./index";
import { runMigrations } from "./migrate";
import { roles, ticketStates, user, userRoles } from "./schema";
import { DEMO_USERS, DEV_SEED_PASSWORD, seedDatabase } from "./seed";

const TMP_ROOT =
	"/private/var/folders/xg/lnbqz3fs2w74l46y045jdxmh0000gn/T/opencode";
const created: string[] = [];

afterAll(() => {
	for (const path of created) {
		for (const suffix of ["", "-wal", "-shm"]) {
			if (existsSync(`${path}${suffix}`)) rmSync(`${path}${suffix}`);
		}
	}
});

function createSeededDatabase(): DatabaseHandle {
	const path = join(TMP_ROOT, `mes-seed-${crypto.randomUUID()}.db`);
	created.push(path);
	runMigrations({ databasePath: path });
	return createDatabase(path);
}

describe("seedDatabase", () => {
	test("seeding twice is repeatable with identical row counts", async () => {
		const db = createSeededDatabase();
		const config = loadConfig({ NODE_ENV: "test" });

		const first = await seedDatabase({ db, config });
		const second = await seedDatabase({ db, config });

		expect(first.counts).toEqual(second.counts);
		expect(second.counts.users).toBe(5);
		expect(second.counts.ticketStates).toBe(7);
		expect(second.counts.leaveCodes).toBe(11);
		expect(second.counts.modules).toBe(5);
		expect(second.counts.roles).toBe(5);
		expect(second.counts.permissions).toBe(21);
		expect(second.counts.kpiPointRules).toBe(8);
		expect(second.counts.rolePermissions).toBe(78);
	});

	test("all seven ticket states exist after seeding", async () => {
		const db = createSeededDatabase();
		const config = loadConfig({ NODE_ENV: "test" });
		await seedDatabase({ db, config });

		const states = await db.select().from(ticketStates);
		expect(states.map((state) => state.code).sort()).toEqual([
			"ACT",
			"APP",
			"CAN",
			"OVERDUE",
			"PEN",
			"REJ",
			"REQ",
		]);
		// Each state carries the documented display name, colour and sort order.
		const requested = states.find((state) => state.code === "REQ");
		expect(requested?.name).toBe("Requested");
		expect(requested?.color).toBe("White");
		expect(requested?.sortOrder).toBe(1);
		const cancelled = states.find((state) => state.code === "CAN");
		expect(cancelled?.isTerminal).toBe(true);
	});

	test("exactly five demo users exist, one role each", async () => {
		const db = createSeededDatabase();
		const config = loadConfig({ NODE_ENV: "test" });
		await seedDatabase({ db, config });

		const users = await db.select().from(user);
		expect(users).toHaveLength(5);
		expect(users.map((row) => row.email).sort()).toEqual(
			DEMO_USERS.map((spec) => spec.email).sort(),
		);
		expect(users.every((row) => row.userCode.length > 0)).toBe(true);

		const roleRows = await db.select().from(roles);
		const roleCodeById = new Map(roleRows.map((row) => [row.id, row.code]));
		const expectedRoleByEmail = new Map(
			DEMO_USERS.map((spec) => [spec.email, spec.role]),
		);

		for (const row of users) {
			const links = await db
				.select()
				.from(userRoles)
				.where(eq(userRoles.userId, row.id));
			expect(links).toHaveLength(1);
			const code = roleCodeById.get(links[0]?.roleId ?? "");
			expect(code).toBe(expectedRoleByEmail.get(row.email));
		}
	});

	test("a production configuration refuses to seed", async () => {
		const db = createSeededDatabase();
		const config = loadConfig({ NODE_ENV: "test" });
		const productionConfig = { ...config, isProduction: true };

		await expect(
			seedDatabase({ db, config: productionConfig }),
		).rejects.toThrow(/production/i);

		// Nothing was loaded.
		const users = await db.select().from(user);
		expect(users).toHaveLength(0);
		const states = await db.select().from(ticketStates);
		expect(states).toHaveLength(0);
	});

	test("exports a documented development-only password constant", () => {
		expect(typeof DEV_SEED_PASSWORD).toBe("string");
		expect(DEV_SEED_PASSWORD.length).toBeGreaterThanOrEqual(8);
	});
});
