/**
 * Bounded page-size policy tests.
 */
import { describe, expect, test } from "bun:test";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, clampPageArgs } from "./page-size";

describe("clampPageArgs", () => {
	test("applies the default when the limit is omitted", () => {
		expect(clampPageArgs({})).toEqual({ offset: 0, limit: DEFAULT_PAGE_SIZE });
		expect(clampPageArgs({ limit: null }).limit).toBe(DEFAULT_PAGE_SIZE);
	});

	test("caps an over-maximum limit and clamps a negative offset", () => {
		expect(clampPageArgs({ limit: 10_000 }).limit).toBe(MAX_PAGE_SIZE);
		expect(clampPageArgs({ offset: -5 }).offset).toBe(0);
	});

	test("keeps a valid requested page unchanged", () => {
		expect(clampPageArgs({ offset: 40, limit: 25 })).toEqual({
			offset: 40,
			limit: 25,
		});
	});
});
