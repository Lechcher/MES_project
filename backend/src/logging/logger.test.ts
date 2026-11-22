/**
 * The logger: level gate, one line per event, and redaction inside the sink.
 *
 * The redaction cases matter most: a line that carries the mail endpoint's
 * credential — in plain or percent-encoded form — must never reach a sink,
 * because the guarantee is enforced in the logger rather than at the call site.
 */

import { describe, expect, test } from "bun:test";
import { createCredentialScrubber } from "../mail";
import {
	createLogger,
	createSilentLogger,
	describeFailure,
	type LogLevel,
} from "./logger";

const APP_PASSWORD = "sup3r-s3cret-app-password";
const MAIL_URL = `smtps://lechcher@zohomail.com:${APP_PASSWORD}@smtp.zoho.com:465`;

/** A logger that records every line its terminal sink receives. */
function recordingLogger(
	options: { level?: LogLevel; redact?: (text: string) => string } = {},
) {
	const lines: string[] = [];
	const logger = createLogger({
		level: options.level,
		redact: options.redact,
		terminal: (line) => lines.push(line),
	});
	return { lines, logger };
}

describe("the level gate", () => {
	test("an event below the configured level is not recorded", () => {
		const { lines, logger } = recordingLogger({ level: "warn" });

		logger.debug("a debug detail");
		logger.info("an informational note");
		logger.warn("a warning");
		logger.error("a failure");

		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("WARN");
		expect(lines[1]).toContain("ERROR");
	});

	test("the default level records lifecycle and errors, not debug", () => {
		const { lines, logger } = recordingLogger();

		logger.debug("hidden");
		logger.info("shown");

		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("shown");
	});
});

describe("the recorded line", () => {
	test("carries its severity and its message", () => {
		const { lines, logger } = recordingLogger({ level: "debug" });

		logger.error("the password reset failed");

		const line = lines[0] ?? "";
		expect(line).toContain("ERROR");
		expect(line).toContain("the password reset failed");
	});

	test("carries the time the event occurred", () => {
		const { lines, logger } = recordingLogger();
		const before = Date.now();

		logger.info("an event");

		const line = lines[0] ?? "";
		// 2026-11-22T09:15:00.000Z — an ISO-8601 instant, not a bare counter.
		const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /.exec(line);
		expect(stamp).not.toBeNull();
		const recorded = stamp ? Date.parse(stamp[0].trim()) : Number.NaN;
		expect(Number.isNaN(recorded)).toBe(false);
		expect(recorded).toBeGreaterThanOrEqual(before - 1000);
		expect(recorded).toBeLessThanOrEqual(Date.now() + 1000);
	});

	test("a multi-line message stays one line", () => {
		const { lines, logger } = recordingLogger();

		logger.error("first line\nsecond line");

		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("first line | second line");
	});
});

describe("the silent logger", () => {
	test("records nothing on any level", () => {
		const logger = createSilentLogger();

		// Nothing to assert on: the contract is that these calls are no-ops
		// that keep a service built without a logger quiet.
		expect(() => {
			logger.debug("debug");
			logger.info("info");
			logger.warn("warn");
			logger.error("error");
		}).not.toThrow();
	});
});

describe("redaction inside the sink", () => {
	test("a line carrying the connection URL and both password spellings is masked", () => {
		const { lines, logger } = recordingLogger({
			redact: createCredentialScrubber(MAIL_URL),
		});

		logger.error(
			`delivery failed for ${MAIL_URL} using ${APP_PASSWORD} ` +
				`(encoded ${encodeURIComponent(APP_PASSWORD)})`,
		);

		expect(lines).toHaveLength(1);
		const line = lines[0] ?? "";
		expect(line).not.toContain(APP_PASSWORD);
		expect(line).not.toContain(encodeURIComponent(APP_PASSWORD));
		expect(line).toMatch(/\[redacted\]|\[mail endpoint\]/);
	});

	test("the file sink receives the same redacted line as the terminal", () => {
		const terminal: string[] = [];
		const file: string[] = [];
		const logger = createLogger({
			redact: createCredentialScrubber(MAIL_URL),
			terminal: (line) => terminal.push(line),
			file: (line) => file.push(line),
		});

		logger.error(`endpoint ${MAIL_URL} rejected the message`);

		expect(file).toEqual(terminal);
		expect(file[0]).not.toContain(APP_PASSWORD);
	});
});

describe("describeFailure", () => {
	test("renders the message and the stack on one line", () => {
		const rendered = describeFailure(
			new TypeError("export download broke", { cause: undefined }),
		);

		expect(rendered).toContain("TypeError: export download broke");
		// The stack repeats the message on its first line; it is dropped and
		// its frames follow, so the whole failure is one line.
		expect(rendered).toContain("at ");
		expect(rendered).not.toContain("\n");
		expect(rendered.startsWith("TypeError: export download broke")).toBe(true);
	});

	test("renders a non-error throw as its text", () => {
		expect(describeFailure("a bare string failure")).toBe(
			"a bare string failure",
		);
	});
});
