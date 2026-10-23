import { describe, expect, test } from "bun:test";
import {
	assertConfig,
	ConfigurationError,
	loadConfig,
	redactMailUrl,
} from "./config";

describe("loadConfig", () => {
	test("reports every missing required value together", () => {
		expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
			ConfigurationError,
		);

		try {
			loadConfig({ NODE_ENV: "production" });
		} catch (error) {
			const failure = error as ConfigurationError;
			expect(failure.missing).toContain("BETTER_AUTH_SECRET");
			expect(failure.missing).toContain("BETTER_AUTH_URL");
			expect(failure.message).toContain("BETTER_AUTH_SECRET");
			expect(failure.message).toContain(".env.example");
		}
	});

	test("accepts a fully configured environment", () => {
		const config = loadConfig({
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: "a-real-secret",
			BETTER_AUTH_URL: "https://mes.example.com",
			MES_DATABASE_PATH: "/var/lib/mes/mes.db",
			MES_API_PORT: "8080",
		});

		expect(config.isProduction).toBe(true);
		expect(config.authSecret).toBe("a-real-secret");
		expect(config.authUrl).toBe("https://mes.example.com");
		expect(config.databasePath).toBe("/var/lib/mes/mes.db");
		expect(config.port).toBe(8080);
	});

	test("relaxes secret requirements in the test environment", () => {
		const config = loadConfig({ NODE_ENV: "test" });
		expect(config.isTest).toBe(true);
		expect(config.authSecret.length).toBeGreaterThan(0);
	});

	test("defaults optional values", () => {
		const config = loadConfig({
			NODE_ENV: "development",
			BETTER_AUTH_SECRET: "s",
			BETTER_AUTH_URL: "http://localhost:3001",
		});
		expect(config.port).toBe(3001);
		expect(config.databasePath).toBe("./data/mes.db");
		expect(config.exportDir).toBe("./data/exports");
		expect(config.webOrigin).toBe("http://localhost:3000");
		expect(config.smtpUrl).toBeNull();
		expect(config.resetEmailFrom).toBe("no-reply@mes.local");
	});

	test("records a configured mail sender", () => {
		const config = loadConfig({
			NODE_ENV: "development",
			BETTER_AUTH_SECRET: "s",
			BETTER_AUTH_URL: "http://localhost:3001",
			MES_SMTP_URL: "smtp://localhost:1025",
		});
		expect(config.smtpUrl).toBe("smtp://localhost:1025");
	});

	test("rejects an invalid port", () => {
		expect(() =>
			loadConfig({ NODE_ENV: "test", MES_API_PORT: "not-a-port" }),
		).toThrow(ConfigurationError);
	});

	test("rejects an unknown environment", () => {
		expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(
			ConfigurationError,
		);
	});
});

describe("mail endpoint validation", () => {
	const ZOHO_TLS =
		"smtps://lechcher@zohomail.com:app-password@smtp.zoho.com:465";
	const ZOHO_STARTTLS =
		"smtp://lechcher@zohomail.com:app-password@smtp.zoho.com:587";
	const LOCAL = "smtp://localhost:1025";

	test("accepts an implicit-TLS endpoint with credentials", () => {
		const config = loadConfig({ NODE_ENV: "test", MES_SMTP_URL: ZOHO_TLS });

		expect(config.mailEndpoint).toEqual({
			url: ZOHO_TLS,
			scheme: "smtps",
			host: "smtp.zoho.com",
			port: 465,
			secure: true,
			hasCredentials: true,
		});
	});

	test("accepts a STARTTLS endpoint with credentials", () => {
		const endpoint = loadConfig({
			NODE_ENV: "test",
			MES_SMTP_URL: ZOHO_STARTTLS,
		}).mailEndpoint;

		expect(endpoint?.scheme).toBe("smtp");
		expect(endpoint?.port).toBe(587);
		expect(endpoint?.secure).toBe(false);
		expect(endpoint?.hasCredentials).toBe(true);
	});

	test("accepts a local unauthenticated endpoint", () => {
		const endpoint = loadConfig({
			NODE_ENV: "test",
			MES_SMTP_URL: LOCAL,
		}).mailEndpoint;

		expect(endpoint?.host).toBe("localhost");
		expect(endpoint?.port).toBe(1025);
		expect(endpoint?.secure).toBe(false);
		expect(endpoint?.hasCredentials).toBe(false);
	});

	test("defaults the port from the scheme", () => {
		expect(
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "smtp://mail.host" })
				.mailEndpoint?.port,
		).toBe(587);
		expect(
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "smtps://mail.host" })
				.mailEndpoint?.port,
		).toBe(465);
	});

	test("treats port 465 as secure even on the smtp scheme", () => {
		expect(
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "smtp://mail.host:465" })
				.mailEndpoint?.secure,
		).toBe(true);
	});

	test("is null when no endpoint is configured", () => {
		expect(loadConfig({ NODE_ENV: "test" }).mailEndpoint).toBeNull();
		expect(
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "   " }).mailEndpoint,
		).toBeNull();
	});

	test("rejects an unsupported scheme", () => {
		expect(() =>
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "http://mail.host:465" }),
		).toThrow(/smtp:\/\/ or smtps:\/\//);
	});

	test("rejects a missing host", () => {
		expect(() =>
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "smtp://:465" }),
		).toThrow(ConfigurationError);
	});

	test("rejects a nonsense value", () => {
		expect(() =>
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "not a mail url" }),
		).toThrow(/must be a connection URL/);
	});

	test("rejects an out-of-range port", () => {
		for (const value of ["smtp://mail.host:0", "smtp://mail.host:99999"]) {
			expect(() =>
				loadConfig({ NODE_ENV: "test", MES_SMTP_URL: value }),
			).toThrow(ConfigurationError);
		}
	});

	test("rejects a username without a password, and the reverse", () => {
		expect(() =>
			loadConfig({ NODE_ENV: "test", MES_SMTP_URL: "smtp://user@mail.host" }),
		).toThrow(/username without a password/);
		expect(() =>
			loadConfig({
				NODE_ENV: "test",
				MES_SMTP_URL: "smtp://:secret@mail.host",
			}),
		).toThrow(ConfigurationError);
	});

	test("never echoes the credential in a validation failure", () => {
		const secrets = [
			// Invalid scheme, but the credential is still in the value.
			"http://user:sup3r-s3cret@mail.host:465",
			// Invalid port, credential present.
			"smtp://user:sup3r-s3cret@mail.host:99999",
			// Username without password.
			"smtp://sup3r-s3cret@mail.host",
		];

		for (const value of secrets) {
			let message = "";
			try {
				loadConfig({ NODE_ENV: "test", MES_SMTP_URL: value });
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).not.toContain("sup3r-s3cret");
		}
	});

	test("redacts the credential when a mail URL is shown", () => {
		expect(redactMailUrl(ZOHO_TLS)).toBe("smtps://***:***@smtp.zoho.com:465");
		expect(redactMailUrl(LOCAL)).toBe(LOCAL);
	});
});

