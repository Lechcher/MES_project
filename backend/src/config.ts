/**
 * Environment configuration for the MES backend.
 *
 * All runtime configuration is read here so that no other module touches
 * `process.env` directly. Required values are validated eagerly and reported
 * together, so a misconfigured service fails at startup with an actionable
 * message rather than at first use.
 */

export type ServiceEnv = "development" | "test" | "production";

/**
 * A validated SMTP endpoint.
 *
 * Derived from `MES_SMTP_URL`; carries no credential material, so it is safe to
 * log or include in a diagnostic message.
 */
export interface MailEndpoint {
	/** The configured value, passed to the transport unchanged. */
	readonly url: string;
	readonly scheme: "smtp" | "smtps";
	readonly host: string;
	readonly port: number;
	/** TLS is established before the SMTP conversation begins. */
	readonly secure: boolean;
	readonly hasCredentials: boolean;
}

/**
 * Object-storage connection for ticket attachments.
 *
 * Path-style S3 against the Garage bucket documented in
 * `docs/garage-s3-clients.md`. Carries credential material, so it is never
 * logged or included in a diagnostic message.
 */
export interface StorageSettings {
	readonly endpoint: string;
	readonly region: string;
	readonly bucket: string;
	readonly accessKeyId: string;
	readonly secretAccessKey: string;
}

/** Default per-file upload ceiling: 25 MB. */
export const DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Default number of files one bulk upload request may carry. */
export const DEFAULT_MAX_FILES_PER_REQUEST = 20;

export interface AppConfig {
	readonly env: ServiceEnv;
	readonly isProduction: boolean;
	readonly isDevelopment: boolean;
	readonly isTest: boolean;
	/** Signs Better Auth sessions. */
	readonly authSecret: string;
	/** Base URL of this service, used by Better Auth for callback links. */
	readonly authUrl: string;
	/** Absolute or backend-relative path to the SQLite database file. */
	readonly databasePath: string;
	readonly port: number;
	/** Browser origin allowed by CORS. */
	readonly webOrigin: string;
	/** Directory where generated print/export artifacts are written. */
	readonly exportDir: string;
	/** Object storage for attachments; `null` when no storage is configured. */
	readonly storage: StorageSettings | null;
	/** Maximum size of one uploaded file, in bytes. */
	readonly uploadMaxFileBytes: number;
	/** Maximum number of files one upload request may carry. */
	readonly uploadMaxFilesPerRequest: number;
	/** Sender identity used for password-reset mail. */
	readonly resetEmailFrom: string;
	/** SMTP endpoint; when unset, reset delivery is reported as unavailable. */
	readonly smtpUrl: string | null;
	/** The parsed form of `smtpUrl`, or `null` when no endpoint is configured. */
	readonly mailEndpoint: MailEndpoint | null;
	/** Outbound Telegram notifications are dispatched only when nothing disables them. */
	readonly allowOutboundNotifications: boolean;
}

export class ConfigurationError extends Error {
	constructor(
		message: string,
		readonly missing: readonly string[] = [],
	) {
		super(message);
		this.name = "ConfigurationError";
	}
}

type Env = Record<string, string | undefined>;

function resolveEnv(env: Env): ServiceEnv {
	const raw = (env.NODE_ENV ?? "development").toLowerCase();
	if (raw === "production" || raw === "test" || raw === "development") {
		return raw;
	}
	throw new ConfigurationError(
		`NODE_ENV must be one of development, test, production (received "${raw}").`,
	);
}

function resolvePort(env: Env): number {
	const raw = env.MES_API_PORT;
	if (raw === undefined || raw === "") return 3001;
	const port = Number(raw);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new ConfigurationError(
			`MES_API_PORT must be an integer between 1 and 65535 (received "${raw}").`,
		);
	}
	return port;
}

/**
 * Read a positive integer limit.
 *
 * An unset or empty value uses the documented default; anything that is not a
 * positive integer is a misconfiguration and fails immediately, because a
 * silently clamped limit would reject valid uploads.
 */
