/**
 * Run logging.
 *
 * `logger` is the recording surface — four levels, one line per event — and
 * `file-sink` is the durable half: an appending file that rolls at a size
 * bound. `bootstrap()` composes the two into the service's logger; every other
 * construction site receives the silent default.
 */

export {
	createFileSink,
	DEFAULT_LOG_FILE_NAME,
	DEFAULT_LOG_KEEP_FILES,
	DEFAULT_LOG_MAX_BYTES,
	type FileSink,
	type FileSinkOptions,
} from "./file-sink";
export {
	createLogger,
	createSilentLogger,
	describeFailure,
	LOG_LEVELS,
	type Logger,
	type LoggerOptions,
	type LogLevel,
	type Redactor,
} from "./logger";