describe("assertConfig", () => {
	test("refuses to start in production with the development secret", () => {
		const config = loadConfig({ NODE_ENV: "test" });
		expect(() =>
			assertConfig({ ...config, env: "production", isProduction: true }),
		).toThrow(ConfigurationError);
	});

	test("allows a development environment", () => {
		const config = loadConfig({
			NODE_ENV: "development",
			BETTER_AUTH_SECRET: "a-development-secret",
			BETTER_AUTH_URL: "http://localhost:3001",
		});
		expect(() => assertConfig(config)).not.toThrow();
	});
});

describe("attachment storage configuration", () => {
	const COMPLETE_STORAGE = {
		S3_ENDPOINT: "http://localhost:3900",
		S3_REGION: "garage",
		S3_BUCKET: "ticket-jobs-attachment-files",
		S3_ACCESS_KEY_ID: "GKabcdef",
		S3_SECRET_ACCESS_KEY: "a-secret-key",
	} as const;

	test("accepts a complete storage configuration", () => {
		const config = loadConfig({
			NODE_ENV: "test",
			...COMPLETE_STORAGE,
		});
		expect(config.storage).toEqual({
			endpoint: "http://localhost:3900",
			region: "garage",
			bucket: "ticket-jobs-attachment-files",
			accessKeyId: "GKabcdef",
			secretAccessKey: "a-secret-key",
		});
	});

	test("defaults the region to garage", () => {
		const config = loadConfig({
			NODE_ENV: "test",
			...COMPLETE_STORAGE,
			S3_REGION: "",
		});
		expect(config.storage?.region).toBe("garage");
	});

	test("reports a missing credential together with the other storage values", () => {
		expect(() =>
			loadConfig({
				NODE_ENV: "production",
				BETTER_AUTH_SECRET: "s",
				BETTER_AUTH_URL: "http://localhost:3001",
				S3_ENDPOINT: "http://localhost:3900",
				S3_BUCKET: "ticket-jobs-attachment-files",
				S3_SECRET_ACCESS_KEY: "a-secret-key",
			}),
		).toThrow(/S3_ACCESS_KEY_ID/);
	});

	test("reports every missing storage value at once", () => {
		try {
			loadConfig({
				NODE_ENV: "production",
				BETTER_AUTH_SECRET: "s",
				BETTER_AUTH_URL: "http://localhost:3001",
				S3_ENDPOINT: "http://localhost:3900",
			});
		} catch (error) {
			const failure = error as ConfigurationError;
			expect(failure.missing).toContain("S3_BUCKET");
			expect(failure.missing).toContain("S3_ACCESS_KEY_ID");
			expect(failure.missing).toContain("S3_SECRET_ACCESS_KEY");
			expect(failure.missing).not.toContain("S3_ENDPOINT");
		}
	});

	test("leaves storage unavailable when nothing is configured", () => {
		const config = loadConfig({ NODE_ENV: "test" });
		expect(config.storage).toBeNull();
	});

	test("rejects a non-positive upload limit", () => {
		for (const name of [
			"MES_UPLOAD_MAX_FILE_BYTES",
			"MES_UPLOAD_MAX_FILES_PER_REQUEST",
		]) {
			for (const value of ["0", "-1", "not-a-number"]) {
				expect(() => loadConfig({ NODE_ENV: "test", [name]: value })).toThrow(
					ConfigurationError,
				);
			}
		}
	});

	test("applies the documented upload defaults", () => {
		const config = loadConfig({ NODE_ENV: "test" });
		expect(config.uploadMaxFileBytes).toBe(25 * 1024 * 1024);
		expect(config.uploadMaxFilesPerRequest).toBe(20);
	});

	test("accepts a configured upload limit above the default", () => {
		const config = loadConfig({
			NODE_ENV: "test",
			MES_UPLOAD_MAX_FILE_BYTES: String(50 * 1024 * 1024),
			MES_UPLOAD_MAX_FILES_PER_REQUEST: "5",
		});
		expect(config.uploadMaxFileBytes).toBe(50 * 1024 * 1024);
		expect(config.uploadMaxFilesPerRequest).toBe(5);
	});

	test("refuses to start in production without storage", () => {
		const config = loadConfig({
			NODE_ENV: "production",
			BETTER_AUTH_SECRET: "s",
			BETTER_AUTH_URL: "http://localhost:3001",
		});
		expect(() => assertConfig(config)).toThrow(/S3_ENDPOINT/);
	});
});
