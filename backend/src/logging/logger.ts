/**
 * Run logging.
 *
 * The service records what it does as it runs — lifecycle, failures, delivery
 * outcomes — so a problem can be reviewed afterwards instead of reproduced
 * live. Four severities, one line per event, and every sink receives the same
 * redacted line, so a secret cannot reach either one.
 *
 * The logger is injected (see `ServiceDependencies.logging` in
 * `../index.ts`): a service built without one records nothing, which is what
 * keeps the automated suite quiet and hermetic. Only `bootstrap()` constructs
 * the real one.
 */

/** Severities in increasing order; a logger records at or above its level. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** The four accepted levels, for configuration validation. */
export const LOG_LEVELS: readonly LogLevel[] = [
	"debug",
	"info",
	"warn",
	"error",
];

const LEVEL_WEIGHT: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

/** One line per event: the service's reporting surface. */
export interface Logger {
	debug(message: string): void;
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

/** Removes credential material from a line before any sink sees it. */
export type Redactor = (text: string) => string;

export interface LoggerOptions {
	/** Minimum severity recorded; lower events are dropped. Default `info`. */
	level?: LogLevel;
	/**
	 * Applied to every formatted line before a sink receives it. Redacting
	 * inside the logger — rather than at each call site — is what makes the
	 * guarantee hold for a call site that passes a raw string.
	 */
	redact?: Redactor;
	/** The terminal sink: the formatted line, with its severity. */
	terminal?: (line: string, level: LogLevel) => void;
	/** The durable sink: the same formatted line. */
	file?: (line: string) => void;
}

/** Build a logger over the given sinks. Without a sink, nothing is recorded. */
export function createLogger(options: LoggerOptions = {}): Logger {
	const minimum = LEVEL_WEIGHT[options.level ?? "info"];
	const redact = options.redact ?? ((text: string) => text);

	const record = (level: LogLevel, message: string): void => {
		if (LEVEL_WEIGHT[level] < minimum) return;

		// Both sinks receive the identical, already-redacted line, so neither
		// can record credential material even if a call site passed it raw.
		const line = redact(formatLine(level, message));
		// A failing sink must never break the caller: rotation disables a
		// broken file sink on its own, and a closed terminal is survivable.
		emit(options.terminal, line, level);
		emit(options.file, line, level);
	};

	return {
		debug: (message) => record("debug", message),
		info: (message) => record("info", message),
		warn: (message) => record("warn", message),
		error: (message) => record("error", message),
	};
}

/** A logger that records nothing: the default when none is injected. */
export function createSilentLogger(): Logger {
	return {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
}

/**
 * Render a thrown value for the log: what failed, and its stack.
 *
 * A stack repeats the message on its first line, so that line is dropped and
 * the frames follow the message — the logger flattens the rest onto one line.
 */
export function describeFailure(error: unknown): string {
	if (!(error instanceof Error)) return String(error);

	const head = `${error.name}: ${error.message}`;
	const frames = (error.stack ?? "").split(/\r?\n/).slice(1).join(" | ");
	return frames === "" ? head : `${head} | ${frames}`;
}

/** `<iso timestamp> <LEVEL> <message>`, always one line. */
function formatLine(level: LogLevel, message: string): string {
	return `${new Date().toISOString()} ${level.toUpperCase()} ${singleLine(message)}`;
}

/**
 * Flatten a multi-line message so one event stays one line.
 *
 * A stack trace is the multi-line case that matters: its frames follow the
 * message separated by ` | ` rather than breaking the one-event-per-line
 * record the log file is read back through.
 */
function singleLine(message: string): string {
	return message.replace(/[\r\n]+/g, " | ");
}

function emit(
	sink: ((line: string, level: LogLevel) => void) | undefined,
	line: string,
	level: LogLevel,
): void {
	if (!sink) return;
	try {
		// A sink that takes only the line is fine: it ignores the severity.
		sink(line, level);
	} catch {
		// A debug tool must not take the request down with it.
	}
}
