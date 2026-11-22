/**
 * The file sink: appending, bounded, and safe to fail.
 *
 * Every case runs in its own temp directory — the suite never writes into
 * `backend/data/`, which is what keeps it hermetic.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileSink } from "./file-sink";

const roots: string[] = [];

/** A fresh empty directory; removed when the test file finishes. */
function tempDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "mes-log-sink-"));
	roots.push(directory);
	return directory;
}

afterEach(() => {
	while (roots.length > 0) {
		rmSync(roots.pop() as string, { recursive: true, force: true });
	}
});

/** A fixed-length event line, so the size arithmetic below is exact. */
function event(index: number): string {
	return `event-${String(index).padStart(3, "0")} ${"x".repeat(80)}`;
}

describe("appending", () => {
	test("creates the directory on first use and writes one event per line", () => {
		const directory = join(tempDirectory(), "logs");
		const sink = createFileSink({ directory });

		sink.write("first event");
		sink.write("second event");

		expect(existsSync(directory)).toBe(true);
		const written = readFileSync(sink.path, "utf8");
		expect(written).toBe("first event\nsecond event\n");
		// One event per line: no blank lines and no trailing half-line.
		expect(written.split("\n").filter((line) => line !== "")).toHaveLength(2);
	});

	test("a second sink over the same directory appends rather than truncating", () => {
		const directory = join(tempDirectory(), "logs");
		createFileSink({ directory }).write("run one, first event");

		// A new run — a fresh process would build a fresh sink for the same
		// configured directory.
		const second = createFileSink({ directory });
		second.write("run two, first event");
		second.write("run two, second event");

		expect(
			readFileSync(second.path, "utf8").split("\n").filter(Boolean),
		).toEqual([
			"run one, first event",
			"run two, first event",
			"run two, second event",
		]);
	});
});

describe("rotation by size", () => {
	// Each event line is 91 bytes on disk; the live file takes two before the
	// third would carry it past the 250-byte bound.
	const MAX_BYTES = 250;

	test("rolls at the bound, shifts the retained files, and discards the oldest", () => {
		const directory = tempDirectory();
		const sink = createFileSink({
			directory,
			maxBytes: MAX_BYTES,
			keepFiles: 2,
		});

		for (let index = 1; index <= 8; index += 1) sink.write(event(index));

		const lines = (name: string): string =>
			readFileSync(join(directory, name), "utf8");

		// The live file holds the newest events.
		const live = lines("mes-backend.log");
		expect(live).toContain("event-007");
		expect(live).toContain("event-008");
		expect(live).not.toContain("event-001");

		// The retained count is respected: the live file plus two rolled files.
		expect(existsSync(join(directory, "mes-backend.1.log"))).toBe(true);
		expect(lines("mes-backend.1.log")).toContain("event-005");
		expect(lines("mes-backend.1.log")).toContain("event-006");
		expect(lines("mes-backend.2.log")).toContain("event-003");
		expect(lines("mes-backend.2.log")).toContain("event-004");
		expect(existsSync(join(directory, "mes-backend.3.log"))).toBe(false);

		// The oldest files were discarded, not merely shifted out of view.
		expect(lines("mes-backend.2.log")).not.toContain("event-001");
		expect(lines("mes-backend.2.log")).not.toContain("event-002");
	});

	test("a bound smaller than one line discards a file per event without stalling", () => {
		const directory = tempDirectory();
		const sink = createFileSink({ directory, maxBytes: 8, keepFiles: 1 });

		expect(() => {
			sink.write("an event far past the bound");
			sink.write("a second one");
		}).not.toThrow();

		// The newest event is the live file's only line, and the run continues.
		expect(readFileSync(sink.path, "utf8")).toBe("a second one\n");
		expect(sink.active).toBe(true);
	});

	test("a rolled file name keeps the configured base name's extension", () => {
		const directory = tempDirectory();
		const sink = createFileSink({
			directory,
			fileName: "run.txt",
			maxBytes: 250,
			keepFiles: 2,
		});

		for (let index = 1; index <= 4; index += 1) sink.write(event(index));

		expect(existsSync(join(directory, "run.txt"))).toBe(true);
		expect(existsSync(join(directory, "run.1.txt"))).toBe(true);
	});
});

describe("an unusable directory", () => {
	test("a failed write disables the sink instead of throwing or pretending", () => {
		const directory = tempDirectory();
		// A path *under a file*: the directory cannot be created on any system,
		// root included, because the parent is not a directory.
		const blocker = join(directory, "not-a-directory");
		writeFileSync(blocker, "in the way");
		const sink = createFileSink({ directory: join(blocker, "logs") });

		expect(() => sink.write("an event with nowhere to go")).not.toThrow();
		expect(existsSync(sink.path)).toBe(false);
		expect(sink.active).toBe(false);

		// Disabled for the rest of the run: later events are dropped quietly.
		expect(() => sink.write("a later event")).not.toThrow();
		expect(sink.active).toBe(false);
	});

	test("prepare surfaces an unusable directory at startup, with the path", () => {
		const directory = tempDirectory();
		const blocker = join(directory, "not-a-directory");
		writeFileSync(blocker, "in the way");
		const sink = createFileSink({ directory: join(blocker, "logs") });

		expect(() => sink.prepare()).toThrow(/log directory could not be created/);
		expect(() => sink.prepare()).toThrow(blocker);
	});

	test("a failed roll disables the sink rather than throwing mid-write", () => {
		const directory = tempDirectory();
		const sink = createFileSink({ directory, maxBytes: 250, keepFiles: 1 });
		sink.write(event(1));
		sink.write(event(2));

		// Replace the live file with a directory so the roll cannot rename it.
		rmSync(sink.path, { force: true });
		mkdirSync(sink.path);

		expect(() => sink.write(event(3))).not.toThrow();
		expect(sink.active).toBe(false);
	});
});
