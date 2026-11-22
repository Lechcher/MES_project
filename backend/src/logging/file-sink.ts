/**
 * The durable log sink: an appending file, bounded in size.
 *
 * Each recorded line is appended synchronously — a crash mid-run must not lose
 * the line that explains it, which is the whole point of writing one. The
 * live file rolls when it reaches its size bound, a bounded number of rolled
 * files are retained, and the oldest is discarded first.
 *
 * A failure here — an unwritable directory, a roll that cannot complete —
 * disables the sink for the rest of the run instead of throwing into a
 * request: a debug tool must not take the service down with it.
 */

import {
	appendFileSync,
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	statSync,
} from "node:fs";
import { join } from "node:path";

/** Default base name of the live log file. */
export const DEFAULT_LOG_FILE_NAME = "mes-backend.log";

/** Default size at which the live file rolls: 5 MB. */
export const DEFAULT_LOG_MAX_BYTES = 5 * 1024 * 1024;

/** Default number of rolled files retained besides the live one. */
export const DEFAULT_LOG_KEEP_FILES = 3;

export interface FileSinkOptions {
	/** Directory the log files live in; created on first use. */
	directory: string;
	/** Base name of the live log file. Default `mes-backend.log`. */
	fileName?: string;
	/** Size at which the live file rolls. Default 5 MB. */
	maxBytes?: number;
	/** Rolled files retained besides the live one. Default 3. */
	keepFiles?: number;
}

export interface FileSink {
	/** Path of the live log file. */
	readonly path: string;
	/** False once a failed write or roll has disabled the sink for this run. */
	readonly active: boolean;
	/**
	 * Create the directory now, so an unusable path surfaces at startup
	 * rather than at the first recorded event. Throws when it cannot.
	 */
	prepare(): void;
	/**
	 * Append one formatted line, rolling the live file first when it has
	 * reached its bound. Never throws: a failure disables the sink.
	 */
	write(line: string): void;
}

export function createFileSink(options: FileSinkOptions): FileSink {
	const directory = options.directory;
	const fileName = options.fileName ?? DEFAULT_LOG_FILE_NAME;
	const maxBytes = options.maxBytes ?? DEFAULT_LOG_MAX_BYTES;
	const keepFiles = Math.max(0, options.keepFiles ?? DEFAULT_LOG_KEEP_FILES);

	const livePath = join(directory, fileName);
	// `mes-backend.log` rolls to `mes-backend.1.log`, then `.2`, ... — every
	// name still ends in `.log`, which the repository's `.gitignore` covers.
	const rolledPath = (index: number): string =>
		join(directory, rolledName(fileName, index));

	let active = true;
	let directoryReady = false;

	function prepare(): void {
		try {
			mkdirSync(directory, { recursive: true });
		} catch (cause) {
			throw new Error(
				`the log directory could not be created: ${directory} ` +
					`(${reasonOf(cause)})`,
				{ cause },
			);
		}
		directoryReady = true;
	}

	function sizeOf(path: string): number {
		try {
			return statSync(path).size;
		} catch {
			return 0;
		}
	}

	function roll(): void {
		if (keepFiles < 1) {
			// Nothing is retained: the live file is discarded, not renamed.
			rmSync(livePath, { force: true });
			return;
		}
		// Shift the retained files up first, from the oldest down, so the file
		// beyond the retained count is the one the next rename overwrites.
		for (let index = keepFiles - 1; index >= 1; index -= 1) {
			const from = rolledPath(index);
			if (existsSync(from)) renameSync(from, rolledPath(index + 1));
		}
		renameSync(livePath, rolledPath(1));
	}

	function write(line: string): void {
		if (!active) return;

		try {
			if (!directoryReady) {
				mkdirSync(directory, { recursive: true });
				directoryReady = true;
			}
			// Roll before appending when this line would carry the live file
			// past its bound; an empty file always takes the line, so a bound
			// smaller than one line discards a file per event, not every event.
			if (
				sizeOf(livePath) > 0 &&
				sizeOf(livePath) + line.length + 1 > maxBytes
			) {
				roll();
			}
			appendFileSync(livePath, `${line}\n`);
		} catch {
			// A failed roll or an unwritable directory disables the sink for
			// the rest of the run rather than throwing into a request.
			active = false;
		}
	}

	return {
		path: livePath,
		get active() {
			return active;
		},
		prepare,
		write,
	};
}

/** `mes-backend.log` becomes `mes-backend.1.log`; a name with no extension gains one. */
function rolledName(fileName: string, index: number): string {
	const dot = fileName.lastIndexOf(".");
	const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
	const extension = dot > 0 ? fileName.slice(dot) : "";
	return `${stem}.${index}${extension}`;
}

function reasonOf(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
