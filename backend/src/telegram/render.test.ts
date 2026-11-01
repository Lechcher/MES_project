/**
 * Rendering tests.
 *
 * Formatting is pure, so the properties worth pinning are the ones a broken
 * render would lose silently: aligned columns, HTML escaping (a title with
 * `<` must not break the message), clipping to Telegram's limit, and the
 * role-aware help listing.
 */

import { describe, expect, test } from "bun:test";
import {
	clipToLimit,
	escapeHtml,
	pageFooter,
	renderHelp,
	renderLoginPrompt,
	renderTable,
	TELEGRAM_MESSAGE_LIMIT,
} from "./render";

describe("renderTable", () => {
	test("aligns columns and clips long cells", () => {
		const table = renderTable(
			["code", "title"],
			[
				["T1", "Short"],
				["T2", "A very long ticket title that overflows the column"],
			],
		);
		const lines = table.split("\n");
		// The header is padded to the widest cell so every row lines up.
		expect(lines[1]).toStartWith("code");
		expect(lines[1]).toInclude("title");
		expect(lines[2]).toMatch(/^[─ ]+$/);
		expect(lines[3]).toStartWith("T1");
		expect(lines[4]).toContain("…");
		// Every clipped row keeps the same width as the header.
		expect(lines[3].length).toBe(lines[4].length);
	});

	test("reports emptiness plainly", () => {
		expect(renderTable(["code"], [])).toBe("<pre>No records.</pre>");
	});
});

describe("escapeHtml", () => {
	test("escapes the three significant characters", () => {
		expect(escapeHtml("<b>&</b>")).toBe("&lt;b&gt;&amp;&lt;/b&gt;");
	});
});

describe("clipToLimit", () => {
	test("passes short messages through untouched", () => {
		expect(clipToLimit("short")).toBe("short");
	});

	test("clips oversized messages with a visible marker", () => {
		const clipped = clipToLimit("x".repeat(TELEGRAM_MESSAGE_LIMIT + 500));
		expect(clipped.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_LIMIT);
		expect(clipped.endsWith("… (truncated)")).toBe(true);
	});
});

describe("pageFooter", () => {
	test("is empty for a single page", () => {
		expect(pageFooter(1, 1)).toBe("");
	});

	test("numbers the pages otherwise", () => {
		expect(pageFooter(2, 5)).toBe("\n<i>Page 2 of 5</i>");
	});
});

describe("help and login prompt", () => {
	test("the help lists /newticket only for ticket creators", () => {
		const manager = renderHelp(["DEPT_HEAD"]);
		const employee = renderHelp(["EMPLOYEE"]);
		expect(manager).toContain("/newticket");
		expect(employee).not.toContain("/newticket");
	});

	test("the login prompt names the preferred flow first", () => {
		const prompt = renderLoginPrompt();
		expect(prompt.indexOf("/link")).toBeGreaterThan(-1);
		expect(prompt.indexOf("/link")).toBeLessThan(prompt.indexOf("/login"));
	});
});
