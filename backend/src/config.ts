/**
 * Environment configuration for the MES backend.
 *
 * All runtime configuration is read here so that no other module touches
 * `process.env` directly. Required values are validated eagerly and reported
 * together, so a misconfigured service fails at startup with an actionable
 * message rather than at first use.
 */

import {
	DEFAULT_LOG_FILE_NAME,
	DEFAULT_LOG_KEEP_FILES,
	DEFAULT_LOG_MAX_BYTES,
	LOG_LEVELS,
	type LogLevel,
} from "./logging";

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

/**
 * Shopify commerce module credentials.
 *
 * The API key/secret pair drives the OAuth handshake; the token encryption
 * key protects every stored access token at rest (AES-256-GCM). All-or-nothing
 * like the storage group: a half-configured pair would surface as a failed
 * handshake or an unreadable token rather than at startup. With nothing set
 * the module stays unconfigured (`null`) and store connections are refused
 * with an explicit "commerce not configured" error.
 */
export interface ShopifySettings {
	readonly apiKey: string;
	readonly apiSecretKey: string;
	/** AES-256 key material for token encryption at rest; never logged. */
	readonly tokenEncryptionKey: string;
	/** Absolute URL of the OAuth callback; empty composes from `authUrl`. */
	readonly oauthCallbackUrl: string;
	/** Comma-separated OAuth access scopes; empty suits manual-token installs. */
	readonly scopes: string;
}

/**
 * Local development PostgreSQL endpoint.
 *
 * The credentials match the documented local Docker run command, so a fresh
 * checkout works against a container without any configuration.
 */
export const DEFAULT_DATABASE_URL = "postgres://mes:mes@localhost:5432/mes";

/** Default directory the service's log files are written to. */
export const DEFAULT_LOG_DIR = "./data/logs";

export interface AppConfig {
	readonly env: ServiceEnv;
	readonly isProduction: boolean;
	readonly isDevelopment: boolean;
	readonly isTest: boolean;
	/** Signs Better Auth sessions. */
	readonly authSecret: string;
	/** Base URL of this service, used by Better Auth for callback links. */
	readonly authUrl: string;
	/** PostgreSQL connection URL, e.g. `postgres://user:password@host:5432/db`. */
	readonly databaseUrl: string;
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
	/** Inbound Telegram bot: false keeps the bot inert (tests, unconfigured dev). */
	readonly telegramBotEnabled: boolean;
	/** Shopify commerce credentials; `null` when the module is not configured. */
	readonly shopify: ShopifySettings | null;
	/** Proactive back-off point for Shopify Admin API cost-throttle points. */
	readonly shopifyRateLimitThreshold: number;
	/** Telegram bot token; empty when the bot is configured only on the website. */
	readonly telegramBotToken: string;
	/** Base URL of the OpenAI-compatible endpoint the bot's agent calls. */
	readonly telegramAiBaseUrl: string;
	/** API key for that endpoint; empty when the endpoint needs none. */
	readonly telegramAiApiKey: string;
	/** Default model id for `/ask`; empty defers to the website setting. */
	readonly telegramAiDefaultModel: string;
	/** Per-user `/ask` query ceiling per 30-day window; 0 means unlimited. */
	readonly telegramAiMonthlyQuota: number;
	/** Lifetime of a website-generated bot link code, in minutes. */
	readonly telegramLinkCodeTtlMinutes: number;
	/**
	 * AES-256 key for linking Telegram account sessions, or `null` when
	 * unconfigured. Carries key material, so it is never logged or echoed; the
	 * multi-account Telegram module refuses to store a session when it is
	 * `null` or when it fails validation at startup.
	 */
	readonly telegramEncryptionKey: string | null;
	/** Directory the service's log files are written to. */
	readonly logDir: string;
	/** Minimum severity the service records; lower events are dropped. */
	readonly logLevel: LogLevel;
	/** Base name of the live log file. */
	readonly logFileName: string;
	/** Size at which the live log file rolls. */
	readonly logMaxBytes: number;
	/** Rolled log files retained besides the live one. */
	readonly logKeepFiles: number;
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
 * Read the Shopify commerce credential group.
 *
 * Same all-or-nothing rule as storage: any of the three values set requires
 * the rest. With nothing set the module is simply unconfigured.
 */
function resolveShopify(env: Env): {
	settings: ShopifySettings | null;
	missing: string[];
} {
	const apiKey = env.SHOPIFY_API_KEY?.trim() ?? "";
	const apiSecretKey = env.SHOPIFY_API_SECRET?.trim() ?? "";
	const tokenEncryptionKey = env.SHOPIFY_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
	const oauthCallbackUrl = env.SHOPIFY_OAUTH_CALLBACK_URL?.trim() ?? "";
	const scopes = env.SHOPIFY_SCOPES?.trim() ?? "";
	const anySet =
		apiKey !== "" || apiSecretKey !== "" || tokenEncryptionKey !== "";

	if (!anySet) return { settings: null, missing: [] };

	const missing: string[] = [];
	if (apiKey === "") missing.push("SHOPIFY_API_KEY");
	if (apiSecretKey === "") missing.push("SHOPIFY_API_SECRET");
	if (tokenEncryptionKey === "") missing.push("SHOPIFY_TOKEN_ENCRYPTION_KEY");

	return {
		settings:
			missing.length > 0
				? null
				: {
						apiKey,
						apiSecretKey,
						tokenEncryptionKey,
						oauthCallbackUrl,
						scopes,
					},
		missing,
	};
}

/**
 * Read and validate the minimum recorded severity.
 *
 * Anything outside the four accepted levels is a misconfiguration — a typo
 * would otherwise silently raise the floor to nothing, and the run would look
 * quiet because it recorded nothing.
 */
function resolveLogLevel(env: Env): LogLevel {
	const raw = env.MES_LOG_LEVEL?.trim() ?? "";
	if (raw === "") return "info";

	const level = raw.toLowerCase();
	if (!LOG_LEVELS.includes(level as LogLevel)) {
		throw new ConfigurationError(
			`MES_LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")} (received "${raw}").`,
			["MES_LOG_LEVEL"],
		);
	}
	return level as LogLevel;
}

/**
 * Read and validate the PostgreSQL connection URL.
 *
 * The scheme must be postgres/postgresql so a typo surfaces at startup as an
 * actionable message rather than a driver error on the first query. An unset
 * value falls back to the documented local default. The password is redacted
 * before the value is echoed into any error message.
 */
function resolveDatabaseUrl(env: Env): string {
	const raw = env.MES_DATABASE_URL?.trim() || DEFAULT_DATABASE_URL;

	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		throw new ConfigurationError(
			"MES_DATABASE_URL must be a connection URL such as " +
				"postgres://user:password@localhost:5432/mes " +
				`(received "${redactDatabaseUrl(raw)}").`,
			["MES_DATABASE_URL"],
		);
	}