function resolveLimit(env: Env, name: string, fallback: number): number {
	const raw = env[name];
	if (raw === undefined || raw.trim() === "") return fallback;
	const value = Number(raw.trim());
	if (!Number.isInteger(value) || value <= 0) {
		throw new ConfigurationError(
			`${name} must be a positive integer (received "${raw}").`,
			[name],
		);
	}
	return value;
}

/**
 * Read the object-storage group.
 *
 * All five values are required together: a half-configured bucket would surface
 * as an authentication failure at the first upload rather than at startup, so
 * the whole group is reported as missing at once. With nothing set, storage is
 * simply unavailable (`null`) and attachment uploads report that explicitly.
 */
function resolveStorage(env: Env): {
	settings: StorageSettings | null;
	missing: string[];
} {
	const endpoint = env.S3_ENDPOINT?.trim() ?? "";
	const region = env.S3_REGION?.trim() ?? "";
	const bucket = env.S3_BUCKET?.trim() ?? "";
	const accessKeyId = env.S3_ACCESS_KEY_ID?.trim() ?? "";
	const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim() ?? "";
	const anySet =
		endpoint !== "" ||
		region !== "" ||
		bucket !== "" ||
		accessKeyId !== "" ||
		secretAccessKey !== "";

	if (!anySet) return { settings: null, missing: [] };

	const missing: string[] = [];
	if (endpoint === "") missing.push("S3_ENDPOINT");
	if (bucket === "") missing.push("S3_BUCKET");
	if (accessKeyId === "") missing.push("S3_ACCESS_KEY_ID");
	if (secretAccessKey === "") missing.push("S3_SECRET_ACCESS_KEY");

	return {
		settings:
			missing.length > 0
				? null
				: {
						endpoint,
						region: region === "" ? "garage" : region,
						bucket,
						accessKeyId,
						secretAccessKey,
					},
		missing,
	};
}

/**
 * Build the runtime configuration.
 *
 * @param env - Environment source, injectable for tests.
 * @param options - `requireSecrets` is disabled for the `test` environment so
 *   unit tests can boot without a full deployment configuration.
 */
export function loadConfig(
	env: Env = process.env,
	options: { requireSecrets?: boolean } = {},
): AppConfig {
	const serviceEnv = resolveEnv(env);
	const isTest = serviceEnv === "test";
	const requireSecrets = options.requireSecrets ?? !isTest;

	const authSecret = env.BETTER_AUTH_SECRET?.trim() ?? "";
	const authUrl = env.BETTER_AUTH_URL?.trim() ?? "";

	const missing: string[] = [];
	if (requireSecrets) {
		if (authSecret === "") missing.push("BETTER_AUTH_SECRET");
		if (authUrl === "") missing.push("BETTER_AUTH_URL");
	}

	const storage = resolveStorage(env);
	if (storage.settings === null) missing.push(...storage.missing);

	if (missing.length > 0) {
		throw new ConfigurationError(
			`Missing required configuration: ${missing.join(", ")}. ` +
				"Copy backend/.env.example to backend/.env and set the listed values.",
			missing,
		);
	}

	const smtpUrl = env.MES_SMTP_URL?.trim() ?? "";
	const mailEndpoint = smtpUrl === "" ? null : parseMailEndpoint(smtpUrl);

	return {
		env: serviceEnv,
		isProduction: serviceEnv === "production",
		isDevelopment: serviceEnv === "development",
		isTest,
		authSecret: authSecret || "test-secret-not-for-production",
		authUrl: authUrl || "http://localhost:3001",
		databasePath: env.MES_DATABASE_PATH?.trim() || "./data/mes.db",
		port: resolvePort(env),
		webOrigin: env.MES_WEB_ORIGIN?.trim() || "http://localhost:3000",
		exportDir: env.MES_EXPORT_DIR?.trim() || "./data/exports",
		resetEmailFrom: env.MES_RESET_EMAIL_FROM?.trim() || "no-reply@mes.local",
		smtpUrl: smtpUrl === "" ? null : smtpUrl,
		mailEndpoint,
		storage: storage.settings,
		uploadMaxFileBytes: resolveLimit(
			env,
			"MES_UPLOAD_MAX_FILE_BYTES",
			DEFAULT_MAX_FILE_BYTES,
		),
		uploadMaxFilesPerRequest: resolveLimit(
			env,
			"MES_UPLOAD_MAX_FILES_PER_REQUEST",
			DEFAULT_MAX_FILES_PER_REQUEST,
		),
		allowOutboundNotifications: serviceEnv !== "test",
	};
}