	if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
		throw new ConfigurationError(
			"MES_DATABASE_URL must use the postgres:// or postgresql:// scheme " +
				`(received "${parsed.protocol}//...").`,
			["MES_DATABASE_URL"],
		);
	}

	if (parsed.hostname === "") {
		throw new ConfigurationError(
			"MES_DATABASE_URL must include a host " +
				`(received "${redactDatabaseUrl(raw)}").`,
			["MES_DATABASE_URL"],
		);
	}

	return raw;
}

/** Mask the password in a database URL for diagnostics. */
export function redactDatabaseUrl(raw: string): string {
	return raw.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^/]*@/, "$1***:***@");
}

/**
 * Read the Telegram session-encryption key.
 *
 * The key is 32 bytes as 64 hex characters. Unset leaves linking disabled
 * (the module refuses to store a session, per its spec); a malformed value is
 * a misconfiguration and fails at startup. The value is never echoed: the
 * malformed-key message names the variable and the expected shape only.
 */
function resolveTelegramEncryptionKey(env: Env): string | null {
	const raw = env.TELEGRAM_ENCRYPTION_KEY?.trim() ?? "";
	if (raw === "") return null;
	if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
		throw new ConfigurationError(
			"TELEGRAM_ENCRYPTION_KEY must be 32 bytes as 64 hex characters " +
				"(generate with: openssl rand -hex 32).",
			["TELEGRAM_ENCRYPTION_KEY"],
		);
	}
	return raw;
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

	const shopify = resolveShopify(env);
	if (shopify.settings === null) missing.push(...shopify.missing);

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
		databaseUrl: resolveDatabaseUrl(env),
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
		shopify: shopify.settings,
		shopifyRateLimitThreshold: resolveLimit(
			env,
			"SHOPIFY_RATE_LIMIT_THRESHOLD",
			150,
		),
		telegramBotEnabled:
			(env.TELEGRAM_BOT_ENABLED ?? "").trim().toLowerCase() === "true",
		telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
		telegramAiBaseUrl: env.TELEGRAM_AI_BASE_URL?.trim() ?? "",
		telegramAiApiKey: env.TELEGRAM_AI_API_KEY?.trim() ?? "",
		telegramAiDefaultModel: env.TELEGRAM_AI_MODEL?.trim() ?? "",
		telegramAiMonthlyQuota: resolveLimit(env, "TELEGRAM_AI_MONTHLY_QUOTA", 100),
		telegramLinkCodeTtlMinutes: resolveLimit(
			env,
			"TELEGRAM_LINK_CODE_TTL_MINUTES",
			10,
		),
		telegramEncryptionKey: resolveTelegramEncryptionKey(env),
		logDir: env.MES_LOG_DIR?.trim() || DEFAULT_LOG_DIR,
		logLevel: resolveLogLevel(env),
		logFileName: env.MES_LOG_FILE?.trim() || DEFAULT_LOG_FILE_NAME,
		logMaxBytes: resolveLimit(env, "MES_LOG_MAX_BYTES", DEFAULT_LOG_MAX_BYTES),
		logKeepFiles: resolveLimit(
			env,
			"MES_LOG_KEEP_FILES",
			DEFAULT_LOG_KEEP_FILES,
		),
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