/**
 * Replace the credential in a mail URL with a fixed mask.
 *
 * A mail URL carries a password, so it must never be echoed into a log or an
 * error message — including the messages this module raises about it. The match
 * is greedy within the authority because a provider username is often an email
 * address, so the first `@` is part of the username rather than the credential
 * boundary.
 */
export function redactMailUrl(raw: string): string {
	return raw.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/]*@/, "$1***:***@");
}

/**
 * Parse and validate the configured mail endpoint.
 *
 * The URL selects the transport mode, so a typo here would otherwise surface as
 * a puzzling authentication failure at the first password-reset request rather
 * than at startup.
 */
export function parseMailEndpoint(raw: string): MailEndpoint {
	const url = raw.trim();
	const shown = redactMailUrl(url);

	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new ConfigurationError(
			"MES_SMTP_URL must be a connection URL such as " +
				"smtp://user:password@host:587 or smtps://user:password@host:465 " +
				`(received "${shown}").`,
		);
	}

	if (parsed.protocol !== "smtp:" && parsed.protocol !== "smtps:") {
		throw new ConfigurationError(
			`MES_SMTP_URL must use the smtp:// or smtps:// scheme (received "${parsed.protocol}//").`,
		);
	}

	if (parsed.hostname === "") {
		throw new ConfigurationError(
			`MES_SMTP_URL must include a host (received "${shown}").`,
		);
	}

	const scheme = parsed.protocol === "smtps:" ? "smtps" : "smtp";
	const port =
		parsed.port === "" ? (scheme === "smtps" ? 465 : 587) : Number(parsed.port);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		throw new ConfigurationError(
			`MES_SMTP_URL must use a port between 1 and 65535 (received "${parsed.port}").`,
		);
	}

	// A username without a password (or the reverse) is a typo, not a mode.
	const hasUser = parsed.username !== "";
	const hasPassword = parsed.password !== "";
	if (hasUser !== hasPassword) {
		throw new ConfigurationError(
			"MES_SMTP_URL supplies a username without a password, or a password " +
				"without a username. Provide both, or neither for an unauthenticated server.",
		);
	}

	return {
		url,
		scheme,
		host: parsed.hostname,
		port,
		// `smtps` is TLS from the start; nodemailer also secures port 465.
		secure: scheme === "smtps" || port === 465,
		hasCredentials: hasUser && hasPassword,
	};
}

/** Fail fast at process start when configuration is incomplete. */
export function assertConfig(config: AppConfig): void {
	if (
		config.isProduction &&
		config.authSecret === "test-secret-not-for-production"
	) {
		throw new ConfigurationError(
			"Refusing to start in production with the development auth secret.",
			["BETTER_AUTH_SECRET"],
		);
	}
	// Attachment storage is a production capability of the Jobs module: a
	// deployment without it would accept a completion request and then fail at
	// the first upload, so it is reported here instead of at first use.
	if (config.isProduction && config.storage === null) {
		throw new ConfigurationError(
			"Production requires attachment storage: set S3_ENDPOINT, " +
				"S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY " +
				"(see docs/garage-s3-clients.md).",
			["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
		);
	}
}
